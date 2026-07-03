// L5a — central route handler.
// Registers every view route with the view-registry. View modules are lazy-loaded (register_lazy)
// so each view ships in its own chunk — the boot bundle no longer pulls in every view. Redirects
// stay eager (they are pure functions registered at boot). The chatlogs redirect uses
// nl_from_query (moved to core/util so it doesn't drag CommentsView into the boot bundle).
//
// Dynamic imports (ts-no-dynamic-import exception): each view is a literal module known at
// author time, but static imports would bundle all views into the boot chunk — defeating the
// code-splitting goal. The dynamic import specifier is the literal view path; the loader runs
// once per type and the resolved module is cached by view-registry.resolve_view.
import type { NavLocation } from '../data/types'
import { register, register_lazy } from './view-registry'
import { nl_from_query } from '../core/util'

export function registerRoutes(): void {
  // page routes
  register_lazy('page', () => import('../views/PageView').then((m) => m.PageViewModule))
  register('pages', {
    Redirect(location: NavLocation): void {
      location.type = 'page'
    },
  })

  // comments routes
  register_lazy('comments', () => import('../views/CommentsView').then((m) => m.CommentsView))
  register('chatlogs', {
    Redirect(location: NavLocation): void {
      const q: Record<string, string> = { r: 'true' }
      // we do it this way so the ORDER is preserved :D
      for (const [rawKey, value] of Object.entries(location.query)) {
        let key = rawKey
        if (key == 't') key = 's'
        if (key == 's' || key == 'pid' || key == 'uid') q[key] = value
      }
      location.query = q
      location.id = null
      if (q.pid) {
        const pids = nl_from_query(q.pid)
        if (pids && pids.length == 1) {
          delete q.pid
          location.id = pids[0]!
        }
      }
      location.type = 'comments'
    },
  })

  // edit route
  register_lazy('editpage', () => import('../views/EditView').then((m) => m.EditViewModule))

  // images route
  register_lazy('images', () => import('../views/ImagesView').then((m) => m.ImagesView))

  // category routes
  register_lazy('category', () => import('../views/CategoryView').then((m) => m.CategoryViewModule))
  register('categories', {
    Redirect(location: NavLocation): void {
      location.type = 'category'
    },
  })

  // user route
  register_lazy('user', () => import('../views/UserView').then((m) => m.UserView))

  // account route
  register_lazy('account', () => import('../views/AccountView').then((m) => m.AccountView))
}
