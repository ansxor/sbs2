// L7f — UserView (ports Views/user.js; ARCHITECTURE §6 module map line 709). Route `#user/:id`
// where a numeric id queries by `id`, a string by `username`, and a missing id renders the
// "quick" placeholder. The view is a big avatar (`Draw.avatar_url(user, 300)`) plus the user's
// rendered userpage markup, mounted through the MarkupContent island (`convert_lang`).
//
// Structure mirrors the original template verbatim:
//   <view-root class='userPageBox'>
//     <a class='userPageAvatar'><img width=300 height=300></a>   (the `<a>` has no href)
//     <div class='pageContents Markup'></div>                    (MarkupContent host)
//   </view-root>
//
// Header side effects (set_title / add_header_links) were run inside the old synchronous Render;
// here they run in a useLayoutEffect on the SlotHeaderApi prop. The old add_header_links took a
// {href,label,icon,target} descriptor and built the <a>; the frozen SlotHeaderApi now takes a
// prebuilt Node, so that construction (navigate.js:66) moves into this view. The effect removes
// its appended anchor on cleanup so a StrictMode double-invoke leaves exactly one link.
import { useLayoutEffect } from 'react'
import type {
  Content,
  NavLocation,
  StartResult,
  User,
  ViewComponentProps,
} from '../data/types'
import { avatar_url } from '../services/draw'
import { MarkupContent } from '../islands/MarkupContent'
import { type RouteModule } from '../routing/view-registry'

// navigate.js:66 add_header_links — build the <a> the old descriptor produced. Kept
// byte-identical: `<a href target><span>label</span></a>`, with a prepended
// `<span class='text-shadow'>icon</span>` when an icon is present, and target defaulting
// to '_self'.
interface HeaderLinkSpec {
  href: string
  label: string
  icon?: string
  target?: string
}
function build_header_link(x: HeaderLinkSpec): HTMLAnchorElement {
  const a = document.createElement('a')
  a.href = x.href
  a.target = x.target || '_self'
  let lb = document.createElement('span')
  lb.textContent = x.label
  a.append(lb)
  if (x.icon) {
    lb = document.createElement('span')
    lb.className = 'text-shadow'
    lb.append(x.icon)
    a.prepend(lb)
  }
  return a
}

// view.js:182 View.set_title — the "quick" path (UserView.Quick → View.set_title("todo"))
// set only document.title (with the every-other-space→NBSP guard), never the slot title node.
// Reproduced inline so the quick case matches the old global set_title rather than the slot's
// header.set_title (which would also fill the title node). change_favicon(null) is a no-op here.
function set_document_title(title: string): void {
  document.title = title.replace(/  /g, '  ').replace(/\n/g, '  \n')
}

// user.js:4 Start — id typeof selects the query; a null id (neither number nor string) is the
// quick placeholder. Chain values / requests copied verbatim.
function Start(loc: NavLocation): StartResult {
  const id = loc.id
  let user_query: string
  if (typeof id === 'number') {
    user_query = 'id = @uid'
  } else if (typeof id === 'string') {
    user_query = 'username = @uid'
  } else {
    return { quick: true }
  }
  return {
    chain: {
      values: {
        uid: id,
        Userpage: 'userpage',
        Page: 1,
      },
      requests: [
        { type: 'user', fields: '*', query: user_query, limit: 1 },
        { name: 'Puserpage', type: 'content', fields: '*', query: '!userpage(@user.id)' },
      ],
    },
    check(resp) {
      return resp.user[0]
    },
  }
}

function UserViewComponent({ data, header }: ViewComponentProps) {
  // user.js:36 Render — resp.user[0] / resp.Puserpage[0]. In the quick path data is {} so both
  // are undefined and Quick()'s behavior (title only, empty template) is used.
  const user = data.user?.[0] as User | undefined
  const userpage = data.Puserpage?.[0] as Content | undefined

  useLayoutEffect(() => {
    if (!user) {
      // Quick(): View.set_title("todo")
      set_document_title('todo')
      return
    }
    header.set_title(user.username)
    if (!userpage) return
    // user.js:45 — the "page" header link pointing at the userpage content.
    const link = build_header_link({ icon: '📄️', label: 'page', href: '#page/' + userpage.id })
    header.add_header_links(link)
    return () => {
      link.remove()
    }
  }, [user, userpage, header])

  return (
    <view-root class="userPageBox">
      <a className="userPageAvatar">
        {/* user.js:43 — $avatar.src set only when a user is present (Render vs Quick). */}
        <img width={300} height={300} src={user ? avatar_url(user, 300) : undefined} />
      </a>
      {user && userpage ? (
        // user.js:48 — Markup.convert_lang(userpage.text, userpage.values.markupLang, $contents).
        // markupLang undefined/null → '' resolves to the default lang (langs.get), identical.
        <MarkupContent
          tag="div"
          className="pageContents Markup"
          text={userpage.text}
          lang={userpage.values.markupLang ?? ''}
        />
      ) : (
        <div className="pageContents Markup" />
      )}
    </view-root>
  )
}

// view.js:157/user.js:65 — register the view under 'user'. Exported as the RouteModule contract
// (module map line 709) and registered centrally by routing/routes.ts.
export const UserView: RouteModule = {
  Start,
  Component: UserViewComponent,
}

export default UserView
