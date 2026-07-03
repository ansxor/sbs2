// L7a — PageView (ports src/Views/page.js; ARCHITECTURE §6/§8/§10/§11, L7 views).
//
// The content markup body (or file image) + watch checkbox + per-page userlist + live chat
// (MessageList island inside a Scroller island) + composer (send / edit / reply / delete /
// slash-commands / pinned / load-older) + resizable content/chat divider.
//
// Fragile state (the linked-list MessageList, the Scroller math, the presence StatusDisplay) lives
// in the imperative islands/components (ScrollerHost, MessageListView, UserList) exactly as the
// architecture prescribes — React only mounts empty containers. Everything page.js kept as instance
// fields that are READ synchronously by imperative handlers (editing / replying_to / pre_edit / the
// live scroller + list instances) is kept in refs here so a re-render can never stale-close them;
// only `infoMessage` (the MessageInfo selection, which is set-only, never read imperatively) is
// React state. The <view-root> base class + the f-editing / f-replying flags are managed
// imperatively (BaseView.Flag) so a re-render can't clobber them.
import { useLayoutEffect, useRef, useState } from 'react'
import type * as React from 'react'

import type {
  Content,
  EntityList,
  Message,
  NavLocation,
  StartResult,
  User,
  ViewComponentProps,
  Watch,
} from '../data/types'
import { Entity, CODES, Author } from '../data/entity'
import { Req } from '../services/request'
import { Lp } from '../services/socket'
import { Settings } from '../services/settings'
import { Edit } from '../services/edit'
import { avatar_url } from '../services/draw'
import { ResizeTracker, type Scroller } from '../services/scroller'
import { MessageList } from '../services/message-list'
import { StatusDisplay } from '../services/status-display'
import { Apx } from '../services/apx'
import { print } from '../services/sidebar-log'
import { Nav, setActiveEditor } from '../services/nav'
import { register } from '../routing/view-registry'
import { ScrollerHost } from '../islands/ScrollerHost'
import { MessageListView } from '../islands/MessageListView'
import { MarkupContent } from '../islands/MarkupContent'
import { UserList } from '../components/UserList'
import { MessageInfo } from '../components/MessageInfo'
import { UserLabel } from '../components/UserLabel'
import { TimeAgo } from '../components/TimeAgo'
import { showInSidebar } from '../components/FilePanel'
import { useResizable } from '../hooks/useResizable'

// `<textarea-container>` is a real custom-element tag the reused CSS targets heavily
// (style.css / layout.css); it is declared centrally in types/jsx-intrinsics.d.ts.

// page.js:506 — `PageView.track_resize_2 = new ResizeTracker('width')`. A single tracker shared by
// every PageView instance (a class static → module singleton).
const track_resize_2 = new ResizeTracker('width')

// page.js Destroy/Init — `View.lost`: the stashed unsent textarea text that survives a same-page
// reload. Per ARCHITECTURE §6 it lives at module scope in the view module.
let lost: string | undefined

// Markup `etc` forwarded by reference to MarkupContent — page.js passed
// `{intersection_observer: View.observer}` and View.observer is always null (§8.2/§12). A module
// const keeps the reference maximally stable so MarkupContent never re-converts.
const MARKUP_ETC = { intersection_observer: null }

// Search-modules response shape (Req.search_modules resolves to an array of command descriptors).
interface ModuleSubcommand {
  arguments: Array<{ name: string }>
  description?: string
}
interface ModuleCommand {
  name: string
  subcommands: Record<string, ModuleSubcommand>
}

// Minimal linked-list node shape for my_last_message's walk (message-list.ts's concrete `Part` /
// `ListNode` types are not exported; mirror the walk shape locally and cast through it).
interface LNode {
  prev: LNode
  data: Message
}

// The read_input / write_input working object: either the edited Message (cast) or a freshly-built
// new-message draft.
type Draft = {
  id?: number
  contentId: number
  text: string
  values: Record<string, unknown>
}

// navigate.js:66 ViewSlot.add_header_links built each anchor as
// `<a href target><span class=text-shadow>{icon}</span><span>{label}</span></a>`. The frozen
// SlotHeaderApi now takes prebuilt Nodes, so the view builds them.
function header_link(icon: string, label: string, href: string, target?: string): HTMLAnchorElement {
  const a = document.createElement('a')
  a.href = href
  a.target = target || '_self'
  const lb = document.createElement('span')
  lb.textContent = label
  a.append(lb)
  if (icon) {
    const ic = document.createElement('span')
    ic.className = 'text-shadow'
    ic.append(icon)
    a.prepend(ic)
  }
  return a
}

// draw.js:226-233 Draw.event_lock — disable the target element until `done()` is called, so a
// double-click can't fire the async action twice.
function event_lock(
  cb: (done: () => void, elem: HTMLButtonElement | HTMLInputElement) => void,
): (ev: React.SyntheticEvent) => void {
  return (ev) => {
    const elem = ev.currentTarget as HTMLButtonElement | HTMLInputElement
    if (elem.disabled) return
    elem.disabled = true
    cb(() => {
      elem.disabled = false
    }, elem)
  }
}

// page.js:12 PageView.Start — the content/pinned/messages/replies/users/watch chain.
function Start(loc: NavLocation): StartResult {
  const id = loc.id
  const field = typeof id === 'number' ? 'id' : 'hash'
  if (field === 'id') StatusDisplay.prepare(id as number)
  return {
    chain: {
      values: { key: id },
      requests: [
        { type: 'content', fields: '*', query: `${field} = @key` },
        { name: 'Pcontent', type: 'content', fields: '*', query: 'id = @content.parentId' },
        {
          type: 'message',
          fields: '*',
          query: 'contentId IN @content.id AND !notdeleted()',
          order: 'id_desc',
          limit: 30,
        },
        {
          name: 'replies',
          type: 'message',
          fields: '*',
          query: 'id in @message.values.replyingTo AND id NOT IN @message.id',
        },
        { name: 'Mpinned', type: 'message', fields: '*', query: 'id IN @content.values.pinned' },
        {
          type: 'user',
          fields: '*',
          query:
            'id IN @content.createUserId OR id IN @message.createUserId OR id IN @message.editUserId OR id IN @Mpinned.createUserId OR id IN @Mpinned.editUserId OR id IN @replies.createUserId',
        },
        { type: 'watch', fields: '*', query: 'contentId IN @content.id' },
      ],
    },
    check: (resp) => resp.content[0],
  }
}

function PageView({ data, header }: ViewComponentProps): React.JSX.Element {
  // page.js:123 Render destructure
  const page = data.content[0] as Content
  const page_id = page.id
  const messages = data.message as EntityList<Message>
  const pinned = data.Mpinned as EntityList<Message>
  const users = data.user as EntityList<User>
  const watchList = data.watch as EntityList<Watch>
  const parent = data.Pcontent ? (data.Pcontent[0] as Content | undefined) : undefined
  const author = users[~page.createUserId]
  const isFile = page.contentType === CODES.InternalContentType.file

  // ---- refs: DOM ----
  const rootRef = useRef<HTMLElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const textareaContainerRef = useRef<HTMLElement>(null)
  const markupRef = useRef<HTMLInputElement>(null)
  const watchingRef = useRef<HTMLInputElement>(null)
  const limitCheckboxRef = useRef<HTMLInputElement>(null)
  const extraRef = useRef<HTMLDivElement>(null)
  const replyAvatarRef = useRef<HTMLImageElement>(null)
  const replyNameRef = useRef<HTMLSpanElement>(null)
  const replyTextRef = useRef<HTMLSpanElement>(null)

  // ---- refs: imperative instances / fields (page.js instance fields) ----
  const scrollerRef = useRef<Scroller | null>(null)
  const listRef = useRef<MessageList | null>(null)
  const pinnedListRef = useRef<MessageList | null>(null)
  const editingRef = useRef<Message | null>(null)
  const replyingToRef = useRef<Message | null>(null)
  const preEditRef = useRef<Draft | null>(null)
  const preEditReplyingToRef = useRef<Message | null>(null)

  // ---- state: MessageInfo selection (set-only; the only React state) ----
  const [infoMessage, setInfoMessage] = useState<Message | null>(null)

  // resizable content/chat divider (page.js:191 `new ResizeBar($page_container, $resize_handle,
  // 'top', 'setting--divider-pos-'+page_id, null)`).
  const { containerRef: pageContainerRef, handleRef: resizeHandleRef } = useResizable(
    'setting--divider-pos-' + page_id,
    { side: 'top', default: null },
  )

  // page.js:285 Insert_Text — cross-view file insertion target (active-editor registry).
  const insert_text = (text: string): void => {
    Edit.insert(textareaRef.current!, text)
  }
  // Registered on textarea focus; kept until unmount (NOT cleared on blur) so the sidebar FilePanel
  // — which the user must click, blurring the textarea — still targets this view, matching the
  // original's last-focused-slot `Nav.focused.view` semantics.
  const editorHandle = useRef<{ Insert_Text: (t: string) => void } | null>(null)
  if (!editorHandle.current) editorHandle.current = { Insert_Text: insert_text }

  // view.js:58 BaseView.Flag
  const flag = (name: string, state: boolean): void => {
    rootRef.current?.classList.toggle('f-' + name, state)
  }

  // page.js:43 enter_submits
  const enter_submits = (): boolean =>
    !['newline', 'newline, strip trailing'].includes(Settings.values.chat_enter)

  // page.js:330 textarea_resize
  const textarea_resize = (): void => {
    const ta = textareaRef.current!
    ta.style.height = '10px'
    let height = ta.scrollHeight
    const dpr = window.devicePixelRatio
    height = Math.ceil(height / dpr + 1) * dpr
    textareaContainerRef.current!.style.height = `${height}px`
    ta.style.height = '100%'
  }

  // page.js:289 my_last_message
  const my_last_message = (): Message | null => {
    const list = listRef.current
    if (!list) return null
    const sentinel = list as unknown as LNode
    let cnt = 0
    for (let node = sentinel.prev; node !== sentinel; node = node.prev) {
      if (cnt++ > 100) break
      if (node.data.createUserId == Req.uid) return node.data
    }
    return null
  }

  // page.js:408 read_input
  const read_input = (data: Message | null = null): Draft => {
    let d: Draft
    // editing
    if (data) {
      d = data as unknown as Draft
      if (markupRef.current!.value) d.values.m = markupRef.current!.value
      else delete d.values.m
    } else {
      // new message
      d = { values: {}, contentId: page_id, text: null as unknown as string }
      const sv = Settings.values
      if (sv.avatar) d.values.a = sv.avatar
      else if (Req.me) d.values.a = Req.me.avatar
      if (sv.nickname) d.values.n = Author.filter_nickname(sv.nickname)
      if (sv.big_avatar == 'on' && sv.big_avatar_id) d.values.big = sv.big_avatar_id
      if (sv.avatar_pixel == 'on') d.values.apx = true
      d.values.m = sv.chat_markup
    }
    if (replyingToRef.current) d.values.replyingTo = replyingToRef.current.id
    else delete d.values.replyingTo
    d.text = textareaRef.current!.value
    if (
      ['submit, strip trailing', 'newline, strip trailing'].includes(Settings.values.chat_enter) &&
      d.text.endsWith('\n')
    )
      d.text = d.text.slice(0, -1)
    return d
  }

  // page.js:442 write_input
  const write_input = (data: Draft): void => {
    const text = data.text
    if (
      ['submit, strip trailing', 'newline, strip trailing'].includes(Settings.values.chat_enter) &&
      data.text.endsWith('\n')
    )
      data.text += '\n'

    Edit.set(textareaRef.current!, text)
    textarea_resize()
    if (editingRef.current) {
      let markup = data.values.m
      if ('string' != typeof markup) markup = ''
      markupRef.current!.value = markup as string
    }
  }

  // page.js:489 reply_to_comment
  const reply_to_comment = (comment: Message | null = null): void => {
    if (!comment) {
      if (replyingToRef.current) {
        replyTextRef.current!.textContent = ''
        replyingToRef.current = null
        flag('replying', false)
      }
      return
    }
    replyingToRef.current = comment
    replyAvatarRef.current!.src = avatar_url(comment.Author)
    replyNameRef.current!.textContent = comment.Author.username
    replyTextRef.current!.textContent = comment.text.replace(/\n/g, '  ')
    flag('replying', true)
  }

  // page.js:457 edit_comment
  const edit_comment = (comment: Message | null = null): void => {
    if (!comment) {
      if (editingRef.current) {
        editingRef.current = null
        write_input(preEditRef.current!)
        flag('editing', false)
        if (replyingToRef.current) reply_to_comment(preEditReplyingToRef.current)
      }
      return
    }
    if (!editingRef.current) {
      preEditRef.current = read_input()
      preEditReplyingToRef.current = replyingToRef.current
    }
    editingRef.current = comment
    if (comment.values.replyingTo) {
      listRef.current!.get_reply_message(comment.values.replyingTo as number).then((msg) => {
        reply_to_comment(msg)
      })
    }
    flag('editing', true)
    // do this after the flag, so the width is right
    write_input(comment as unknown as Draft)
    window.setTimeout(() => {
      textareaRef.current!.focus()
      textareaRef.current!.setSelectionRange(99999, 99999) // move cursor to end
    })
  }

  // page.js:339 send_message
  const send_message = (): void => {
    const old_text = editingRef.current && editingRef.current.text
    const data = read_input(editingRef.current)
    // empty input
    if (!data.text) {
      // delete message, if in edit mode
      if (!editingRef.current) return
      const ok = confirm('Are you sure you want to delete this message?\n' + old_text)
      if (!ok) return
      Req.delete('message', data.id!).do = (_resp, err) => {
        if (err) alert('Deleting comment failed')
      }
    } else {
      // create/edit message
      const match = /^[/][/](\w+) ?/.exec(data.text)
      if (!editingRef.current && match) {
        const [full, command] = match
        const args = data.text.slice(full.length)
        if (command == 'help') {
          Req.search_modules().do = (resp, err) => {
            if (err) {
              alert('Searching for modules failed')
              return
            }
            // build up a list of commands to present
            let outputMessage = '⚙️ Commands Available:\n'
            ;(resp as unknown as ModuleCommand[]).forEach((command) => {
              Object.entries(command.subcommands).forEach(([subname, subcommand]) => {
                outputMessage += `/${command.name} `
                if (subname) outputMessage += subname + ' '
                outputMessage += subcommand.arguments.map((argument) => `<${argument.name}>`).join(' ')
                if (subcommand['description']) outputMessage += ' - ' + subcommand.description
                outputMessage += '\n'
              })
            })
            print(outputMessage)
          }
        } else {
          Req.send_module_message(command, data.contentId, args).do = (_resp, err) => {
            if (err) print('Posting module failed')
          }
        }
      } else {
        Req.send_message(data).do = (_resp, err) => {
          if (err) alert('Posting failed')
        }
      }
    }
    if (replyingToRef.current) reply_to_comment(null)
    // reset input
    if (editingRef.current) edit_comment(null)
    else {
      Edit.clear(textareaRef.current!)
      textarea_resize()
    }
  }

  // page.js:303 display_live — bracket the printed batch with before_print / after_print so the
  // Scroller can smooth-scroll only when something new lands at the end.
  const display_live = (comments: Message[]): void => {
    const list = listRef.current!
    const scroller = scrollerRef.current!
    if (list.over_limit() && !limitCheckboxRef.current!.checked) {
      scroller.print_top(() => {
        list.limit_messages()
      })
    }

    let last_new: Message | null = null
    let x: ReturnType<Scroller['before_print']> | null = null
    let cb: (() => void) | null = () => {
      cb = null
      x = scroller.before_print(true)
    }
    for (const msg of comments) {
      if (list.display_live(msg, cb)) last_new = msg
    }
    if (x == null) return // nothing printed

    scroller.after_print(x)

    if (last_new) {
      // page.js:327 View.comment_notification(last_new) — the title/favicon notification module is
      // not ported (ARCHITECTURE SlotHeaderContext note: no notification/favicon module in scope),
      // so the tab-title flash is intentionally omitted here.
    }
  }

  // page.js:202 update_pinned — a second, separate MessageList prepended above the load-older
  // controls, via the Scroller's print_top so it can't jump the scroll position.
  const update_pinned = (): void => {
    Entity.link_comments({ message: pinned, user: users })
    const listEl = document.createElement('message-list')
    pinnedListRef.current = new MessageList(listEl, page_id)

    const separator = document.createElement('div')
    separator.className = 'messageGap'

    scrollerRef.current!.print_top(() => {
      extraRef.current!.prepend(separator)
      extraRef.current!.prepend(listEl)
      for (const msg of pinned) pinnedListRef.current!.display_edge(msg)
    })
  }

  // ---- island onReady handlers ----
  const onScrollerReady = (s: Scroller): void => {
    scrollerRef.current = s
  }
  // page.js:151/165-166 — stash the list, then display the initial (id_desc) batch oldest-first.
  const onListReady = (l: MessageList): void => {
    listRef.current = l
    for (let i = messages.length - 1; i >= 0; i--) l.display_edge(messages[i])
  }
  // Events.messages fires (comments, message_event); page.js closed over just `comments`.
  const onLiveMessages = (...args: unknown[]): void => {
    display_live(args[0] as Message[])
  }
  // page.js:172 Events.after_messages → scroller.unlock()
  const onAfterMessages = (): void => {
    scrollerRef.current?.unlock()
  }

  // ---- JSX event handlers ----
  const onWatchChange = event_lock((done) => {
    Req.set_watch(page_id, watchingRef.current!.checked).do = () => {
      done()
    }
  })
  const onLoadOlder = event_lock((done) => {
    listRef.current!.load_messages_near(true, 50, () => {
      done()
    })
  })
  const onContainerKeyDown = (ev: React.KeyboardEvent): void => {
    if (ev.nativeEvent.isComposing) return
    // enter - send
    if (ev.key === 'Enter' && !ev.shiftKey && enter_submits()) {
      ev.preventDefault()
      send_message()
    }
    // up arrow - edit previous message
    if (ev.key === 'ArrowUp' && textareaRef.current!.value === '') {
      const comment = my_last_message()
      if (comment) {
        ev.preventDefault()
        edit_comment(comment)
      }
    }
  }
  const onRootKeyDown = (ev: React.KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      edit_comment(null)
      reply_to_comment(null)
      setInfoMessage(null)
    }
  }
  const onSetAvatar = (): void => {
    Req.me!.avatar = page.hash
    Req.write(Req.me!).do = (_resp, err) => {
      if (!err) print('set avatar')
      else alert('edit failed')
    }
  }
  const onShowInSidebar = (): void => {
    showInSidebar(page)
    // page.js:253 also did `Sidebar.tabs.select('file')`; no L7-accessible sidebar-tab-select
    // bridge exists (Sidebar is L8), so the tab is not auto-selected here.
  }

  // ---- mount lifecycle (Init + Render + Visible + Destroy), imperative + run once ----
  useLayoutEffect(() => {
    const root = rootRef.current!
    const textarea = textareaRef.current!
    const container = textareaContainerRef.current!

    // Set the template's base classes imperatively so a re-render can't clobber the f-editing /
    // f-replying flags toggled by edit_comment / reply_to_comment.
    root.className = 'COL resize-box'

    // Init: restore stashed unsent text.
    if (lost != null) textarea.value = lost

    // Render: header (title + links)
    header.set_entity_title(page)
    header.add_header_links(
      header_link('📜️', 'logs', '#comments/' + page.id + '?r'),
      header_link('✏️', 'edit', '#editpage/' + page.id),
      header_link('🗂️', 'childs', '#category/' + page.id),
    )
    if (Req.server_url === 'https://qcs.shsbs.xyz') {
      let href: string | undefined
      if (page.values.share) href = `${Req.server_url}/share/${page.hash}`
      else if (parent && parent.values.share && parent.literalType === 'resource')
        href = `${Req.server_url}/share/${parent.hash}/${page.hash}`
      if (href) header.add_header_links(header_link('🌐', 'blog', href, '_blank'))
    }

    // Render: merge chain users into Lp.users (before UserList's StatusDisplay redraws — its
    // useEffect runs after this layout effect), set the watch checkbox.
    Object.assign(Lp.users, users)
    watchingRef.current!.checked = !!watchList[0]

    // Render: pinned messages (needs both the Scroller and the list islands, whose child layout
    // effects have already run by the time this parent layout effect fires).
    if (pinned instanceof Array && pinned.length) update_pinned()

    // Init: message_control events bubble here from the MessageList controls, the MessageInfo
    // buttons, and the reply-info button.
    const on_mce = (e: Event): void => {
      const ce = e as CustomEvent<{ action: string; data: Message }>
      const action = ce.detail.action
      const d = ce.detail.data
      if (action == 'info') {
        e.stopPropagation()
        setInfoMessage(d)
      }
      if (action == 'edit') {
        e.stopPropagation()
        edit_comment(d)
      }
      if (action == 'reply') {
        e.stopPropagation()
        reply_to_comment(d)
        textarea.focus()
      }
      if (action == 'link') {
        e.stopPropagation()
        insert_text(`sbs:comments?ids=${d.id}`)
      }
    }
    root.addEventListener('message_control', on_mce)

    // Init: textarea autosize on input + on width change.
    const r = (): void => textarea_resize()
    container.addEventListener('input', r, { passive: true })
    track_resize_2.add(container, () => {
      window.setTimeout(r)
    })

    // Render: gate the composer on create permission, focus if allowed.
    const can_talk = Entity.user_has_perm(page.permissions, Req.me as User, 'C')
    textarea.disabled = !can_talk
    if (can_talk) textarea.focus()

    // Visible
    textarea_resize()
    scrollerRef.current!.scroll_instant()

    return () => {
      // Destroy: stash unsent text; detach this instance's listeners. (Scroller/UserList release
      // themselves via their own islands.)
      lost = textarea.value
      track_resize_2.remove(container)
      container.removeEventListener('input', r)
      root.removeEventListener('message_control', on_mce)
      if (Nav.view() === editorHandle.current) setActiveEditor(null)
    }
    // Run exactly once on mount — every dependency is a first-render-stable value/ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // page.js:228 file image, else the markup body.
  let imgWidth: number | undefined
  let imgHeight: number | undefined
  if (isFile && page.meta) {
    const meta = JSON.parse(page.meta)
    if (meta.width) {
      imgWidth = meta.width
      imgHeight = meta.height
    }
  }

  return (
    <view-root ref={rootRef} onKeyDown={onRootKeyDown}>
      <scroll-outer ref={pageContainerRef} class="page-container sized">
        <div className="pageInfoPane bar rem1-5 ROW">
          <label>
            Watching: <input type="checkbox" ref={watchingRef} onChange={onWatchChange} />
          </label>
          <span style={{ margin: '0 0.5rem' }}>{author && <UserLabel user={author} />}</span>
          <span>Created: <TimeAgo time={page.createDate2!} /></span>
        </div>
        {isFile ? (
          <div className="pageContents">
            <button onClick={onSetAvatar}>Set Avatar</button>
            <button onClick={onShowInSidebar}>Show in sidebar</button>
            <img
              className="file-page-image"
              width={imgWidth}
              height={imgHeight}
              alt={page.description}
              src={Req.image_url(page.hash as unknown as number)}
            />
            <pre>{JSON.stringify(page, null, 1)}</pre>
          </div>
        ) : (
          <MarkupContent
            tag="div"
            className="pageContents"
            text={page.text}
            lang={page.values.markupLang as string}
            etc={MARKUP_ETC}
          />
        )}
      </scroll-outer>

      <resize-handle
        ref={resizeHandleRef}
        class="userlist2"
        style={{ '--bar-height': '2.4375rem' } as React.CSSProperties}
      >
        <UserList id={page_id} status="viewing" />
      </resize-handle>

      <ScrollerHost className="FILL" onReady={onScrollerReady}>
        <div ref={extraRef}>
          <button onClick={onLoadOlder}>load older messages</button>
          <label>
            <input type="checkbox" ref={limitCheckboxRef} />
            disable limit
          </label>
        </div>
        <MessageListView
          pageId={page_id}
          onReady={onListReady}
          onMessages={onLiveMessages}
          onAfterMessages={onAfterMessages}
        />
        <div className="chat-bottom" tabIndex={0} />
      </ScrollerHost>

      <div>
        <div className="inputPane">
          <MessageInfo selected={infoMessage} onClose={() => setInfoMessage(null)} />
        </div>
        <div className="ROW inputPane replyPane">
          <button
            onClick={() => {
              reply_to_comment(null)
              textareaRef.current!.focus()
            }}
          >
            ×
          </button>
          <button onClick={() => MessageList.send_mce('info', replyingToRef.current, rootRef.current!)}>
            ⚙️
          </button>
          <div
            className="FILL bar ellipsis"
            style={{
              '--bar-height': '1rem',
              alignSelf: 'center',
              contain: 'strict',
              fontSize: '0.8em',
              marginLeft: '0.5em',
            } as React.CSSProperties}
          >
            ⤴️ <b>Replying to</b>{' '}
            <span className="user-label">
              <img className="item avatar" ref={replyAvatarRef} />
              <span className="entity-title pre" ref={replyNameRef} />
            </span>
            : <span className="pre" ref={replyTextRef} />
          </div>
        </div>
        <div className="inputPane ROW">
          <div className="chat-edit-controls COL">
            <input ref={markupRef} placeholder="markup" style={{ width: '50px' }} />
            <button className="FILL" onClick={() => edit_comment(null)}>
              Cancel
            </button>
          </div>
          <div className="chat-controls-extra COL" style={{ justifyContent: 'end' }}>
            <button style={{ padding: '0 2px' }} onClick={() => Edit.exec(textareaRef.current!, 'redo')}>
              ↷
            </button>
            <button style={{ padding: '0 2px' }} onClick={() => Edit.exec(textareaRef.current!, 'undo')}>
              ↶
            </button>
          </div>
          <textarea-container className="FILL" ref={textareaContainerRef} onKeyDown={onContainerKeyDown}>
            <textarea
              className="chatTextarea"
              ref={textareaRef}
              accessKey="z"
              enterKeyHint={enter_submits() ? 'send' : 'enter'}
              onFocus={() => setActiveEditor(editorHandle.current)}
            />
          </textarea-container>
          <div className="COL">
            (temp)
            <button className="FILL" onClick={() => send_message()}>
              Send
            </button>
          </div>
        </div>
      </div>
    </view-root>
  )
}

// page.js:559 View.register('page', PageView) + View.register('pages', {Redirect})
register('page', { Start, Component: PageView })
register('pages', {
  Redirect(location) {
    location.type = 'page'
  },
})

// page.js:564-614 — the chat-related Settings, registered as import side effects (init order =
// registration order). The commented-out big_avatar / big_avatar_id fields stay commented.
Settings.add({ name: 'nickname', label: 'Chat Nickname', type: 'text', order: -9000 })
Settings.add({
  name: 'chat_markup',
  label: 'Chat Markup',
  type: 'select',
  options: ['12y2', '12y', 'plaintext'],
  order: -8000,
})
Settings.add({ name: 'avatar', label: 'Device Avatar', type: 'text', order: -7000 })
Settings.add({
  name: 'avatar_pixel',
  label: 'Pixelate My Avatar',
  type: 'select',
  options: ['off', 'on'],
  order: -6000,
})
Settings.add({
  name: 'pixel_art',
  label: 'Display Pixel Avatars',
  type: 'select',
  options: ['on', 'off'],
  default: 'off',
  order: -5000,
  update(value) {
    if (value == 'on') Apx.start()
    else {
      Apx.stop()
      for (const img of document.querySelectorAll<HTMLElement>('.apx')) {
        img.classList.remove('pixelAvatar')
        img.style.width = ''
        img.style.height = ''
      }
    }
  },
})
Settings.add({
  name: 'chat_enter',
  label: 'Chat Enter Key',
  type: 'select',
  options: ['submit', 'newline', 'submit, strip trailing', 'newline, strip trailing'],
})

export { PageView }
