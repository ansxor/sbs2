// Event bus — near-verbatim port of src/event.js (ARCHITECTURE §5, §10 L2a; core-state.md §event.js).
//
// A tiny synchronous pub/sub bus. Views subscribe with themselves as the key (`view`); when a
// view is torn down, `Events.destroy(view)` bulk-removes every listener registered under that
// view across all categories. Dispatch is synchronous and in registration order. A handler that
// throws is caught (console.error + print) and does NOT stop the remaining handlers. Handlers are
// invoked with `this = view` so method references (e.g. Act.handle_messages) bind correctly.
//
// The dead categories `content_edit` and `setting` are kept for parity (never listened/fired).
import { objectFor } from '../core/util';
export class Listeners {
    constructor() {
        Object.defineProperty(this, "listeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.listeners = [];
    }
    listen(view, callback) {
        return this.listen2(this.listeners, view, callback);
    }
    fire(...data) {
        return this.fire2(this.listeners, ...data);
    }
    listen2(list, view, callback) {
        list.push({ view, callback });
    }
    fire2(list, ...data) {
        if (list)
            for (const l of list)
                try {
                    l.callback.call(l.view, ...data);
                }
                catch (e) {
                    console.error('event handler error', e);
                    print(e);
                }
    }
    on_destroy(view) {
        return this.destroy2(this.listeners, view);
    }
    destroy2(list, view) {
        for (let i = 0; i < list.length; i++) {
            if (list[i].view == view) {
                list.splice(i, 1);
                i--;
            }
        }
    }
}
export class IdListeners extends Listeners {
    constructor() {
        super();
        Object.defineProperty(this, "ids", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.ids = Object.create(null);
    }
    listen_id(view, id, callback) {
        const ll = this.ids[id] || (this.ids[id] = []);
        return super.listen2(ll, view, callback);
    }
    fire_id(id, ...data) {
        return super.fire2(this.ids[id], ...data);
    }
    on_destroy(view) {
        for (const id in this.ids) {
            super.destroy2(this.ids[id], view);
        }
        super.on_destroy(view);
    }
}
// `destroy` lives on the PROTOTYPE (not as an own property), exactly as event.js hand-built the
// prototype chain: `Object.for(this, lm => lm.on_destroy(view))` iterates only the own-enumerable
// category values, so `destroy` itself must not be own-enumerable or it would be iterated and
// throw. `objectFor` is the ported `Object.for` (fill.js) used verbatim.
const EventsProto = {
    destroy(view) {
        objectFor(this, (lm) => {
            ;
            lm.on_destroy(view);
        });
    },
};
export const Events = Object.assign(Object.create(EventsProto), {
    // map of {eventname,pid} -> array of {view, callback}
    messages: new IdListeners(),
    after_messages: new IdListeners(),
    content_edit: new IdListeners(),
    user_edit: new Listeners(),
    userlist: new IdListeners(),
    setting: new IdListeners(),
});
