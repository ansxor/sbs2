import { Lp, setStatusUpdateUser } from './socket';
import { avatar_url } from './draw';
import { Nav } from './nav';
// todo: we should probably disconnect uhh
// - other user's status's display
// - reporting our own status
export class StatusDisplay {
    constructor(id, element) {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "$elem", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "my_status", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "initial", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.id = id;
        this.$elem = element;
        this.my_status = undefined;
        this.initial = true;
        Object.seal(this);
    }
    redraw() {
        if (!this.$elem)
            return;
        const elem = this.$elem;
        const st = this.statuses();
        const ste = Object.entries(st);
        let j = 0;
        const chs = [...elem.childNodes];
        //log = "redrawing "+this.id
        for (let i = 0; i < chs.length; i++) {
            const stx = ste[j];
            const ch = chs[i];
            const ex_uid = +ch.dataset.uid;
            if (j >= ste.length || !(ex_uid >= stx[0])) {
                ch.remove();
                //log = "remove "+ex_uid
            }
            else {
                if (ex_uid == stx[0]) {
                    // now try to update the icon if changed: todo: improve
                    const user = StatusDisplay.get_user(stx[0]);
                    if (ch.dataset.avatar != user.avatar)
                        ch.replaceWith(this.draw_avatar(...stx));
                    else
                        ch.dataset.status = stx[1];
                }
                else {
                    // ex_uid > stx[0]
                    //log = stx[0]+" insert before "+ex_uid
                    ch.before(this.draw_avatar(...stx));
                    i--;
                }
                j++;
            }
        }
        for (; j < ste.length; j++) {
            //log = ste[j][0]+" append"
            elem.append(this.draw_avatar(...ste[j]));
        }
        this.initial = false;
    }
    draw_avatar(uid, status) {
        //log = "draw avatar "+uid+" in "+this.id
        const user = StatusDisplay.get_user(uid);
        const e = StatusDisplay.draw_avatar(user, status);
        if (this.initial)
            e.dataset.initial = '';
        return e;
    }
    // set your own status
    set_status(s) {
        // todo: maybe there's a better place to filter this
        if (s == this.my_status)
            return;
        this.my_status = s;
        Lp.set_status(this.id, s);
    }
    // when a user's avatar etc. changes
    redraw_user(user) {
        // NOTE (parity): `this.statuses` is the METHOD, not the map — indexing it by uid is always
        // undefined, so this guard is permanently false. Kept exactly as the original bug.
        if (this.statuses[user.id]) {
            //log = 'redraw user?'
            this.redraw();
        }
    }
    // get statuses for this room
    statuses() {
        if (this.id == 0)
            return Lp.online;
        return Lp.statuses[this.id] || Object.create(null);
    }
    // lookup a user from the cache
    static get_user(id) {
        const user = Lp.users[~id];
        if (!user)
            throw new TypeError('can\'t find status user ' + id);
        return user;
    }
    // called during `user_event` (i.e. when a user is edited)
    static update_user(user) {
        if (Lp.users[~user.id])
            Lp.users[~user.id] = user;
    }
    // download userlist for this page if we're not already tracking it
    static prepare(pid) {
        if (Lp.statuses[pid])
            return;
        Lp.userlist((resp) => {
            if (Lp.statuses[pid])
                return;
            Lp.handle_statuses(resp.statuses, resp.objects);
        });
    }
    // draw.js:399-411 — was `StatusDisplay.draw_avatar = function(...){...}.bind(𐀶`<a
    // tabindex=-1><img class='avatar' width=50 height=50>`)`. The 𐀶 clone is inlined as
    // createElement with identical tags/attributes; `this()` (the clone) -> the built <a>.
    static draw_avatar(user, status) {
        const e = document.createElement('a');
        e.setAttribute('tabindex', '-1');
        const img = document.createElement('img');
        img.className = 'avatar';
        img.setAttribute('width', '50');
        img.setAttribute('height', '50');
        e.appendChild(img);
        e.href = Nav.entity_link(user);
        e.firstChild.src = avatar_url(user);
        e.firstChild.title = user.username;
        e.firstChild.setAttribute('alt', user.username);
        e.dataset.uid = String(user.id);
        e.dataset.avatar = user.avatar;
        e.dataset.status = status;
        /*if (status == "idle")
                e.classList.add('status-idle')*/
        return e;
    }
}
// draw.js loaded StatusDisplay eagerly, so its static `update_user` was always live during
// socket `user_event`. socket.ts (L3b) inverted that direct call into a `setStatusUpdateUser`
// sink; wire it here at module load so importing this service re-establishes the always-on
// behavior. `update_user` reads Lp directly (no `this`), so passing the unbound static is safe.
setStatusUpdateUser(StatusDisplay.update_user);
