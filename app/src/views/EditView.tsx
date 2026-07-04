// L7c — EditView (ports src/Views/editpage.js verbatim; ARCHITECTURE §6/§10, views-2.md §4.1).
//
// Routes: `#editpage` / `#editpage?parent=N` (create mode) and `#editpage/:id` (edit mode). A full
// markup-page editor: a live/full Markup preview (imperative `convert`, driven by the exact
// update_preview scroll-pin math), header-section splitting, a raw-JSON metadata field, an appended
// Save button in the slot header, and an unsaved-changes guard (beforeunload + in-app confirm via
// `protect`). While its slot is focused it registers an active-editor exposing `Insert_Text` so the
// upload flow (FilePanel → Nav.view()) injects uploaded-file URLs into the editor textarea.
//
// PARITY NOTES — this view is deliberately IMPERATIVE (like the original BaseView), not idiomatic:
//   * The editor / raw-JSON textareas and every field are UNCONTROLLED. `Edit.insert` mutates the
//     editor via execCommand (undo history must survive), and the original assigns `.value`
//     directly. React only renders empty hosts; their values/children are set imperatively.
//   * The section <select> and the preview <scroll-inner> are imperative hosts (no JSX children),
//     so a re-render never clears the options React did not create or the markup `convert` output.
//   * All DOM listeners are wired imperatively (Init) so the editor/data `change` handlers keep the
//     NATIVE change (fires on blur) semantics — React's onChange fires per keystroke, which would
//     activate the modified/protect guard earlier than the original.
//   * Only three pieces of React state exist (horizontal / showPreview / wrapWS) because they drive
//     className / child-order / style that React must own; everything else lives on an instance ref.
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, Ref } from 'react'
import type {
  Content,
  EntityList,
  NavLocation,
  StartResult,
  ViewComponentProps,
} from '../data/types'
import { type RouteModule } from '../routing/view-registry'
import type { SlotHeader } from '../routing/SlotHeaderContext'
import { protect } from '../routing/protect'
import { Nav, setActiveEditor } from '../services/nav'
import { Edit } from '../services/edit'
import { convert } from '../services/markup'
import { print } from '../services/sidebar-log'
import { Req } from '../services/request'
import { Settings } from '../services/settings'
import { TYPES, CODES } from '../data/entity'
import { ABOUT } from '../data/about'
import { useResizable } from '../hooks/useResizable'

// editpage.js:132 Start — id==null ⇒ create (quick) flow; else fetch the content + its author.
function Start(loc: NavLocation): StartResult {
  const id = loc.id
  if (id == null) return { quick: true }
  return {
    chain: {
      values: { pid: id },
      requests: [
        { type: 'content', fields: '*', query: 'id = @pid' },
        { type: 'user', fields: '*', query: 'id IN @content.createUserId' },
      ],
    },
    check(resp) {
      return resp.content[0]
    },
  }
}

// navigate.js:66 add_header_links built each anchor from a {href,label,icon,target} descriptor; the
// port's SlotHeaderApi.add_header_links takes prebuilt Nodes, so that construction moves here
// (reproduced exactly). EditView's only link is the create-vs-edit "back" link (no icon).
interface HeaderLinkSpec {
  href: string
  label: string
  icon?: string
  target?: string
}
function build_header_link({ href, label, icon, target }: HeaderLinkSpec): HTMLAnchorElement {
  const a = document.createElement('a')
  a.href = href
  a.target = target || '_self'
  let lb = document.createElement('span')
  lb.textContent = label
  a.append(lb)
  if (icon) {
    lb = document.createElement('span')
    lb.className = 'text-shadow'
    lb.append(icon)
    a.prepend(lb)
  }
  return a
}

// editpage.js:219 find_sections builds these; `.all` is set (never read) for parity.
interface Section {
  name: string
  text: string
  lnl: string
}
type SectionArray = Section[] & { all?: { name: string } }

// The mutable per-view instance state (editpage.js:5-12, before Object.seal). Held on a ref so the
// imperative handlers read/write the same truth the original `this` did.
interface Inst {
  page: Content | null
  sections: SectionArray | null
  current_section: string | null
  sections_invalid: boolean
  text: string | null
  modified: boolean
  creating: boolean
  parent_id: number
  live_preview: boolean
}

// content field-writability metadata (ABOUT.details.types.content[k]) — used to pick which fields
// land in the raw-JSON editor.
const contentTypeInfo = ABOUT.details.types.content as unknown as Record<
  string,
  { writableOnInsert: boolean; writableOnUpdate: boolean } | undefined
>

function EditView({ data, loc, header }: ViewComponentProps): React.JSX.Element {
  // header exposes $header_extra only via the superset SlotHeader (frozen SlotHeaderApi omits it).
  const hdr = header as SlotHeader

  // The three render-owned bits (editpage.js: $root ROW/COL + child order, slide `shown`, wrap).
  const [horizontal, setHorizontal] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [wrapWS, setWrapWS] = useState<string | undefined>(undefined)

  // instance state (lazy-init once).
  const instRef = useRef<Inst | null>(null)
  if (!instRef.current)
    instRef.current = {
      page: null,
      sections: null,
      current_section: null,
      sections_invalid: true,
      text: null,
      modified: false,
      creating: false,
      parent_id: 0,
      live_preview: false,
    }
  const inst = instRef.current

  // DOM refs (the `$x` template ids).
  const rootRef = useRef<HTMLElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dataRef = useRef<HTMLTextAreaElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const typeRef = useRef<HTMLInputElement>(null)
  const keywordsRef = useRef<HTMLInputElement>(null)
  const markupRef = useRef<HTMLInputElement>(null)
  const sectionRef = useRef<HTMLSelectElement>(null)
  const previewRef = useRef<HTMLElement>(null)
  const previewOuterRef = useRef<HTMLElement>(null)
  const previewButtonRef = useRef<HTMLInputElement>(null)
  const liveButtonRef = useRef<HTMLInputElement>(null)
  const renderButtonRef = useRef<HTMLButtonElement>(null)
  const horizontalRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLInputElement>(null)

  // editpage.js:14 — ResizeBar($top,$resize,'top'|'right',null,'400'). `side` follows `horizontal`;
  // the hook recreates the bar on a side change (see the deviation in the return note).
  const { containerRef, handleRef } = useResizable(null, {
    side: horizontal ? 'right' : 'top',
    default: '400',
  })

  // mirror showPreview for the imperative handlers (which capture the mount render's closures).
  const showPreviewRef = useRef(showPreview)
  showPreviewRef.current = showPreview

  // rAF-coalescing counter for the editor `input` batch (editpage.js:53 `batch`).
  const inputRaf = useRef(0)

  // header nodes this mount appended (save button + back link) — removed on unmount so StrictMode's
  // double-invoke never duplicates them.
  const appendedHeaderRef = useRef<Element[]>([])
  const saveButtonRef = useRef<HTMLButtonElement | null>(null)
  const slotElRef = useRef<HTMLElement | null>(null)

  // editpage.js:247 update_preview — measure distance-from-bottom BEFORE the convert, render, then
  // pin to the bottom if we were within 20px of it. Stable (reads refs only).
  const update_preview = useCallback((full?: boolean): void => {
    const outer = previewOuterRef.current
    const prev = previewRef.current
    const ta = textareaRef.current
    const mk = markupRef.current
    if (!outer || !prev || !ta || !mk) return
    const shouldScroll = outer.scrollHeight - outer.clientHeight - outer.scrollTop
    convert(ta.value, mk.value, prev, { preview: !full })
    if (shouldScroll < 20) outer.scrollTop = 9e9
  }, [])

  // editpage.js:105 set_modified — beforeunload/confirm guard + save-button `modified` class.
  const set_modified = useCallback((state: boolean): void => {
    const slotEl = slotElRef.current
    if (slotEl) protect(slotEl, state)
    inst.modified = state
    saveButtonRef.current?.classList.toggle('modified', state)
  }, [inst])

  // editpage.js:208 toggle_preview — the `shown`/hidden slide toggles are render-driven off
  // showPreview; the convert/clear side effect runs in the showPreview layout effect below (so the
  // `shown` class is committed before update_preview measures the now-visible pane).
  const toggle_preview = useCallback((state: boolean): void => {
    showPreviewRef.current = state
    setShowPreview(state)
  }, [])

  // editpage.js:219 find_sections — split the full doc by markdown headers, rebuild the <select>.
  const find_sections = useCallback((): void => {
    const spl = (inst.text ?? '').split(/(\n*^#+ .*)/gm)
    const sections: SectionArray = [{ name: '<top>', text: spl[0], lnl: '' }]
    sections.all = { name: '<all>' }
    for (let i = 1; i < spl.length; i += 2) {
      let hd = spl[i]
      const lnl = hd[0] === '\n'
      if (lnl) hd = hd.substring(1)
      sections.push({ name: hd.trim(), text: hd + spl[i + 1], lnl: lnl ? '\n' : '' })
    }
    const sel = sectionRef.current
    if (!sel) return
    const o = document.createElement('option')
    o.value = 'all'
    o.text = '<all>'
    sel.replaceChildren(o) // $section.fill(o)
    sections.forEach((x, i) => {
      const opt = document.createElement('option')
      opt.value = String(i)
      opt.text = x.name
      sel.add(opt)
    })
    inst.sections = sections
    inst.sections_invalid = false
  }, [inst])

  // editpage.js:111 choose_section — swap the textarea to the selected section (writing the current
  // one back first), then refresh or clear the preview.
  const choose_section = useCallback(
    (id: string): void => {
      if (inst.sections_invalid) return
      const ta = textareaRef.current
      if (!ta || !inst.sections) return
      if (inst.current_section != null)
        inst.sections[inst.current_section as unknown as number].text = ta.value

      let text: string
      if (id === 'all') {
        inst.current_section = null
        text = inst.text = inst.sections.map((x) => x.lnl + x.text).join('')
      } else {
        inst.current_section = id
        text = inst.sections[id as unknown as number].text
      }
      ta.value = text

      if (showPreviewRef.current && inst.live_preview) update_preview()
      else previewRef.current?.replaceChildren() // $preview.fill()
    },
    [inst, update_preview],
  )

  // editpage.js:254 save — POST the page, and on success drop the modified flag / re-enter edit mode.
  const save = useCallback(
    (callback?: (ok: boolean) => void): void => {
      Req.write(inst.page!).do = (resp, err) => {
        if (err) {
          alert('❌ page edit failed')
          print('❌ page edit failed!')
        } else {
          set_modified(false)
          print('✅ saved page')
          if (inst.creating) {
            inst.creating = false
            got_page(resp as unknown as Content)
          }
        }
        callback && callback(!err)
      }
      print('\u{1F4BE} saving page')
    },
    // got_page is a stable function declaration (hoisted); eslint-safe to omit.
    [inst, set_modified],
  )

  // editpage.js:174 got_page — the core populate routine (title, textarea, raw-JSON writable fields,
  // dedicated inputs, and the preview-UI reset).
  const got_page = useCallback(
    (page: Content, creating = false): void => {
      hdr.set_entity_title(page)
      inst.page = page
      inst.text = page.text
      if (!creating) {
        const a = build_header_link({ label: 'back', href: '#page/' + page.id })
        hdr.add_header_links(a)
        appendedHeaderRef.current.push(a)
      }
      if (textareaRef.current) textareaRef.current.value = page.text
      // only keep writable fields, excluding the ones that have dedicated inputs.
      const writable: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(page)) {
        const info = contentTypeInfo[k]
        if (!info || info[creating ? 'writableOnInsert' : 'writableOnUpdate']) {
          if (k !== 'text' && k !== 'keywords' && k !== 'name' && k !== 'literalType')
            writable[k] = v
        }
      }
      const wvalues = writable.values as { markupLang?: string } | undefined
      if (wvalues && wvalues.markupLang) {
        if (markupRef.current) markupRef.current.value = page.values.markupLang || 'plaintext'
        delete wvalues.markupLang
      }
      if (dataRef.current) dataRef.current.value = JSON.stringify(writable, null, 1)
      if (keywordsRef.current) keywordsRef.current.value = page.keywords.join(' ')
      if (nameRef.current) nameRef.current.value = page.name
      if (typeRef.current) typeRef.current.value = page.literalType

      if (previewButtonRef.current) previewButtonRef.current.checked = false
      toggle_preview(false)
      if (liveButtonRef.current) liveButtonRef.current.checked = true
      inst.live_preview = true
    },
    [inst, hdr, toggle_preview],
  )

  // editpage.js:62 batched textarea `input`: re-render the preview at most once per frame when
  // preview is shown AND live.
  const onEditorInput = useCallback((): void => {
    if (inputRaf.current++) return
    requestAnimationFrame(() => {
      inputRaf.current = 0
      if (showPreviewRef.current && inst.live_preview) update_preview()
    })
  }, [inst, update_preview])

  // ---- Init + Start/Quick/Render (editpage.js:4-104,132-207) — runs once per mount. ----
  useLayoutEffect(() => {
    const root = rootRef.current
    const slotEl = (root?.closest('view-slot') as HTMLElement | null) ?? null
    slotElRef.current = slotEl
    appendedHeaderRef.current = []

    // Save button (Draw.button + Draw.event_lock), appended to $header_extra.
    const btn = document.createElement('button')
    btn.append('Save')
    btn.className = 'item save-button'
    btn.onclick = (ev) => {
      const el = ev.currentTarget as HTMLButtonElement
      if (el.disabled) return
      el.disabled = true
      const done = (): void => {
        el.disabled = false
      }
      if (!inst.page) return
      let d: {
        text: string
        keywords: string[]
        name: string
        literalType: string
        values: { markupLang?: string }
        [k: string]: unknown
      }
      try {
        d = JSON.parse(dataRef.current!.value)
      } catch (e) {
        done()
        print(e)
        return
      }
      d.text = inst.page.text
      d.keywords = keywordsRef.current!.value.match(/[^,\s]+/g) || []
      d.name = nameRef.current!.value
      d.literalType = typeRef.current!.value
      d.values.markupLang = markupRef.current!.value || 'plaintext'

      let text: string
      if (inst.current_section == null) {
        text = textareaRef.current!.value
      } else {
        inst.sections![inst.current_section as unknown as number].text = textareaRef.current!.value
        text = inst.text = inst.sections!.map((x) => x.lnl + x.text).join('')
      }
      const change = text.length - d.text.length
      const percent = (change / d.text.length) * 100
      if (percent < -25)
        if (
          !confirm(
            'are you sure you want to save?\ntext length changed by ' +
              percent.toFixed(1) +
              '% (' +
              change +
              ' chars)',
          )
        )
          return void done()
      d.text = text
      Object.assign(inst.page, d)
      save(done)
    }
    saveButtonRef.current = btn
    const extra = hdr.header_extra
    if (extra) {
      extra.append(btn)
      appendedHeaderRef.current.push(btn)
    }

    // listeners (wired imperatively so `change` keeps its native on-blur semantics).
    previewButtonRef.current!.onchange = (e) =>
      toggle_preview((e.target as HTMLInputElement).checked)
    liveButtonRef.current!.onchange = (e) => {
      const c = (e.target as HTMLInputElement).checked
      inst.live_preview = c
      if (c) update_preview()
    }
    textareaRef.current!.addEventListener('input', onEditorInput, { passive: true })
    dataRef.current!.onchange = () => set_modified(true)
    textareaRef.current!.onchange = () => {
      set_modified(true)
      if (inst.current_section == null) inst.sections_invalid = true
    }
    renderButtonRef.current!.onclick = () => update_preview(true)
    sectionRef.current!.onfocus = () => {
      if (inst.sections_invalid) {
        if (inst.current_section == null) {
          inst.text = textareaRef.current!.value
          find_sections()
        }
      }
    }
    sectionRef.current!.onchange = (e) => choose_section((e.target as HTMLSelectElement).value)
    horizontalRef.current!.onchange = () => setHorizontal(horizontalRef.current!.checked)
    wrapRef.current!.onchange = () =>
      setWrapWS(wrapRef.current!.checked ? 'pre-wrap' : 'pre')

    // active-editor registry (was Nav.view() == focused slot's view) — register while the slot is
    // focused so the upload flow injects uploaded-file URLs here (editpage.js:171 Insert_Text).
    const editorObj = {
      Insert_Text: (t: string): void => {
        const ta = textareaRef.current
        if (ta) Edit.insert(ta, t)
      },
    }
    const onFocusIn = (): void => setActiveEditor(editorObj)
    if (slotEl) {
      slotEl.addEventListener('focusin', onFocusIn)
      if (slotEl.classList.contains('focused')) setActiveEditor(editorObj)
    }

    // Start → Quick (create) / Render (edit).
    if (loc.id == null) {
      inst.parent_id = +loc.query.parent || 0
      // hack to create a new page object (editpage.js:153).
      const page = TYPES.content(Object.assign({}, TYPES.content.prototype)) as Content
      page.contentType = CODES.InternalContentType.page
      page.values = { markupLang: Settings.values.chat_markup }
      page.name = 'New Page'
      page.parentId = inst.parent_id
      page.permissions = { '0': 'CR' }
      inst.creating = true
      got_page(page, true)
    } else {
      inst.creating = false
      got_page((data.content as EntityList<Content>)[0], false)
    }

    return () => {
      for (const n of appendedHeaderRef.current) n.remove()
      appendedHeaderRef.current = []
      textareaRef.current?.removeEventListener('input', onEditorInput)
      if (slotEl) {
        protect(slotEl, false)
        slotEl.removeEventListener('focusin', onFocusIn)
      }
      if (Nav.view() === editorObj) setActiveEditor(null)
    }
    // data/loc/header are stable for a view's lifetime (Slot keys the rendered Component by loc,
    // so a navigation remounts); the callbacks are stable. Runs exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // editpage.js:208-217 — the convert/clear side of toggle_preview, run AFTER showPreview commits so
  // update_preview measures the now-visible pane.
  useLayoutEffect(() => {
    if (showPreview) update_preview()
    else previewRef.current?.replaceChildren()
  }, [showPreview, update_preview])

  // ---- template (editpage.js:276-304) ----
  const topEl = (
    <div key="top" ref={containerRef as Ref<HTMLDivElement>} className="sized page-container SLIDES">
      <scroll-outer
        data-slide="preview"
        ref={previewOuterRef}
        class={showPreview ? 'shown' : undefined}
      >
        <scroll-inner ref={previewRef} class="pageContents editPageContents" />
      </scroll-outer>
      <div
        data-slide="fields"
        className={showPreview ? 'COL' : 'COL shown'}
        style={{ padding: '0.5rem' }}
      >
        <label className="edit-field">
          Title:
          <input ref={nameRef} defaultValue="" />
        </label>
        <label className="edit-field">
          Kind:
          <input ref={typeRef} placeholder="literalType" defaultValue="" />
        </label>
        <label className="edit-field">
          Keywords:
          <input ref={keywordsRef} style={{ wordSpacing: '0.5em' }} defaultValue="" />
        </label>
        <label className="edit-field">
          Markup:
          <input ref={markupRef} placeholder="markupLang" defaultValue="" />
        </label>
        <textarea ref={dataRef} style={{ resize: 'none' }} className="FILL code-textarea" defaultValue="" />
      </div>
    </div>
  )

  const resizeEl = (
    <resize-handle
      key="resize"
      ref={handleRef}
      style={{ ['--bar-height']: horizontal ? '5em' : '2em', gap: '0.25rem' } as CSSProperties}
      class="nav"
    >
      <label>
        preview:
        <input type="checkbox" ref={previewButtonRef} />
      </label>
      <span hidden={!showPreview} style={{ display: 'contents' }}>
        {'| '}
        <label>
          live:
          <input type="checkbox" ref={liveButtonRef} />
        </label>{' '}
        <button ref={renderButtonRef}>render full</button>
      </span>
      <label>
        {'| Section: '}
        <select style={{ width: '5rem' }} ref={sectionRef} />
      </label>
      <label>
        horizontal:
        <input ref={horizontalRef} type="checkbox" />
      </label>
      <label>
        wrap:
        <input ref={wrapRef} type="checkbox" defaultChecked />
      </label>
    </resize-handle>
  )

  const textareaEl = (
    <textarea
      key="textarea"
      ref={textareaRef}
      className="FILL editor-textarea"
      style={{ margin: '3px', whiteSpace: wrapWS }}
      defaultValue=""
    />
  )

  return (
    <view-root ref={rootRef} class={`resize-box ${horizontal ? 'ROW' : 'COL'}`}>
      {horizontal ? [textareaEl, resizeEl, topEl] : [topEl, resizeEl, textareaEl]}
    </view-root>
  )
}

// editpage.js:306 — View.register('editpage', EditView). Registered centrally by
// routing/routes.ts; this module only exports the RouteModule contract.
export const EditViewModule: RouteModule = { Start, Component: EditView }
