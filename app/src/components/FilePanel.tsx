// FilePanel (upload.js FileUploader → ARCHITECTURE §10, §12, L6g). The sidebar image-upload panel:
// pick / paste / drag-drop / fetch-by-url an image, preview it, fill an upload form, POST it, then
// insert its markup into the focused editor. Ported near-verbatim from FileUploader, kept faithful
// to its documented quirks:
//   - document-level paste / dragover / drop listeners (drop ignored over a <textarea>),
//   - object-URL revoke timing: create → assign to <img> → revoke on the next task (setTimeout),
//   - `$file_image.src` reset to '' before each new src so the old image isn't shown while loading,
//   - `data.bucket != null` ⇒ private upload (globalPerms=''; request.ts maps '' → '.'),
//   - file size shown as `type + " " + (size/1000) + " kB"`.
// The three-phase visibility (0 inputs / 1 selected / 2 uploaded) drives `hidden` on the controls.
// The upload form is reproduced inline (this package does not depend on the Form island) with the
// exact per-field read/write semantics (text ""→null, select index→value, output value).
import { useCallback, useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import type { Content } from '../data/types'
import { Req } from '../services/request'
import { Nav } from '../services/nav'
import { Settings } from '../services/settings'

// The focused-editor contract (was `Nav.view().Insert_Text` — the active-editor registry). L7's
// EditView / PageView expose this while focused; Nav.view() returns it (or null/undefined).
interface ActiveEditor {
  Insert_Text?(text: string): void
}

// quantize <select>: option index → value (upload.js file_upload_form field).
const QUANTIZE_OPTIONS: ReadonlyArray<number | null> = [null, 2, 4, 8, 16, 32, 64, 256]
const QUANTIZE_LABELS: ReadonlyArray<string> = ['no', '2', '4', '8', '16', '32', '64', '256']

// The upload form's data shape (input.js get(): name → value, with the input's own coercion).
interface FormValues {
  size: string | null
  name: string | null
  keywords: string | null
  hash: string | null
  bucket: string | null
  quantize: number | null | undefined
}

// ---------------------------------------------------------------------------------------------
// showInSidebar(content) — the old FileUploader.show_content, callable from other modules (e.g.
// PageView calls it to preview the current page's file). Bridged to the mounted panel instance via
// a module-level controller ref (mirrors the sidebar-log setPrintSink pattern).
// ---------------------------------------------------------------------------------------------
interface FilePanelController {
  show_content(content: Content): void
}
let controller: FilePanelController | null = null
export function showInSidebar(content: Content): void {
  controller?.show_content(content)
}

export interface FilePanelProps {
  // Sidebar.tabs.select — brought to the 'file' tab when a file is grabbed (got_file).
  selectTab?: (name: string) => void
  // Sidebar.close_fullscreen — collapse the mobile sidebar after inserting into the editor.
  closeFullscreen?: () => void
}

export function FilePanel({ selectTab, closeFullscreen }: FilePanelProps): React.JSX.Element {
  // phase: 0 = inputs, 1 = file selected, 2 = uploaded (show_parts).
  const [phase, setPhase] = useState(0)

  // Latest prop callbacks (read from stable handlers without re-subscribing document listeners).
  const selectTabRef = useRef(selectTab)
  selectTabRef.current = selectTab
  const closeFullscreenRef = useRef(closeFullscreen)
  closeFullscreenRef.current = closeFullscreen

  // DOM refs (the old $file_* globals).
  const imgRef = useRef<HTMLImageElement>(null)
  const urlDisplayRef = useRef<HTMLInputElement>(null) // $file_url (readonly result url)
  const urlInputRef = useRef<HTMLInputElement>(null) // $file_url_input (CORS url to fetch)
  const urlFormRef = useRef<HTMLFormElement>(null) // $file_url_form
  const uploadPageRef = useRef<HTMLAnchorElement>(null) // $file_upload_page

  // form field refs
  const sizeRef = useRef<HTMLOutputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const keywordsRef = useRef<HTMLInputElement>(null)
  const hashRef = useRef<HTMLInputElement>(null)
  const bucketRef = useRef<HTMLInputElement>(null)
  const quantizeRef = useRef<HTMLSelectElement>(null)

  // imperative (non-render) state
  const fileRef = useRef<File | Blob | null>(null) // this.file (set only while uploading)
  const lastFileRef = useRef<Content | null>(null) // this.last_file
  // input.js `_value` model, so got_file's write() reproduces the persist-then-restore behavior.
  const valuesRef = useRef<FormValues>({
    size: null,
    name: null,
    keywords: null,
    hash: null,
    bucket: null,
    quantize: null,
  })

  // ---- form helpers (input.js Form for the specific fields used) --------------------------------
  const textRead = (el: HTMLInputElement): string | null => {
    let v: string | null = el.value
    if (v === '') v = null
    return v
  }
  const formWrite = useCallback((): void => {
    const v = valuesRef.current
    sizeRef.current!.value = v.size || ''
    nameRef.current!.value = v.name || ''
    keywordsRef.current!.value = v.keywords || ''
    hashRef.current!.value = v.hash || ''
    bucketRef.current!.value = v.bucket || ''
    const i = QUANTIZE_OPTIONS.indexOf((v.quantize ?? null) as number | null)
    if (i >= 0) quantizeRef.current!.value = String(i)
  }, [])
  const formRead = useCallback((): void => {
    const v = valuesRef.current
    v.size = sizeRef.current!.value || null
    v.name = textRead(nameRef.current!)
    v.keywords = textRead(keywordsRef.current!)
    v.hash = textRead(hashRef.current!)
    v.bucket = textRead(bucketRef.current!)
    const raw = quantizeRef.current!.value
    const idx = Number(raw) | 0
    if (idx >= 0 && idx < QUANTIZE_OPTIONS.length) v.quantize = QUANTIZE_OPTIONS[idx]
    else v.quantize = undefined
  }, [])
  const formGet = useCallback((): FormValues => ({ ...valuesRef.current }), [])
  const formSetSome = useCallback((data: Partial<FormValues>): void => {
    const v = valuesRef.current as unknown as Record<string, unknown>
    for (const key in data) {
      const value = (data as Record<string, unknown>)[key]
      if (value !== undefined) v[key] = value
    }
  }, [])

  // ---- upload.js show_parts ---------------------------------------------------------------------
  const showParts = useCallback((next: number, url: string | null, file: File | Blob | null): void => {
    setPhase(next)
    const img = imgRef.current!
    // we set to "" first, so the old image isnt visible whilst the new one is loading
    img.src = ''
    if (url) {
      img.src = url
      img.onload = () => {
        img.title = img.naturalWidth + ' x ' + img.naturalHeight
      }
      const disp = urlDisplayRef.current!
      disp.value = url
      disp.scrollLeft = 999
    } else {
      urlDisplayRef.current!.value = ''
    }
    fileRef.current = file || null
  }, [])

  const fileCancel = useCallback((): void => {
    showParts(0, null, null)
  }, [showParts])

  // upload.js got_file
  const gotFile = useCallback(
    (file: File | Blob): void => {
      const url = URL.createObjectURL(file)
      showParts(1, url, file)
      const name = String((file as File).name)
      window.setTimeout(() => URL.revokeObjectURL(url))
      formSetSome({ size: file.type + ' ' + file.size / 1000 + ' kB', name, hash: null })
      formWrite()
      selectTabRef.current?.('file')
    },
    [showParts, formSetSome, formWrite],
  )

  // upload.js show_content
  const showContent = useCallback(
    (content: Content): void => {
      // image_url is typed `(id: number)` but the original passes content HASH strings; cast.
      const url = Req.image_url(content.hash as unknown as number)
      showParts(2, url, null)
      uploadPageRef.current!.href = '#page/' + content.hash
      lastFileRef.current = content
    },
    [showParts],
  )

  // ---- document listeners + showInSidebar registration -----------------------------------------
  useEffect(() => {
    controller = { show_content: showContent }

    const onPaste = (ev: ClipboardEvent): void => {
      const data = ev.clipboardData
      if (data && data.files) {
        const file = data.files[0]
        if (file && /^image\//.test(file.type)) gotFile(file)
      }
    }
    const onDragover = (ev: DragEvent): void => {
      if (ev.dataTransfer!.types.includes('Files')) {
        ev.preventDefault()
        ev.dataTransfer!.dropEffect = 'copy'
      }
    }
    const onDrop = (ev: DragEvent): void => {
      if (ev.target instanceof HTMLTextAreaElement) return
      const file = ev.dataTransfer!.files[0]
      if (file) {
        ev.preventDefault()
        if (/^image\//.test(file.type)) gotFile(file)
      }
    }
    document.addEventListener('paste', onPaste)
    document.addEventListener('dragover', onDragover)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('paste', onPaste)
      document.removeEventListener('dragover', onDragover)
      document.removeEventListener('drop', onDrop)
      if (controller && controller.show_content === showContent) controller = null
    }
  }, [gotFile, showContent])

  // ---- JSX event handlers ----------------------------------------------------------------------
  const onBrowseChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const el = e.currentTarget
    const file = el.files?.[0]
    try {
      if (file) gotFile(file)
    } finally {
      el.value = ''
    }
  }

  const onUrlSubmit = async (ev: React.FormEvent<HTMLFormElement>): Promise<void> => {
    ev.preventDefault()
    const form = urlFormRef.current!
    if (form.hasAttribute('data-disabled')) return
    try {
      form.setAttribute('data-disabled', '')
      const url = urlInputRef.current!.value
      if (!url) return
      print('requesting image (might fail)...')
      const resp = await fetch(new Request(url))
      const blob = await resp.blob()
      ;(blob as { name?: string }).name = url
      gotFile(blob)
      urlInputRef.current!.value = ''
    } catch (e) {
      print('failed:', e)
    } finally {
      form.removeAttribute('data-disabled')
    }
  }

  const onInsert = (): void => {
    const file = lastFileRef.current
    if (!file) return
    const curr = Nav.view() as ActiveEditor | null
    if (!curr || !curr.Insert_Text) return

    let url = Req.image_url(file.hash as unknown as number)

    const meta = JSON.parse(file.meta as string)
    const markup = Settings.values.chat_markup
    if (markup === '12y') {
      url = '!' + url
      if (meta.width && meta.height) url += '#' + meta.width + 'x' + meta.height
    } else if (markup === '12y2') {
      url = '!' + url
      if (meta.width && meta.height) url += '[' + meta.width + 'x' + meta.height + ']'
    }

    closeFullscreenRef.current?.()
    curr.Insert_Text(url)
  }

  // upload.js $file_upload.onclick = Draw.event_lock(done=>{…})
  const onUpload = (ev: React.MouseEvent<HTMLButtonElement>): void => {
    const elem = ev.currentTarget
    if (elem.disabled) return
    elem.disabled = true
    const done = (): void => {
      elem.disabled = false
    }

    if (!fileRef.current) return void done()

    formRead()
    const data = formGet()

    const params: Record<string, unknown> = {
      tryresize: true,
      name: data.name || '',
      values: {} as Record<string, unknown>,
    }
    let priv = false
    if (data.bucket != null) {
      ;(params.values as Record<string, unknown>).bucket = data.bucket || ''
      priv = true
    }
    // ok this is silly. why even bother with the Form thing
    if (data.quantize) params.quantize = data.quantize
    if (data.hash) params.hash = data.hash
    if (data.keywords) params.keywords = data.keywords
    if (priv) params.globalPerms = ''
    print(`uploading ${priv ? 'private' : 'public'} file...`)

    // The `do` completion is typed cb(resp: ListMap, err?); the upload proc returns TYPES.content,
    // so the resp is really a Content — cast for the permissions/id reads (as the original assumed).
    Req.upload_file(fileRef.current as File, params).do = (resp, err) => {
      done()
      if (err) return

      const file = resp as unknown as Content
      if (priv && (file.permissions as Record<string, string>)[0])
        alert('file permissions not set correctly!\nid:' + file.id)

      showContent(file)
    }
  }

  const onUrlFocus = (): void => {
    window.setTimeout(() => {
      urlDisplayRef.current?.select()
    })
  }

  return (
    <div id="$sidebarFilePanel" className="COL">
      <div className="rem1-5 ROW" style={{ justifyContent: 'space-between' }}>
        <div className="FILL COL" id="$file_inputs" hidden={phase !== 0}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/bmp,image/webp,.png,.jpg,.jpeg,.gif,.bmp"
            id="$file_browse"
            className="item"
            onChange={onBrowseChange}
          />
          <form className="ROW" id="$file_url_form" method="dialog" ref={urlFormRef} onSubmit={onUrlSubmit}>
            <input type="text" id="$file_url_input" className="FILL item" placeholder="url (CORS only)" ref={urlInputRef} />
            <button className="item">GET</button>
          </form>
        </div>
        <button id="$file_cancel" className="item" hidden={phase !== 1} onClick={fileCancel}>
          Cancel
        </button>
        <button id="$file_upload" className="item" hidden={phase !== 1} onClick={onUpload}>
          Upload Image
        </button>

        <button id="$file_url_insert" className="item" hidden={phase !== 2} onClick={onInsert}>
          Insert
        </button>
        <input readOnly className="FILL item" id="$file_url" hidden={phase !== 2} ref={urlDisplayRef} onFocus={onUrlFocus} />
        <a id="$file_upload_page" ref={uploadPageRef} hidden={phase !== 2}>
          [Page]
        </a>
        <button id="$file_done" className="item" hidden={phase !== 2} onClick={fileCancel}>
          Done
        </button>
      </div>
      <form-table hidden={phase !== 1}>
        <div className="label">
          <label htmlFor="$fp_size">Info:</label>
        </div>
        <output id="$fp_size" className="field" ref={sizeRef} />
        <div className="label">
          <label htmlFor="$fp_name">Name:</label>
        </div>
        <input id="$fp_name" className="field" placeholder="text" ref={nameRef} />
        <div className="label">
          <label htmlFor="$fp_keywords">Tags:</label>
        </div>
        <input id="$fp_keywords" className="field" placeholder="text" ref={keywordsRef} />
        <div className="label">
          <label htmlFor="$fp_hash">Hash:</label>
        </div>
        <input id="$fp_hash" className="field" placeholder="text" ref={hashRef} />
        <div className="label">
          <label htmlFor="$fp_bucket">Bucket:</label>
        </div>
        <input id="$fp_bucket" className="field" placeholder="text" ref={bucketRef} />
        <div className="label">
          <label htmlFor="$fp_quantize">Quantize:</label>
        </div>
        <select id="$fp_quantize" className="field" ref={quantizeRef} defaultValue={0}>
          {QUANTIZE_LABELS.map((label, i) => (
            <option key={i} value={i}>
              {label}
            </option>
          ))}
        </select>
      </form-table>
      <div className="FILL image-box" style={{ minHeight: '3rem' }}>
        <img id="$file_image" ref={imgRef} />
      </div>
      <a href="#images">View Images</a>
    </div>
  )
}
