// React host for a StatusDisplay controller (ARCHITECTURE §9 "UserList / StatusDisplay", §10 L6f).
//
// The imperative reconcile-by-uid renderer lives in `services/status-display.ts` (L4d); this
// component is the thin React host that owns the container element, instantiates a StatusDisplay
// bound to a room id, and drives it via effects — the same "imperative controller wrapped in a
// ref'd container" strategy the architecture prescribes for MessageList. React renders an EMPTY
// <div> and never touches its children; StatusDisplay owns everything inside, keeping the
// sorted-ascending-by-uid `<a data-uid/data-avatar/data-status/data-initial>` avatars intact.
//
// Two call sites in the old code (both become <UserList>):
//   - Sidebar global online list: `new StatusDisplay(0, $sidebarUserList)`, redraw on
//     `Events.userlist.listen_id(_, 0)` and `Events.user_edit` (sidebar.js:7,110-111,305-311).
//   - PageView per-page list: `new StatusDisplay(page_id, $userlist)`, `set_status("viewing")`
//     then redraw, redraw on `Events.userlist.listen_id(_, page_id)` and `Events.user_edit`,
//     release status on Destroy (page.js:150,159-160,175-179,273-279).
import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { StatusDisplay } from '../services/status-display'
import { Events } from '../services/events'
import { Lp } from '../services/socket'
import { subscribe as subscribeBlocks } from '../services/block'
import type { User } from '../data/types'

// Ref-count of mounted UserLists that announce a presence status, keyed by room id. This replaces
// the original PageView.Destroy guard (page.js:273-279):
//   goto2: for (let {view} of Nav.slots)
//     if (view!==this && view instanceof PageView && view.page_id==this.page_id) break goto2
//   this.userlist.set_status(null)
// i.e. release "viewing" only when NO OTHER PageView slot shows the same page. Each PageView slot
// renders exactly one announcing UserList, so counting mounted announcing UserLists per id is
// equivalent to counting PageView slots per page_id: we fire `set_status(null)` only when the
// LAST announcing UserList for that id unmounts, keeping status while any sibling slot stays open.
const announce_counts: Record<number, number> = Object.create(null)

export interface UserListProps {
  // Room id whose statuses to show. 0 = global online list (Lp.online); else a page/content id.
  id: number
  // Presence status to announce for this room while mounted. PageView passes "viewing"; the global
  // sidebar list passes nothing. When set, `set_status(status)` fires on mount and, when the last
  // announcing UserList for this id unmounts, `set_status(null)` releases it.
  status?: string
  className?: string
  style?: CSSProperties
}

export function UserList({ id, status, className = 'userlist', style }: UserListProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const display = new StatusDisplay(id, ref.current)
    // Private per-instance key for the event bus: `Events.destroy(view)` bulk-removes every
    // listener registered under a key, so a unique object isolates this UserList's listeners.
    const view = {}

    // page.js:159-160 order: announce presence, then paint.
    if (status !== undefined) {
      announce_counts[id] = (announce_counts[id] || 0) + 1
      display.set_status(status)
    }
    display.redraw()

    // sidebar.js:305-307 / page.js:175-177 — re-diff on any userlist change for this room.
    Events.userlist.listen_id(view, id, () => {
      display.redraw()
    })
    // sidebar.js:308-312 / page.js:178-180 — re-render an avatar when its user is edited. (The
    // sidebar also redraws its OWN avatar; that belongs to the sidebar chrome, not here.)
    Events.user_edit.listen(view, (user: User) => {
      display.redraw_user(user)
    })

    // The status was just queued by set_status; flush it now so the server sees the change
    // immediately rather than only when the next view triggers a flush on unmount.
    Lp.flush_statuses()

    // Redraw avatars when the block list changes so the sepia overlay updates.
    const unsubscribeBlocks = subscribeBlocks(() => {
      display.redraw()
    })

    return () => {
      unsubscribeBlocks()
      Events.destroy(view)
      if (status !== undefined) {
        announce_counts[id] = (announce_counts[id] || 1) - 1
        if (announce_counts[id] <= 0) {
          delete announce_counts[id]
          // Original passes `null` to release; set_status's type is `string`, so cast — erases to
          // the exact original runtime expression `this.userlist.set_status(null)`.
          display.set_status(null as unknown as string)
        }
      }
      // Flush the released status immediately rather than waiting for the next view transition.
      Lp.flush_statuses()
    }
  }, [id, status])

  return <div ref={ref} className={className} style={style} />
}
