// StatusDisplay reconcile-by-uid controller, ported verbatim from draw.js:300-411 (ARCHITECTURE
// §L4d). Renders the per-room online-user avatar strip. Statuses are iterated via
// Object.entries(statuses) which yields integer-like keys in ascending numeric-uid order, so the
// reconcile loop (remove / update-in-place / insert-before / append) keeps children sorted
// ascending by uid, keyed by `data-uid`, carrying `data-status`/`data-avatar`/`data-initial`.
// The loose number-vs-string comparisons from the original are preserved via type assertions that
// erase to the exact same runtime expressions.
import type { User } from '../data/types'
import { Lp, setStatusUpdateUser } from './socket'
import { avatar_url } from './draw'
import { Nav } from './nav'
import { isUserBlocked, promptBlockUser } from './block'

// todo: we should probably disconnect uhh
// - other user's status's display
// - reporting our own status
export class StatusDisplay {
  id: number
  $elem: HTMLElement | null
  my_status: string | undefined
  initial: boolean

  constructor(id: number, element: HTMLElement | null) {
    this.id = id
    this.$elem = element
    this.my_status = undefined
    this.initial = true
    Object.seal(this)
  }

  redraw(): void {
    if (!this.$elem) return
    const elem = this.$elem
    const st = this.statuses()
    const ste = Object.entries(st)
    let j = 0
    const chs = [...elem.childNodes] as HTMLElement[]
    //log = "redrawing "+this.id
    for (let i = 0; i < chs.length; i++) {
      const stx = ste[j]
      const ch = chs[i]
      const ex_uid = +(ch.dataset.uid as string)
      const uid = +stx[0]
      if (j >= ste.length || !(ex_uid >= uid)) {
        ch.remove()
        //log = "remove "+ex_uid
      } else {
        if (ex_uid == uid) {
          // now try to update the icon if changed: todo: improve
          const user = StatusDisplay.get_user(uid)
          if (!user) {
            ch.remove()
          } else if (ch.dataset.avatar != user.avatar) {
            const node = this.draw_avatar(...stx)
            if (node) ch.replaceWith(node)
            else ch.remove()
          } else {
            ch.dataset.status = stx[1]
            // Avatar is unchanged so the element is reused in place — but the block list may have
            // changed (block/unblock never alters the avatar), so re-sync the sepia marker here.
            ch.classList.toggle('blocked', isUserBlocked(uid))
          }
        } else {
          // ex_uid > stx[0]
          //log = stx[0]+" insert before "+ex_uid
          const node = this.draw_avatar(...stx)
          if (node) {
            ch.before(node)
            i--
          }
        }
        j++
      }
    }
    for (; j < ste.length; j++) {
      //log = ste[j][0]+" append"
      const node = this.draw_avatar(...ste[j])
      if (node) elem.append(node)
    }
    this.initial = false
  }

  draw_avatar(uid: string, status: string): HTMLAnchorElement | null {
    //log = "draw avatar "+uid+" in "+this.id
    const user = StatusDisplay.get_user(uid)
    if (!user) return null
    let e = StatusDisplay.draw_avatar(user, status)
    if (this.initial) e.dataset.initial = ''
    return e
  }

  // set your own status
  set_status(s: string): void {
    // todo: maybe there's a better place to filter this
    if (s == this.my_status) return
    this.my_status = s
    Lp.set_status(this.id, s)
  }

  // when a user's avatar etc. changes
  redraw_user(user: User): void {
    if (this.statuses()[user.id]) {
      //log = 'redraw user?'
      this.redraw()
    }
  }

  // get statuses for this room
  statuses(): Record<string, string> {
    if (this.id == 0) return Lp.online
    return Lp.statuses[this.id] || Object.create(null)
  }

  // lookup a user from the cache
  static get_user(id: string | number): User | undefined {
    const num = typeof id === 'string' ? +id : id
    return Lp.users[~num]
  }

  // called during `user_event` (i.e. when a user is edited)
  static update_user(user: User): void {
    if (Lp.users[~user.id]) Lp.users[~user.id] = user
  }

  // download userlist for this page if we're not already tracking it
  static prepare(pid: number): void {
    if (Lp.statuses[pid]) return
    Lp.userlist((resp) => {
      if (Lp.statuses[pid]) return
      Lp.handle_statuses(resp.statuses, resp.objects)
    })
  }

  // draw.js:399-411 — was `StatusDisplay.draw_avatar = function(...){...}.bind(𐀶`<a
  // tabindex=-1><img class='avatar' width=50 height=50>`)`. The 𐀶 clone is inlined as
  // createElement with identical tags/attributes; `this()` (the clone) -> the built <a>.
  static draw_avatar(user: User, status: string): HTMLAnchorElement {
    const e = document.createElement('a')
    e.setAttribute('tabindex', '-1')
    const img = document.createElement('img')
    img.className = 'avatar'
    img.setAttribute('width', '50')
    img.setAttribute('height', '50')
    e.appendChild(img)
    e.href = Nav.entity_link(user)
    ;(e.firstChild as HTMLImageElement).src = avatar_url(user)
    ;(e.firstChild as HTMLImageElement).title = user.username
    ;(e.firstChild as HTMLImageElement).setAttribute('alt', user.username)
    e.dataset.uid = String(user.id)
    e.dataset.avatar = user.avatar
    e.dataset.status = status
    e.onclick = (ev) => promptBlockUser(ev, { id: user.id, username: user.username, avatar: user.avatar })
    if (isUserBlocked(user.id)) e.classList.add('blocked')
    /*if (status == "idle")
			e.classList.add('status-idle')*/
    return e
  }
}

// draw.js loaded StatusDisplay eagerly, so its static `update_user` was always live during
// socket `user_event`. socket.ts (L3b) inverted that direct call into a `setStatusUpdateUser`
// sink; wire it here at module load so importing this service re-establishes the always-on
// behavior. `update_user` reads Lp directly (no `this`), so passing the unbound static is safe.
setStatusUpdateUser(StatusDisplay.update_user)
