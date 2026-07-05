// L7b — src/Views/comments.js ported. Route `comments` (+ `chatlogs` redirect): a chat-search
// form (text / page ids / user ids / date range / id range / pagination / reverse) that builds an
// `Lp.chain` query byte-identical to the original and renders result groups, each a `MessageList`
// island with load-older/newer buttons.
//
// Structure (ARCHITECTURE §0/§6/§12): the RouteModule exposes `Start(loc)` (builds the chain, or
// `{quick}` for an empty form) and the Component. Start and the Component both derive their query
// state from `loc` via the same pure `prepare()` helper, so the merge/quick/pid decisions match
// exactly. The interactive `<Form>` (useForm) is a separate stateful controller used only for
// display + re-navigation (`go`). The result groups are now React components rendered into the
// results container, each hosting its own `MessageList` imperative adapter.

import { useLayoutEffect, useRef, useState } from 'react'
import type { Chain, Content, EntityList, Id, Message, NavLocation, StartResult, ViewComponentProps } from '../data/types'
import { MessageList, type MessageListHandle } from '../services/message-list'
import { MessageInfo } from '../components/MessageInfo'
import { content_label } from '../services/draw-dom'
import { Nav } from '../services/nav'
import { nl_from_query } from '../core/util'
import { Form, useForm, type FormSpec } from '../components/Form'
import type { RangeValue } from '../components/Form'
import type { RouteModule } from '../routing/view-registry'

// ---- form spec (comments.js Start) — field order + params are load-bearing (query keys) ----
const FORM_SPEC: FormSpec = {
  fields: [
    ['search', 'text', { param: 's' }],
    ['pages', 'number_list', { param: 'pid' }],
    ['users', 'number_list', { param: 'uid' }],
    ['start', 'date', { param: 'start' }],
    ['end', 'date', { param: 'end' }],
    ['range', 'range', { param: 'ids' }],
  ],
}

// fill.js:164 rmatch — .match returning [] on no match so destructuring never throws.
function rmatch(re: RegExp, str: string): RegExpMatchArray | never[] {
  return str.match(re) || []
}

// input.js range.decode/from_query.
function decode_range(x: string): RangeValue | null {
  const match = rmatch(/^([\d.]+)(?:-([\d.]+))?$/, x)
  if (!match[1]) return null
  const min = Number(match[1])
  const max = match[2] ? Number(match[2]) : null
  return { min, max, ids: [min, max].filter((n) => n != null && Number.isFinite(n)) as number[] }
}

// The structured form data (comments.js `this.form.get()`), plus the pagination scalars.
interface SearchData {
  search: string | null
  pages: Id[] | null
  users: Id[] | null
  start: Date | null
  end: Date | null
  range: RangeValue | null
}

// comments.js build_search — returns [chainOrNull, merge]. Query strings/order/limit/skip are
// reproduced byte-for-byte (the empty-form check deliberately ignores `data.pages`, kept).
function build_search(
  data: SearchData,
  page: number,
  limit: number,
  reverse: boolean,
): [Chain | null, boolean] {
  const query: string[] = []
  const values: Record<string, unknown> = {}
  let merge = true
  let order: 'id' | 'id_desc' = reverse ? 'id_desc' : 'id'

  if (data.search) {
    values.search = data.search
    query.push('text MATCHES @search')
  }
  if (data.pages) {
    values.pages = data.pages
    query.push('contentId IN @pages')
    if (data.pages.length > 1) merge = false
  } else {
    merge = false
  }
  if (data.users) {
    values.users = data.users
    query.push('createUserId IN @users')
  }

  const range = data.range
  if (range) {
    if (range.ids) {
      values.ids = range.ids
      query.push('id IN @ids')
      if (range.ids.length > 1) merge = false
    } else {
      if (range.min != null) {
        values.min_id = range.min - 1
        query.push('id > @min_id')
      }
      if (range.max != null) {
        values.max_id = range.max + 1
        query.push('id < @max_id')
      }
    }
  }

  if (!data.pages || data.pages.length > 1) merge = false // temporary hack disable

  if (data.start) {
    values.start = data.start.toISOString()
    query.push('createDate > @start')
  }
  if (data.end) {
    values.end = data.end.toISOString()
    query.push('createDate < @end')
  }
  if (page < 1) page = 1
  limit = limit || 200
  const skip = (page - 1) * limit

  return [
    {
      values,
      requests: [
        { type: 'message', fields: '*', query: query.join(' AND '), order, limit, skip },
        { name: 'replies', type: 'message', fields: '*', query: 'id in @message.values.replyingTo' },
        {
          type: 'content',
          fields: 'name,id,createUserId,permissions,contentType,literalType,values',
          query: 'id IN @message.contentId',
        },
        {
          type: 'user',
          fields: '*',
          query: 'id IN @message.createUserId OR id IN @content.createUserId OR id IN @replies.createUserId',
        },
      ],
    },
    merge,
  ]
}

// comments.js Start — derive the whole query state from a location. Called by both the
// RouteModule Start (to produce the chain) and the Component (to reproduce merge/pid/quick).
interface Prepared {
  page: number
  limit: number
  reverse: boolean
  pid: Id | null
  chain: Chain | null
  merge: boolean
}
function prepare(loc: NavLocation): Prepared {
  const query = loc.query
  const id = loc.id
  const data: SearchData = {
    search: query.s !== undefined ? query.s : null,
    pages: id ? [id as number] : nl_from_query(query.pid),
    users: nl_from_query(query.uid),
    start: query.start ? new Date(query.start) : null,
    end: query.end ? new Date(query.end) : null,
    range: decode_range(query.ids),
  }
  const page = Math.max(Number(query.page) | 0, 1)
  const limit = Number(query.limit) | 0
  const reverse = query.r != null
  const pid = id ? (id as Id) : null
  const [chain, merge] = build_search(data, page, limit, reverse)
  return { page, limit, reverse, pid, chain, merge }
}

// draw.js:226 event_lock — gate a button handler on `elem.disabled`; hand back a `done()` that
// re-enables. Reimplemented inline (Draw.event_lock is not a shared export in the port).
function event_lock(
  callback: (done: () => void, elem: HTMLButtonElement) => void,
): (ev: React.MouseEvent<HTMLButtonElement>) => void {
  return (ev) => {
    const elem = ev.currentTarget
    if (elem.disabled) return
    elem.disabled = true
    callback(() => {
      elem.disabled = false
    }, elem)
  }
}

interface SearchResultGroupProps {
  comment: Message | Message[]
  pages: EntityList<Content>
}

// React component for one search result group. A single Message or a merged edge-run is rendered
// into its own <message-list> via the adapter, with load older/newer buttons wired to the list.
function SearchResultGroup({ comment, pages }: SearchResultGroupProps): React.JSX.Element {
  const listElRef = useRef<HTMLElement>(null)
  const pageLabelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<MessageListHandle | null>(null)
  const [pid, setPid] = useState<Id>(0)

  const parent = pages[~pid] as Content

  useLayoutEffect(() => {
    const pageLabel = pageLabelRef.current
    if (pageLabel) {
      pageLabel.replaceChildren()
      if (parent) pageLabel.append(content_label(parent))
    }
  }, [parent])

  useLayoutEffect(() => {
    const host = listElRef.current!
    host.className = 'FILL message-list'
    const pid0 = Array.isArray(comment) ? comment[0]!.contentId : comment.contentId
    setPid(pid0)
    const list = new MessageList(host, pid0)
    listRef.current = list
    if (Array.isArray(comment)) {
      for (const c of comment) list.display_edge(c)
    } else {
      list.display_only(comment)
    }
    return () => {
      list.destroy()
    }
  }, [comment])

  const onLoad = event_lock((done, elem) => {
    const old = elem.dataset.action == 'load_older'
    listRef.current?.load_messages_near(old, 10, (ok) => {
      if (ok) done()
    })
  })

  return (
    <div className="search-comment">
      <div ref={pageLabelRef} className="bar rem1-5 search-comment-page" />
      <div className="ROW">
        <div className="search-comment-buttons COL">
          <button data-action="load_older" onClick={onLoad}>
            ↑
          </button>
          <button data-action="load_newer" onClick={onLoad}>
            ↓
          </button>
        </div>
        <message-list ref={listElRef} />
      </div>
    </div>
  )
}

// ---- React Component (comments.js Init/Render/Quick/go) ----------------------------------------
function CommentsComponent({ data, loc, header }: ViewComponentProps): React.JSX.Element {
  const prep = prepare(loc)
  const form = useForm(FORM_SPEC)

  const rootRef = useRef<HTMLElement>(null)
  const pageRef = useRef<HTMLInputElement>(null)
  const limitRef = useRef<HTMLInputElement>(null)
  const orderRef = useRef<HTMLInputElement>(null)

  const [status, setStatus] = useState<string | number>('')
  const [selected, setSelected] = useState<Message | null>(null)

  // Init: from_query(query) + id override + write() into the mounted form.
  useLayoutEffect(() => {
    form.from_query(loc.query)
    if (loc.id) form.inputs.pages.value = [loc.id as Id]
    form.write()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  // Init: set the header title and, for a single-page search, the page link. The frozen
  // add_header_links takes prebuilt Nodes, so the old {href,label,icon} → <a> construction
  // (navigate.js:66) moves here. Runs once per mount; the Slot keys the Component by location,
  // so a navigation remounts the view and this effect runs again with the new page's data.
  useLayoutEffect(() => {
    const links: Node[] = []
    header.set_title('Chat Search')
    if (prep.pid) {
      const a = document.createElement('a')
      a.href = '#page/' + prep.pid
      a.target = '_self'
      const label = document.createElement('span')
      label.textContent = 'page'
      a.append(label)
      const icon = document.createElement('span')
      icon.className = 'text-shadow'
      icon.append('📄️')
      a.prepend(icon)
      links.push(a)
      header.add_header_links(a)
    }
    return () => {
      for (const link of links) (link as ChildNode).remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Init: message_control 'info' handler on the view-root (bubble phase) → open MessageInfo.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const on_control = (ev: Event): void => {
      const e = ev as CustomEvent<{ action: string; data: unknown }>
      if (e.detail.action == 'info') {
        e.stopPropagation()
        setSelected(e.detail.data as Message)
      }
    }
    root.addEventListener('message_control', on_control)
    return () => root.removeEventListener('message_control', on_control)
  }, [])

  // Render / Quick — build the result groups and set the status text.
  const groups = (() => {
    if (!prep.chain) {
      return { status: '(no query)', nodes: null as React.ReactNode }
    }
    const comments = (data.message as EntityList<Message>) || []
    const pages = data.content as EntityList<Content>
    if (!comments.length) {
      return { status: '(none)', nodes: null }
    }
    const nodes = prep.merge
      ? [<SearchResultGroup key="merge" comment={comments as Message[]} pages={pages} />]
      : comments.map((msg) => <SearchResultGroup key={msg.id} comment={msg} pages={pages} />)
    return { status: comments.length, nodes }
  })()

  useLayoutEffect(() => {
    setStatus(groups.status)
  }, [groups.status])

  // go(dir) — recompute the query from the form + pagination and re-navigate the (focused) slot.
  const go = (dir: number | null): void => {
    form.read()

    let pnum = Math.max(Number(pageRef.current!.value) | 0, 1)
    if (dir) {
      pnum += dir
      if (pnum < 1) pnum = 1
    }
    const reverse = orderRef.current!.checked
    const limit = Number(limitRef.current!.value) | 0

    const query = form.to_query()

    let id: Id | string | null
    const pages = form.inputs.pages.value as number[] | null
    if (pages && pages.length == 1) {
      id = pages[0]!
      delete query.pid
    } else {
      id = null
    }

    if (reverse) query.r = ''
    else delete query.r

    if (limit) query.limit = String(limit)
    else delete query.limit

    if (pnum != 1) query.page = String(pnum)
    else delete query.page

    Nav.load_location({ type: loc.type, id, query, fragment: loc.fragment })
  }

  const on_submit = (e: React.FormEvent<HTMLFormElement>): void => {
    console.log(e)
    e.preventDefault()
    const btn = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    if (btn && btn.name == 'prev') go(-1)
    else if (btn && btn.name == 'next') go(1)
    else go(null)
  }

  return (
    <view-root ref={rootRef} class="COL">
      <div className="FILL" style={{ overflowY: 'scroll' }}>
        <form
          method="dialog"
          onSubmit={on_submit}
          style={{ background: '#666', color: 'white' }}
        >
          <Form handle={form} />
          <div className="nav">
            <label>
              new first:<input type="checkbox" ref={orderRef} defaultChecked={prep.reverse} />
            </label>
            &nbsp;
            <button name="search" style={{ marginRight: 'auto' }}>
              🔍Search
            </button>
            <span>{status}</span>/
            <input ref={limitRef} style={{ width: '6ch' }} placeholder="200" defaultValue={prep.limit || ''} />
            &nbsp;page:
            <button name="prev">◀</button>
            <input ref={pageRef} style={{ width: '4ch' }} defaultValue={prep.page} />
            <button name="next">▶</button>
          </div>
        </form>
        <div className="comment-search-results">{groups.nodes}</div>
      </div>
      <div>
        <MessageInfo selected={selected} onClose={() => setSelected(null)} />
      </div>
    </view-root>
  )
}

// ---- RouteModule (comments.js Start) -----------------------------------------------------------
export const CommentsView: RouteModule = {
  Start(loc: NavLocation): StartResult {
    const { chain } = prepare(loc)
    if (!chain) return { quick: true }
    return { chain }
  },
  Component: CommentsComponent,
}

// comments.js: View.register('chatlogs', {Redirect}) — copy t→s / s / pid / uid into a fresh query
// with `r` first (to preserve key order), drop to `comments`, and (single pid) fold pid into id.
// Registered centrally by routing/routes.ts.
