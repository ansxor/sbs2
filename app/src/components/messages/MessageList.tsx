// The chat MessageList as idiomatic React components.
//
// Preserves the behavior of the old imperative controller (messages.js → services/message-list.ts):
// - merge by Author.merge_hash within 5 minutes; in multi-room mode also require same contentId
// - boundary-top/bottom markers on the first loaded message of each load_messages_near batch
// - live display_live tri-state return (true|false|null)
// - reply lazy-loading via get_reply_message with Lp.chain
// - %uid% substitution in message text using msg.LinkedUsers
// - message_control CustomEvent capture-phase injection on <message-list>
// - block-list hiding via isUserBlocked and reactive subscription
// - shared floating <message-controls> singleton (kept in services/message-list.ts)
//
// The component keeps canonical message order in a React ref and exposes an imperative handle
// via useImperativeHandle so the views can still call display_edge, display_live, etc.
// React state is only updated with flushSync where the synchronous imperative contract requires it.

import * as React from 'react'
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Id, Message } from '../../data/types'
import type { ListMap } from '../../data/types'
import { Req } from '../../services/request'
import { Lp } from '../../services/socket'
import { convert } from '../../services/markup'
import { avatar_url, time_string, censorSpoilerText, recalc_image_scale } from '../../services/draw'
import { Settings } from '../../services/settings'
import { isUserBlocked, subscribe as subscribeBlocks } from '../../services/block'
import { print } from '../../services/sidebar-log'
import { send_mce, MessageControls } from './MessageControls'

// Re-exports needed by the adapter module and public API.
export type MessagePartHandle = unknown

export interface MessageListHandle {
  display_edge(msg: Message): MessagePartHandle
  display_top(msg: Message): MessagePartHandle
  display_bottom(msg: Message): MessagePartHandle
  display_only(msg: Message): MessagePartHandle
  display_around(relative: MessagePartHandle, msg: Message, where?: 'before' | 'after'): MessagePartHandle
  display_live(msg: Message, cb?: (() => void) | null): boolean | null
  replace(existing: MessagePartHandle, msg: Message): MessagePartHandle | null
  remove(part: MessagePartHandle): void
  load_messages_near(top: boolean, amount: number, callback?: ((had: boolean) => void) | null): void
  get_reply_message(id: number): Promise<Message>
  over_limit(): boolean
  limit_messages(): void
  rethread(msg: Message): MessagePartHandle
  // Ordered accessors for callers that used to walk the linked-list sentinel (PageView, AllView).
  newest(): Message | null
  oldest(): Message | null
  messages(): Message[]
  // The imperative handle also carries a stable pointer to the DOM container so AllView can
  // query it directly for its room-filter effect.
  $list: HTMLElement | null
}

export interface MessageListProps {
  // Page / content id the list belongs to.
  pageId: Id
  // editpage/comment editing flag (preserved from original API; currently unused internally).
  edit?: boolean
  // Multi-room mode (All view): when set, the list accepts messages from any room in this set.
  rooms?: Set<Id>
  // AllView-specific room filter data. When provided, each rendered block gets the matching
  // room classes / ribbon / label applied synchronously after mount/update.
  roomFilter?: RoomFilterProps
  // The host DOM element that the adapter already created. The component renders its children
  // into this host via a React root, preserving the original tag/classes/attributes.
  host?: HTMLElement | null
  // Optional initial messages to seed the list on first render. Used by PageView for pinned
  // messages, avoiding an imperative display_edge call during a React lifecycle method.
  initialMessages?: Message[]
}

export interface RoomFilterProps {
  visibleRooms: Set<Id> | null
  roomData: Record<Id, { name?: string }>
}

interface Part {
  data: Message
  id: number
  boundary?: 'top' | 'bottom'
  edited?: boolean
}

interface Block {
  key: string
  authorKey: string
  messages: Part[]
  createUserId: number
  contentId: Id
  createDate: Date
  module: string | null
  author: Message['Author']
}

function authorMergeKey(msg: Message): string {
  return `${msg.Author.merge_hash}:${msg.module ?? ''}`
}

function check_merge(top: Message, bottom: Message, rooms?: Set<Id>): boolean {
  if (rooms && top.contentId != bottom.contentId) return false
  if (top.Author.merge_hash == bottom.Author.merge_hash) {
    if (Math.abs(bottom.Author.date.getTime() - top.Author.date.getTime()) <= 1e3 * 60 * 5) return true
  }
  return false
}

function isForThisList(msg: Message, pid: Id, rooms?: Set<Id>): boolean {
  if (rooms) return rooms.has(msg.contentId)
  return msg.contentId == pid
}

export const MessageList = {
  // Keep the static helper accessible for MessageInfo and PageView reply button.
  send_mce(action: string, data: unknown, target: EventTarget): void {
    send_mce(action, data, target)
  },
}

export const MessageListComponent = Object.assign(
  React.forwardRef<MessageListHandle, MessageListProps>(function MessageListComponent(
    { pageId, edit: _edit, rooms, roomFilter, host: hostProp, initialMessages },
    ref,
  ) {
    const $listRef = useRef<HTMLElement | null>(hostProp ?? null)
    const partsRef = useRef<Map<number, Part>>(new Map())
    const orderRef = useRef<Part[]>([])
    const [tick, setTick] = useState(0)

    // Seed initial messages on first render before any imperative API calls.
    const seededRef = useRef(false)
    if (!seededRef.current && initialMessages && initialMessages.length > 0) {
      seededRef.current = true
      orderRef.current = []
      partsRef.current.clear()
      for (const msg of initialMessages) {
        const part: Part = { data: msg, id: msg.id }
        partsRef.current.set(msg.id, part)
        orderRef.current.push(part)
      }
    }

    // Expose the stable container ref for AllView direct DOM queries.
    const newest = useCallback((): Message | null => {
      const order = orderRef.current
      return order[order.length - 1]?.data ?? null
    }, [])

    const oldest = useCallback((): Message | null => {
      return orderRef.current[0]?.data ?? null
    }, [])

    const messages = useCallback((): Message[] => {
      return orderRef.current.map((p) => p.data)
    }, [])

    useImperativeHandle(ref, () => ({
      display_edge,
      display_top,
      display_bottom,
      display_only,
      display_around,
      display_live,
      replace,
      remove,
      load_messages_near,
      get_reply_message,
      over_limit,
      limit_messages,
      rethread,
      newest,
      oldest,
      messages,
      get $list() {
        return $listRef.current
      },
    }))

    const flush = useCallback(() => {
      flushSync(() => setTick((t) => t + 1))
    }, [])

    const add_part = useCallback((msg: Message): Part => {
      const part: Part = { data: msg, id: msg.id }
      partsRef.current.set(msg.id, part)
      return part
    }, [])

    const remove_part = useCallback((part: Part): void => {
      partsRef.current.delete(part.id)
      orderRef.current = orderRef.current.filter((p) => p !== part)
    }, [])

    const display_only = useCallback((msg: Message): MessagePartHandle => {
      orderRef.current = []
      partsRef.current.clear()
      const part = add_part(msg)
      orderRef.current.push(part)
      flush()
      return part
    }, [add_part, flush])

    const display_top = useCallback((msg: Message): MessagePartHandle => {
      const part = add_part(msg)
      orderRef.current.unshift(part)
      flush()
      return part
    }, [add_part, flush])

    const display_bottom = useCallback((msg: Message): MessagePartHandle => {
      const part = add_part(msg)
      orderRef.current.push(part)
      flush()
      return part
    }, [add_part, flush])

    const display_edge = useCallback((msg: Message): MessagePartHandle => {
      const existing = partsRef.current.get(msg.id)
      if (existing) {
        print('warning: duplicate message? ' + msg.id)
        return replace(existing, msg) as MessagePartHandle
      }
      if (orderRef.current.length === 0) return display_only(msg)
      const first = orderRef.current[0]!
      const last = orderRef.current[orderRef.current.length - 1]!
      if (msg.id > last.data.id) return display_bottom(msg)
      if (msg.id < first.data.id) return display_top(msg)
      throw new Error('messages out of order?')
    }, [display_bottom, display_only, display_top])

    const display_around = useCallback(
      (relative: MessagePartHandle, msg: Message, where: 'before' | 'after' = 'before'): MessagePartHandle => {
        const rel = relative as Part
        const idx = orderRef.current.indexOf(rel)
        if (idx < 0) return display_bottom(msg)

        const part = add_part(msg)
        const insertIdx = where == 'before' ? idx : idx + 1
        orderRef.current.splice(insertIdx, 0, part)
        flush()
        return part
      },
      [add_part, display_bottom, flush],
    )

    const rethread = useCallback((msg: Message): MessagePartHandle => {
      let pivot: Part | null = null
      for (let i = orderRef.current.length - 1; i >= 0; i--) {
        const p = orderRef.current[i]!
        if (p.data.id < msg.id) {
          pivot = p
          break
        }
      }
      if (!pivot) return display_top(msg)
      return display_around(pivot, msg, 'after')
    }, [display_around, display_top])

    const remove = useCallback((part: MessagePartHandle): void => {
      remove_part(part as Part)
      flush()
    }, [remove_part, flush])

    const replace = useCallback((existing: MessagePartHandle, msg: Message): MessagePartHandle | null => {
      const ex = existing as Part
      if (msg.deleted) {
        remove(existing)
        return null
      }
      if (!isForThisList(msg, pageId, rooms)) {
        if (!msg.edited) print('warning: impossible? ', msg.id)
        remove(existing)
        return null
      }
      if (!msg.edited) print('warning: duplicate message ', msg.id)
      if (msg.Author.merge_hash != ex.data.Author.merge_hash) {
        remove_part(ex)
        const next = orderRef.current.find((p) => p.id > msg.id) ?? null
        const part = next ? (display_around(next, msg, 'before') as Part) : (display_bottom(msg) as Part)
        flush()
        return part
      }
      ex.data = msg
      ex.edited = true
      flush()
      return ex
    }, [display_around, display_bottom, flush, pageId, remove, remove_part, rooms])

    const display_live = useCallback(
      (msg: Message, cb: (() => void) | null = null): boolean | null => {
        const id = msg.id
        const existing = partsRef.current.get(id)
        if (existing) {
          cb && cb()
          replace(existing, msg)
          return false
        }
        if (msg.deleted || !isForThisList(msg, pageId, rooms)) return null

        const last = orderRef.current[orderRef.current.length - 1]
        if (!last) {
          cb && cb()
          display_only(msg)
          return true
        }
        if (id > last.data.id) {
          cb && cb()
          display_bottom(msg)
          return true
        }
        if (!msg.edited) print('warning: out of order: ', id)
        if (id < orderRef.current[0]!.data.id) return null
        rethread(msg)
        return false
      },
      [display_bottom, display_only, pageId, replace, rethread, rooms],
    )

    const get_reply_message = useCallback((id: number): Promise<Message> => {
      const existing = partsRef.current.get(id)
      if (existing) return Promise.resolve(existing.data)
      return fetch_reply_message(id)
    }, [])

    const load_messages_near = useCallback(
      (top: boolean, amount: number, callback?: ((had: boolean) => void) | null): void => {
        const order = orderRef.current
        const part = top ? order[0] : order[order.length - 1]
        if (!part) return
        const id = part.data.id
        const orderParam = top ? 'id_desc' : 'id'
        const query = `contentId = @pid AND id ${top ? '<' : '>'} @last AND !notdeleted()`
        Lp.chain(
          {
            values: { last: id, pid: pageId },
            requests: [
              { type: 'message', fields: '*', query, order: orderParam, limit: amount },
              { name: 'replies', type: 'message', fields: '*', query: 'id in @message.values.replyingTo' },
              {
                type: 'user',
                fields: '*',
                query: 'id in @message.createUserId OR id IN @replies.createUserId',
              },
            ],
          },
          (resp) => {
            let first = true
            const messages = (resp as ListMap).message
            for (const c of messages) {
              const inserted = display_edge(c) as Part
              if (inserted && first) {
                inserted.boundary = top ? 'bottom' : 'top'
                first = false
              }
            }
            flush()
            callback?.(messages.length != 0)
          },
        )
      },
      [display_edge, flush, pageId],
    )

    const over_limit = useCallback((): boolean => {
      // Parity: the original read `.length` on a Map, which is undefined, so this is always false.
      const partsWithLength = partsRef.current as unknown as { length: number }
      return partsWithLength.length > 500
    }, [])

    const limit_messages = useCallback((): void => {
      // Parity: the original read `.length` on a Map, so `over` is NaN and the loop never runs.
      const partsWithLength = partsRef.current as unknown as { length: number }
      const over = partsWithLength.length - 500
      const order = orderRef.current
      for (let i = 0; i < over; i++) {
        const part = order[i]
        if (part) remove(part)
      }
    }, [remove])

    // Block-list reactive update: keep messages hidden/shown.
    useEffect(() => {
      return subscribeBlocks(() => {
        setTick((t) => t + 1)
      })
    }, [])

    // Keep the host ref in sync when the prop changes (e.g. pinned list ref is set after mount).
    useLayoutEffect(() => {
      if (hostProp) $listRef.current = hostProp
    }, [hostProp])

    // Native message_control capture listener: inject the part data into the event detail,
    // exactly as the original controller did. React synthetic events don't cover CustomEvents
    // bubbling from arbitrary targets, so this is attached directly to the DOM element.
    useEffect(() => {
      const host = hostProp ?? $listRef.current
      if (!host) return
      const handler = (ev: Event): void => {
        const partEl = (ev.target as HTMLElement).closest('message-part') as HTMLElement | null
        if (!partEl) return
        const id = Number(partEl.dataset.id)
        const part = partsRef.current.get(id)
        if (!part) return
        const ce = ev as CustomEvent
        if (ce.detail && typeof ce.detail === 'object') {
          ce.detail.data = part.data
        }
      }
      host.addEventListener('message_control', handler, { capture: true })
      return () => host.removeEventListener('message_control', handler, { capture: true })
    }, [hostProp])

    // Build merged blocks from ordered parts. Merging is recomputed on every render because
    // the ordering / insertion logic is simple and keeps parity with the original linked list.
    const blocks = useMemo((): Block[] => {
      const order = orderRef.current
      const out: Block[] = []
      let current: Block | null = null
      for (let i = 0; i < order.length; i++) {
        const part = order[i]!
        const msg = part.data
        if (current && check_merge(current.messages[current.messages.length - 1]!.data, msg, rooms)) {
          current.messages.push(part)
        } else {
          current = {
            key: `${msg.id}-${i}`,
            authorKey: authorMergeKey(msg),
            messages: [part],
            createUserId: msg.createUserId,
            contentId: msg.contentId,
            createDate: msg.Author.date,
            module: msg.module,
            author: msg.Author,
          }
          out.push(current)
        }
      }
      return out
    }, [rooms, tick])

    return (
      <>
        <MessageControls />
        {blocks.map((block) => (
          <MessageBlockComponent
            key={block.key}
            block={block}
            roomFilter={roomFilter}
          />
        ))}
      </>
    )
  }),
)

interface MessageBlockProps {
  block: Block
  roomFilter?: RoomFilterProps
}

function MessageBlockComponent({ block, roomFilter }: MessageBlockProps): React.JSX.Element {
  const { author, module, createUserId, contentId, messages } = block
  const hidden = isUserBlocked(createUserId)
  const roomHidden =
    roomFilter && roomFilter.visibleRooms !== null && !roomFilter.visibleRooms.has(contentId)
  const color = roomFilter ? getRoomColor(contentId) : undefined
  const roomName = roomFilter?.roomData[contentId]?.name ?? ''

  const className = buildClassName([
    'message-block',
    hidden && 'blocked',
    roomHidden && 'room-hidden',
    module !== null && 'module',
  ])

  const style: React.CSSProperties & { '--room-color'?: string } = {}
  if (color) style['--room-color'] = color

  const ref = useRef<HTMLElement>(null)

  return (
    <message-block
      ref={ref}
      class={className}
      data-uid={String(createUserId)}
      data-pid={String(contentId)}
      style={style}
    >
      {roomFilter && roomName && (
        <span className="room-ribbon-label" title={roomName}>
          {roomName}
        </span>
      )}
      {module === null ? (
        <MessageAvatar author={author} />
      ) : (
        <span className="module-name">{module}</span>
      )}
      <message-header>
        <span>
          <b className="pre">{author.username}</b>
          {': '}
        </span>
        <span role="time">{'\t\u00ad\t' + time_string(author.date)}</span>
      </message-header>
      <div>
        {messages.map((part) => (
          <MessagePartComponent
            key={part.id}
            part={part}
            module={module}
            boundary={part.boundary}
          />
        ))}
      </div>
    </message-block>
  )
}

interface MessageAvatarProps {
  author: Message['Author']
}

function MessageAvatar({ author }: MessageAvatarProps): React.JSX.Element {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const img = ref.current
    if (!img || !author.avatar_pixel || Settings.values.pixel_art != 'on') return
    if (img.naturalWidth) {
      recalc_image_scale(img)
    } else {
      img.decode().then(() => recalc_image_scale(img)).catch(() => {})
    }
  }, [author.avatar_pixel])

  let className = 'avatar'
  if (author.bigAvatar) className = 'bigAvatar'
  else if (author.avatar_pixel) className += ' apx'

  return <img ref={ref} className={className} width={50} height={50} alt="----" src={avatar_url(author)} />
}

interface MessagePartProps {
  part: Part
  module: string | null
  boundary?: 'top' | 'bottom'
}

function MessagePartComponent({ part, module, boundary }: MessagePartProps): React.JSX.Element {
  const { data } = part
  const containerRef = useRef<HTMLDivElement>(null)
  const replyRef = useRef<HTMLElement>(null)

  // Render markup and reply block imperatively inside the part container, matching the original
  // design where markup2 owns the inner DOM and reply blocks are inserted before the content.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Compute text with %uid% substitution and spoiler censor.
    let text = data.text
    if (module !== null && data.uidsInText.length > 0) {
      data.LinkedUsers.forEach((user) => {
        text = text.replace(new RegExp(`%${user.id}%`, 'g'), user.username)
      })
    }
    text = censorSpoilerText(text)

    // Render markup into the inner div (second child of <message-part>). Preserve the original
    // structure: <message-part><div /></message-part>.
    convert(text, data.values.m as string, container, { intersection_observer: null })

    // Handle reply block.
    if (data.values.replyingTo) {
      const replyLink = replyRef.current?.lastElementChild as HTMLElement | undefined
      if (replyLink) {
        if (data.Author.reply) {
          draw_reply_block(replyLink, data.Author.reply)
        } else {
          fetch_reply_message(data.values.replyingTo as number)
            .then((msg: Message) => draw_reply_block(replyLink, msg))
            .catch(() => draw_reply_block(replyLink))
        }
      }
    }
  }, [data, module])

  const className = buildClassName([
    'message-part',
    (data.edited || part.edited) && 'edited',
    boundary && 'boundary-' + boundary,
  ])

  return (
    <message-part
      role="listitem"
      data-id={String(data.id)}
      class={className}
    >
      {data.values.replyingTo ? (
        <reply-block ref={replyRef} class="bar ellipsis">
          ⤴️ <b>Reply to</b>{' '}
          <a>
            <img className="item avatar" alt="" />
            <span className="entity-title pre" />
            <span>Loading...</span>
          </a>
        </reply-block>
      ) : null}
      <div ref={containerRef} />
    </message-part>
  )
}

function fetch_reply_message(id: number): Promise<Message> {
  return new Promise<Message>((resolve, reject) => {
    Req.chain({
      values: { key: id },
      requests: [
        { type: 'message', fields: '*', query: 'id = @key' },
        { type: 'user', fields: '*', query: 'id in @message.createUserId' },
      ],
    }).do = (resp, err) => {
      if (err) reject(err)
      const messages = resp.message
      resolve(messages[~id])
    }
  })
}

function draw_reply_block(target: HTMLElement, msg?: Message): void {
  const [avatar, name, content] = target.children
  if (!msg) {
    ;(content as HTMLElement).textContent = 'Not Available'
    return
  }
  ;(target as HTMLAnchorElement).href = `#comments?ids=${msg.id}`
  ;(avatar as HTMLImageElement).src = avatar_url(msg.Author)
  ;(name as HTMLElement).textContent = msg.Author.username
  ;(content as HTMLElement).textContent = censorSpoilerText(msg.text)
}

function buildClassName(parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

// Simple deterministic room color generator for AllView ribbons.
function getRoomColor(id: Id): string {
  const hue = Math.abs((id * 37) % 360)
  return `hsl(${hue}, 60%, 50%)`
}

// Preserve the public type export for the adapter module.
export type { Message }
