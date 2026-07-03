// Single-WebSocket singleton — near-verbatim TS port of src/socket.js (ARCHITECTURE §9 "Socket",
// §10 module map row `socket.js`, L3 transport / L3b owner). Replaces the L0 stub.
//
// PARITY-CRITICAL BEHAVIOR (kept exactly):
//   - ONE WebSocket at a time (`is_alive()` guard; "Tried to open multiple websockets" throw).
//   - URL `${ws_url}/api/live/ws?lastId=<last_id>&token=<encodeURIComponent(Req.auth)>` (http→ws).
//   - Request/response correlation via `🧦N` ids in the `handlers` Map; `~id` map keys in
//     process_live dispatched via Events (messages/after_messages/user_edit/userlist) plus
//     Act.normal.activity + StatusDisplay.update_user.
//   - setuserstatus batching (my_statuses / my_status_queue; the run-once for..in + break).
//   - lastId cursor advanced on `live`/`lastId`; reset to 0 on `unexpected`/ExpiredCheckpoint.
//   - Reconnect state machine: wall-clock last_reconnect/last_life/fails, online_and_visible() gate,
//     iOS blur/focus <1000ms debounce, ping-on-stale (>30s), fails>5 give-up, on_ready resend of
//     all pending requests (may duplicate — kept), 401/badtoken alert + log_out (no auto-relogin).
//   - Writes documentElement data-socket-state / data-socket-pending imperatively.
//
// PORT NOTES / DEVIATIONS from the original file:
//   - The original was `const Lp = NAMESPACE({...})` where `NAMESPACE = Object.seal` (fill.js:176).
//     Reproduced as an object literal + `Object.seal(Lp)`; the whole thing is one sealed singleton
//     with `this`-bound methods and wall-clock fields, exactly as before.
//   - `StatusDisplay` lives in a higher layer (L4d) with no stub at this layer, so `update_user`
//     is reached through an injected sink (`setStatusUpdateUser`), mirroring request.ts's
//     `setSidebarTabSelect`. No-op until L4/L6 registers it; in the assembled app it is registered
//     before any live user_event can arrive.
//   - `Error.prototype.trim_stack` (fill.js:32) is reproduced as a local `trimStack()` helper rather
//     than vandalizing the global Error prototype (per the architecture's rule + request.ts precedent).
//     No-op on V8, identical to the original.
//   - `last_id` starts `""` but the wire sets it to a number (`data.lastId`, `0`); the LpApi type is
//     widened to `string | number` (a backward-compatible superset of the stub's `string`). Only
//     ever interpolated into the URL, so string/number are observably identical.
//   - LpApi is extended additively to expose the singleton's full internal surface (handlers,
//     reconnect fields, etc.). The stub's public members keep identical signatures.
import type { Chain, Id, ListMap, ListMapMap, User } from '../data/types'
import { SELF_DESTRUCT } from '../core/self-destruct'
import { Entity } from '../data/entity'
import { Events } from './events'
import { Req } from './request'
import { Act } from './activity'

// --- StatusDisplay bridge (process_live user_event → StatusDisplay.update_user) ------------------
// StatusDisplay is an L4 service with no stub here; L4/L6 registers its update_user via this sink.
type StatusUpdateUser = (user: User) => void
let statusUpdateUser: StatusUpdateUser | null = null
export function setStatusUpdateUser(fn: StatusUpdateUser | null): void {
  statusUpdateUser = fn
}

// Custom-Error stack trimming from src/fill.js:32 (Error.prototype.trim_stack). NOT ported to the
// global Error prototype; reproduced locally. On V8 (Error.captureStackTrace present) it is a no-op,
// matching the original exactly.
function trimStack(err: Error, levels = 1): void {
  if ('captureStackTrace' in Error) return
  while (levels-- > -1) {
    if (err.stack) err.stack = err.stack.replace(/^.*\n/, '')
  }
}

// socket.js:8-21.
class SocketRequestError extends TypeError {
  // 📥 resp: api websocket response object
  resp: any
  request: any

  constructor(resp: any, req: any) {
    super()
    trimStack(this)
    this.resp = resp
    this.request = req
    this.message = '\n' + resp.error
  }
  override toString(): string {
    return this.name + ': ' + this.message + '\n-------\n' + JSON.stringify(this.request)
  }
}
SocketRequestError.prototype.name = 'SocketRequestError'

// live requests resolve to a small handle carrying the `🧦N` request id.
export interface LpHandle {
  id: string
}

interface LpHandlerEntry {
  request: any
  // on error the callback is invoked (poison, err) per the SELF_DESTRUCT convention.
  callback: (resp: any, err?: Error) => void
}

export interface LpApi {
  // map(contentId -> map(userId -> status))
  statuses: { [contentId: string]: any }
  online: { [uid: string]: string }
  // map(userId -> user) — never cleared (documented leak, kept)
  users: { [uid: string]: User }
  // all of your statuses (map of contentId -> string)
  my_statuses: { [contentId: string]: string }
  // status changes which haven't been sent yet
  my_status_queue: { [contentId: string]: string }

  online_change(): boolean
  handle_statuses(statuses: any, objects: ListMap): void
  set_status(id: Id, value: string): void
  flush_statuses(callback?: (() => void) | null): void

  request(request: { type: string; data?: unknown; id?: string }, callback?: (resp: any) => void): LpHandle
  chain(data: Chain, callback?: (resp: any) => void): LpHandle
  ping(callback?: (resp: any) => void): LpHandle
  userlist(callback?: (resp: any) => void): LpHandle
  cancel(handle: { id: string }): void

  // requests waiting for responses (id -> {request, callback})
  handlers: Map<string, LpHandlerEntry>
  handler_id: number
  ready: boolean
  last_id: string | number
  no_restart: boolean
  websocket: WebSocket | null
  message_count: number

  state_change(state: string): void
  handler_count(): void

  stop(): void
  on_ready(): void
  is_alive(): boolean
  kill_websocket(): void

  // reconnect system
  fails: number
  last_reconnect: number
  pending_retry: number | null
  cancel_retry(): void
  schedule_retry(time: number, force?: boolean): void
  online_and_visible(): boolean
  maybe_reconnect(ev?: Event): void
  last_life: number
  got_life(): void

  start_websocket(force?: boolean): void
  send(data: unknown): void
  next_id(): string
  pop_handler(id: string): LpHandlerEntry | undefined
  handle_response(response: any): void
  process_live(events: any[], listmapmap: ListMapMap): void
  blur_time: number
  init(): void
}

export const Lp: LpApi = {
  // map(contentId -> map(userId -> status))
  statuses: Object.assign(Object.create(null), { 0: {} }),
  online: Object.create(null),
  // todo: this is never cleared, so technically it leaks memory.
  // but unless there are thousands of users, it won't matter
  users: Object.create(null),

  online_change(): boolean {
    const online = Object.assign(Object.create(null), this.statuses[0])
    for (const pid in this.statuses) {
      if ((pid as any) != 0) {
        const map = this.statuses[pid]
        for (const uid in map) {
          if (map[uid] == 'active' && online[uid] == undefined) online[uid] = 'idle'
        }
      }
    }
    const old = this.online
    this.online = online

    for (const map of [old, online]) /// ugh
      for (const uid in map) if (online[uid] != old[uid]) return true
    return false
  },

  // called during `userlistupdate`
  handle_statuses(statuses, objects) {
    Object.assign(this.statuses, statuses)
    Object.assign(this.users, objects.user)

    const li = Events.userlist

    if (this.online_change()) li.fire_id(0)

    for (const pid in statuses) {
      if ((pid as any) != 0) li.fire_id(+pid)
    }
  },

  set_status(id, value) {
    this.my_statuses[id] = value
    this.my_status_queue[id] = value
  },
  flush_statuses(callback = null) {
    // this loop runs ONCE, only if the status_queue is not empty
    for (const key in this.my_status_queue) {
      void key
      this.request({ type: 'setuserstatus', data: this.my_status_queue }, () => {
        // messy..
        this.my_status_queue = Object.create(null)
        callback && callback()
      })
      break // important
    }
  },

  request(request, callback = console.info) {
    request.id = this.next_id()
    this.handlers.set(request.id, { request, callback })
    this.handler_count()
    if (this.ready) this.send(request)
    return { id: request.id }
  },
  chain(data, callback) {
    return this.request({ type: 'request', data }, callback)
  },
  ping(callback) {
    return this.request({ type: 'ping' }, callback)
  },
  userlist(callback) {
    return this.request({ type: 'userlist' }, callback)
  },

  cancel({ id }) {
    this.pop_handler(id)
  },

  handlers: new Map(),
  handler_id: 1,

  ready: false,
  last_id: '',
  no_restart: false,
  websocket: null,
  message_count: 0,

  // visual stuff
  state_change(state) {
    // todo: maybe combine this all with the header color instead of the button.
    document.documentElement.dataset.socketState = state
  },
  handler_count() {
    // todo: only count 'important' handlers, not, ex: user status
    const num = this.handlers.size
    if (num) document.documentElement.dataset.socketPending = String(num)
    else delete document.documentElement.dataset.socketPending
  },

  // statuses
  my_statuses: Object.create(null),
  my_status_queue: Object.create(null),

  stop() {
    if (this.websocket) this.websocket.close()
  },
  on_ready() {
    // all statuses need to be resent
    Object.assign(this.my_status_queue, this.my_statuses)
    this.flush_statuses()
    this.userlist((data) => {
      this.handle_statuses(data.statuses, data.objects)
    })
    // resend all previously pending requests
    // TODO: this will send duplicate requests, if any were recvd by the server right before the
    // socket closed. this MUST be fixed before any write requests are added
    for (const { request } of this.handlers.values()) this.send(request)
    this.ready = true
  },
  is_alive() {
    return this.websocket != null && this.websocket.readyState <= WebSocket.OPEN
  },
  kill_websocket() {
    if (this.websocket) {
      this.state_change('dead')
      this.ready = false
      // oof ow fuck
      this.websocket.onerror = null
      this.websocket.onopen = null
      this.websocket.onclose = null
      this.websocket.onmessage = null
      this.websocket.close()
      this.websocket = null
      this.message_count = 0
    }
  },

  // reconnect system
  fails: 0,
  last_reconnect: 0,
  pending_retry: null,
  cancel_retry() {
    if (this.pending_retry) {
      window.clearTimeout(this.pending_retry)
      this.pending_retry = null
    }
  },
  schedule_retry(time, force) {
    this.cancel_retry()
    this.pending_retry = window.setTimeout(() => {
      this.pending_retry = null
      this.start_websocket(force)
    }, time)
  },
  online_and_visible() {
    return 'visible' == document.visibilityState && navigator.onLine
  },
  // behold, the labyrinth
  maybe_reconnect(ev) {
    if (this.no_restart) return
    if (!this.online_and_visible()) return

    const last = this.last_reconnect
    this.last_reconnect = Date.now()
    const since = this.last_reconnect - last

    if (this.is_alive()) {
      if (since < 1000) return
      let time = 2000
      if (Date.now() - this.last_life > 30 * 1000 && ev && ev.type != 'focus') time = 1000
      this.schedule_retry(time, true)
      this.ping(() => {})
    } else {
      if (this.fails > 5) {
        print('too many ')
        return
      }
      if (since < 1000) {
        this.schedule_retry(1000)
      } else this.start_websocket()
    }
  },
  last_life: Date.now(),
  got_life() {
    this.last_life = Date.now()
    this.cancel_retry()
  },

  // main
  start_websocket(force) {
    this.cancel_retry()
    if (this.no_restart) return
    if (!force && this.is_alive()) throw new Error('Tried to open multiple websockets')
    this.kill_websocket()
    print('starting websocket...')
    this.last_reconnect = Date.now()
    this.fails++

    const ws_url = Req.server_url.replace(/^http/, 'ws')
    this.websocket = new WebSocket(
      `${ws_url}/api/live/ws?lastId=${this.last_id}&token=${encodeURIComponent(Req.auth as string)}`,
    )
    this.message_count = 0
    this.state_change('opening')

    this.websocket.onopen = () => {
      console.log('🌄 websocket open')
      this.got_life()
      this.state_change('open')
      this.on_ready()
    }

    this.websocket.onerror = ({ target }) => {
      console.warn('websocket error')
      this.fails++
      ;(target as any)._got_error = true //hack
    }

    this.websocket.onclose = ({ code, reason, wasClean, target }) => {
      console.log('ws closed', code, reason, wasClean)
      let desc
      if ((target as any)._got_error) desc = 'websocket closed:'
      else if (wasClean) desc = 'websocket closed (clean).'
      else desc = 'websocket closed.'
      print(desc + ' ' + code + ' ' + reason)

      this.ready = false
      this.state_change('dead')
      // use timeout to avoid recursion and leaking stack traces
      window.setTimeout(() => this.maybe_reconnect())
    }

    this.websocket.onmessage = ({ data, target }) => {
      if (target !== this.websocket) {
        alert('websocket wrong event target? multiple sockets still open?')
        return
      }
      this.got_life()
      this.fails = 0
      this.handle_response(JSON.parse(data))
      this.message_count++
    }
  },
  /*************************
   ** Requests (internal) **
   *************************/
  send(data) {
    this.websocket!.send(JSON.stringify(data))
  },
  next_id() {
    return '🧦' + this.handler_id++
  },
  /***********************
   ** Response Handling **
   ***********************/
  pop_handler(id) {
    const handler = this.handlers.get(id)
    if (this.handlers.delete(id)) {
      this.handler_count()
      return handler
    }
    return undefined
  },
  handle_response(response) {
    if (response.type == 'unexpected' && /ExpiredCheckpoint/.test(response.error)) {
      print('server restart? lastid reset!')
      this.last_id = 0
      return
    }
    if (response.type == 'badtoken') {
      this.no_restart = true
      alert('token expired (must log in again)')
      Req.log_out()
      return
    }

    let handler
    if (response.id) {
      handler = this.pop_handler(response.id)
      if (!handler) console.warn('got response without handler:', response)
    }
    if (response.error) {
      const err = new SocketRequestError(response, handler ? handler.request : null)
      if (handler && handler.request.type == response.type) handler.callback(SELF_DESTRUCT(err), err)
      throw err
    }
    const data = response.data
    switch (response.type) {
      case 'request':
        {
          Entity.do_listmap(data.objects)
          handler && handler.callback(data.objects)
        }
        break
      case 'setuserstatus':
        {
          handler && handler.callback(response)
        }
        break
      case 'userlist':
        {
          Entity.do_listmap(data.objects)
          handler && handler.callback(data)
        }
        break
      case 'ping':
        {
          handler && handler.callback(response)
        }
        break
      case 'lastId':
        {
          this.last_id = data
        }
        break
      case 'live':
        {
          this.last_id = data.lastId
          // activity parent object field
          const a = data.objects.activity_event
          if (a && a.parent) a.parent.Type = 'content'
          Entity.do_listmapmap(data.objects)
          this.process_live(data.events, data.objects)
        }
        break
      case 'userlistupdate':
        {
          Entity.do_listmap(data.objects)
          this.handle_statuses(data.statuses, data.objects)
        }
        break
      case 'badtoken':
        {
          //
        }
        break
      default:
        {
          console.warn('unknown response type: ', response)
        }
        break
    }
  },
  process_live(events, listmapmap) {
    const comments = []
    Entity.ascending(events)
    let prev_id = -Infinity
    for (const event of events) {
      if (event.id < prev_id) {
        alert('event ids out of order! please report this')
        print(JSON.stringify(events))
        console.warn(events)
      }
      prev_id = event.id
      // wait shouldnt listmapmap be called maplistmap?
      const maplist = listmapmap[event.type]
      const ref_id = event.refId

      switch (event.type) {
        case 'message_event':
          {
            const message = maplist.message[~ref_id]
            if (message) comments.push(message)
          }
          break
        case 'activity_event':
          {
            const act = maplist.activity[~ref_id]
            Act.normal.activity(act, maplist)
            // todo: when we add support for this: remember we need to interleave this data with
            // message events to pass it to activity in ORDER
          }
          break
        case 'watch_event':
          {
            const watch = maplist.watch[~ref_id]
            console.log('watch event', watch, event)
          }
          break
        case 'user_event':
          {
            const user = maplist.user[~ref_id]
            if (user) {
              if (ref_id == Req.uid) Req.me = user
              statusUpdateUser?.(user)
              Events.user_edit.fire(user)
            }
          }
          break
        default:
          {
            console.warn('unknown event type:', event.type, event, maplist)
          }
          break
      }
    }
    // group messages to process more efficiently
    //  note: do we ever even get more than one at a time?
    //  well, after a disconnect, i guess
    if (comments.length) {
      Events.messages.fire(comments, listmapmap.message_event)
      Events.after_messages.fire()
    }
  },
  blur_time: 0,
  init() {
    document.addEventListener('visibilitychange', (e) => this.maybe_reconnect(e))
    window.addEventListener('pageshow', (e) => this.maybe_reconnect(e))
    window.addEventListener('online', () => this.start_websocket(true))
    if (IOS_SAFARI) {
      window.addEventListener('blur', () => {
        this.blur_time = Date.now()
      })
      window.addEventListener('focus', (e) => {
        if (Math.abs(this.blur_time - Date.now()) < 1000) return
        this.maybe_reconnect(e)
      })
    }
  },
}
Object.seal(Lp)

// safe server restart sequence:
// 1: we are connected to the server (proof: the current websocket has recieved more than 1 message)
// 2: this websocket fires a `close` event WITHOUT an `error` event - meaning: the socket was
//    explicitly closed (by either end) and didn't just fail due to a connection error
// 3: (potentially some failed auto-reconnect attempts, because server hasn't started yet)
// 4: our first successful reconnect dies immediately with a checkpoint error (lastid is old)
// 5: on the NEXT reconnect: set lastid to 0
