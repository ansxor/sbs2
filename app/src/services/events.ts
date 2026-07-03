// Event bus — near-verbatim port of src/event.js (ARCHITECTURE §5, §10 L2a; core-state.md §event.js).
//
// A tiny synchronous pub/sub bus. Views subscribe with themselves as the key (`view`); when a
// view is torn down, `Events.destroy(view)` bulk-removes every listener registered under that
// view across all categories. Dispatch is synchronous and in registration order. A handler that
// throws is caught (console.error + print) and does NOT stop the remaining handlers. Handlers are
// invoked with `this = view` so method references (e.g. Act.handle_messages) bind correctly.
//
// The dead categories `content_edit` and `setting` are kept for parity (never listened/fired).

import { objectFor } from '../core/util'

export type BusCategory =
  | 'messages'
  | 'after_messages'
  | 'content_edit'
  | 'user_edit'
  | 'userlist'
  | 'setting'

// The "view" is any object identity used to bulk-remove a listener set on nav teardown.
export type BusView = object
export type BusListener = (...data: any[]) => void

interface Listener {
  view: BusView
  callback: BusListener
}

export class Listeners {
  listeners: Listener[]

  constructor() {
    this.listeners = []
  }

  listen(view: BusView, callback: BusListener): void {
    return this.listen2(this.listeners, view, callback)
  }

  fire(...data: any[]): void {
    return this.fire2(this.listeners, ...data)
  }

  protected listen2(list: Listener[], view: BusView, callback: BusListener): void {
    list.push({ view, callback })
  }

  protected fire2(list: Listener[] | undefined, ...data: any[]): void {
    if (list)
      for (const l of list)
        try {
          l.callback.call(l.view, ...data)
        } catch (e) {
          console.error('event handler error', e)
          print(e)
        }
  }

  on_destroy(view: BusView): void {
    return this.destroy2(this.listeners, view)
  }

  protected destroy2(list: Listener[], view: BusView): void {
    for (let i = 0; i < list.length; i++) {
      if (list[i].view == view) {
        list.splice(i, 1)
        i--
      }
    }
  }
}

export class IdListeners extends Listeners {
  ids: { [id: string]: Listener[] }

  constructor() {
    super()
    this.ids = Object.create(null)
  }

  listen_id(view: BusView, id: number, callback: BusListener): void {
    const ll = this.ids[id] || (this.ids[id] = [])
    return super.listen2(ll, view, callback)
  }

  fire_id(id: number, ...data: any[]): void {
    return super.fire2(this.ids[id], ...data)
  }

  override on_destroy(view: BusView): void {
    for (const id in this.ids) {
      super.destroy2(this.ids[id], view)
    }
    super.on_destroy(view)
  }
}

export interface EventsBus {
  messages: IdListeners
  after_messages: IdListeners
  content_edit: IdListeners // kept for parity though never fired
  user_edit: Listeners
  userlist: IdListeners
  setting: IdListeners // kept for parity though never fired
  // bulk-remove every listener registered under `view` across all categories.
  destroy(view: BusView): void
}

// `destroy` lives on the PROTOTYPE (not as an own property), exactly as event.js hand-built the
// prototype chain: `Object.for(this, lm => lm.on_destroy(view))` iterates only the own-enumerable
// category values, so `destroy` itself must not be own-enumerable or it would be iterated and
// throw. `objectFor` is the ported `Object.for` (fill.js) used verbatim.
const EventsProto = {
  destroy(this: EventsBus, view: BusView): void {
    objectFor(this as unknown as Record<string, unknown>, (lm) => {
      ;(lm as Listeners).on_destroy(view)
    })
  },
}

export const Events: EventsBus = Object.assign(Object.create(EventsProto) as EventsBus, {
  // map of {eventname,pid} -> array of {view, callback}
  messages: new IdListeners(),
  after_messages: new IdListeners(),
  content_edit: new IdListeners(),
  user_edit: new Listeners(),
  userlist: new IdListeners(),
  setting: new IdListeners(),
})
