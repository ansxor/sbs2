// Adapter preserving the original MessageList constructor API while delegating to the
// React-based implementation in components/messages/MessageList.tsx.
//
// The old imperative controller (messages.js / services/message-list.ts) is replaced by a React
// component rendering the same <message-list> / <message-block> / <message-part> / <reply-block>
// structure. For call sites that still construct a MessageList instance around an existing DOM
// host (CommentsView.draw_result, PageView.update_pinned), this adapter renders the React tree into
// that host and exposes the same imperative methods via a ref. The live subscription handling in
// MessageListView.tsx is kept as React props instead of a separate imperative controller.
//
// Because `new MessageList` may be called during React render (e.g. inside Scroller.print_top),
// the adapter does NOT flush synchronously. Instead it renders the component and queues method
// calls until the handle is available. Methods called before mount are buffered and replayed after
// the component mounts.

import type { Id, Message } from '../data/types'
import { createRoot, type Root } from 'react-dom/client'
import * as React from 'react'
import { MessageListComponent, type MessageListHandle } from '../components/messages/MessageList'
import { send_mce } from '../components/messages/MessageControls'

// Re-export the censor helper used by other modules.
export { censorSpoilerText } from './draw'

// Opaque part handle (frozen L0 contract = unknown).
export type MessagePart = unknown

type QueuedCall = () => void

type MessageListApi = Omit<MessageListHandle, '$list'>

export class MessageList implements MessageListApi {
  $list: HTMLElement
  private root: Root
  private handleRef: React.MutableRefObject<MessageListHandle | null>
  private queue: QueuedCall[] = []
  private mounted = false
  pid: Id
  rooms?: Set<Id>

  constructor(element: HTMLElement, pid: Id, _edit?: boolean, rooms?: Set<Id>) {
    this.$list = element
    this.pid = pid
    this.rooms = rooms

    // The original constructor added the 'message-list' class to the host element. React will
    // render the same host with the same class, but for callers that already created the host
    // (PageView.update_pinned, CommentsView.draw_result) we keep class parity on the outer node.
    this.$list.classList.add('message-list')

    this.handleRef = { current: null }
    this.root = createRoot(this.$list)

    this.root.render(
      React.createElement(MessageListComponent, {
        ref: (handle: MessageListHandle | null) => {
          this.handleRef.current = handle
          if (handle && !this.mounted) {
            this.mounted = true
            this.flush_queue()
          }
        },
        pageId: pid,
        edit: _edit,
        rooms,
        host: this.$list,
      }),
    )
  }

  private flush_queue(): void {
    for (const call of this.queue) {
      try {
        call()
      } catch (err) {
        console.error(err)
      }
    }
    this.queue = []
  }

  private run<T>(fn: (handle: MessageListHandle) => T): T {
    const handle = this.handleRef.current
    if (handle) return fn(handle)
    throw new Error('MessageList handle is not available')
  }

  private queue_call(fn: (handle: MessageListHandle) => void): void {
    const handle = this.handleRef.current
    if (handle) {
      fn(handle)
    } else {
      this.queue.push(() => fn(this.handleRef.current!))
    }
  }

  destroy(): void {
    this.queue = []
    this.root.unmount()
  }

  display_edge(msg: Message): MessagePart {
    if (this.handleRef.current) return this.handleRef.current.display_edge(msg)
    const m = msg
    this.queue.push(() => this.handleRef.current!.display_edge(m))
    return undefined as unknown as MessagePart
  }
  display_top(msg: Message): MessagePart {
    if (this.handleRef.current) return this.handleRef.current.display_top(msg)
    const m = msg
    this.queue.push(() => this.handleRef.current!.display_top(m))
    return undefined as unknown as MessagePart
  }
  display_bottom(msg: Message): MessagePart {
    if (this.handleRef.current) return this.handleRef.current.display_bottom(msg)
    const m = msg
    this.queue.push(() => this.handleRef.current!.display_bottom(m))
    return undefined as unknown as MessagePart
  }
  display_only(msg: Message): MessagePart {
    if (this.handleRef.current) return this.handleRef.current.display_only(msg)
    const m = msg
    this.queue.push(() => this.handleRef.current!.display_only(m))
    return undefined as unknown as MessagePart
  }
  display_around(relative: MessagePart, msg: Message, where: 'before' | 'after' = 'before'): MessagePart {
    if (this.handleRef.current) return this.handleRef.current.display_around(relative, msg, where)
    const rel = relative
    const m = msg
    const w = where
    this.queue.push(() => this.handleRef.current!.display_around(rel, m, w))
    return undefined as unknown as MessagePart
  }
  display_live(msg: Message, cb?: (() => void) | null): boolean | null {
    if (this.handleRef.current) return this.handleRef.current.display_live(msg, cb)
    const m = msg
    const c = cb
    this.queue.push(() => this.handleRef.current!.display_live(m, c))
    return null
  }
  replace(existing: MessagePart, msg: Message): MessagePart | null {
    if (this.handleRef.current) return this.handleRef.current.replace(existing, msg)
    const ex = existing
    const m = msg
    this.queue.push(() => this.handleRef.current!.replace(ex, m))
    return null
  }
  remove(part: MessagePart): void {
    this.queue_call((handle) => handle.remove(part))
  }
  load_messages_near(top: boolean, amount: number, callback?: ((had: boolean) => void) | null): void {
    this.queue_call((handle) => handle.load_messages_near(top, amount, callback))
  }
  get_reply_message(id: number): Promise<Message> {
    if (this.handleRef.current) return this.handleRef.current.get_reply_message(id)
    const i = id
    return new Promise<Message>((resolve, reject) => {
      this.queue.push(() => {
        this.handleRef.current!.get_reply_message(i).then(resolve, reject)
      })
    })
  }
  over_limit(): boolean {
    return this.run((handle) => handle.over_limit())
  }
  limit_messages(): void {
    this.queue_call((handle) => handle.limit_messages())
  }
  rethread(msg: Message): MessagePart {
    if (this.handleRef.current) return this.handleRef.current.rethread(msg)
    const m = msg
    this.queue.push(() => this.handleRef.current!.rethread(m))
    return undefined as unknown as MessagePart
  }
  newest(): Message | null {
    return this.run((handle) => handle.newest())
  }
  oldest(): Message | null {
    return this.run((handle) => handle.oldest())
  }
  messages(): Message[] {
    return this.run((handle) => handle.messages())
  }

  // Static shared controls helper. The original installed a single floating <message-controls>
  // singleton that moved between lists on hover. We keep the same event shape and global helper
  // here; the actual singleton DOM is maintained by MessageControls.tsx.
  static send_mce(action: string, data: unknown, target: EventTarget): void {
    send_mce(action, data, target)
  }
}

export type { MessageListHandle }
