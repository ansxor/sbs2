// L5a — central route handler.
// Explicitly imports every view module and registers its route(s) with the view-registry.
// This replaces the old self-registering side-effect imports in the deleted boot/bootstrap.ts.
import type { NavLocation } from '../data/types'
import { register } from './view-registry'

import { PageViewModule } from '../views/PageView'
import { CommentsView, nl_from_query } from '../views/CommentsView'
import { EditViewModule } from '../views/EditView'
import { ImagesView } from '../views/ImagesView'
import { CategoryViewModule } from '../views/CategoryView'
import { UserView } from '../views/UserView'
import { AccountView } from '../views/AccountView'

export function registerRoutes(): void {
  // page routes
  register('page', PageViewModule)
  register('pages', {
    Redirect(location: NavLocation): void {
      location.type = 'page'
    },
  })

  // comments routes
  register('comments', CommentsView)
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
  register('editpage', EditViewModule)

  // images route
  register('images', ImagesView)

  // category routes
  register('category', CategoryViewModule)
  register('categories', {
    Redirect(location: NavLocation): void {
      location.type = 'category'
    },
  })

  // user route
  register('user', UserView)

  // account route
  register('account', AccountView)
}
