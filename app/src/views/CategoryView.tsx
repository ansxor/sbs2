// L7e — CategoryView (ports src/Views/category.js verbatim; ARCHITECTURE §6/§10).
//
// Route `#category/:id`: `id` is numeric (looked up by `id`) or, when non-numeric, a hash
// (looked up by `hash`). `#categories` redirects to `category`. The view renders the category's
// markup description, author + create-date, its parent category, its child categories, and a
// paginated list of child content (30 per page). The `Ccategories`/`Cchildren`/`Cparent`/`count`
// chain macros and every query string are kept byte-identical — they are server templates.
//
// The original was a BaseView with imperative Init/Render/update_page over a $-templated DOM.
// Here Start() returns the same chain descriptor and the React Component renders the same tags
// and classes. The two imperative side effects the old Render performed on the slot header
// (add_header_links + set_entity_title) run in a layout effect against the SlotHeaderApi, with a
// cleanup that removes the appended links so StrictMode's double-invoke cannot duplicate them.
import { useLayoutEffect } from 'react'
import type {
  Content,
  EntityList,
  NavLocation,
  StartResult,
  User,
  ViewComponentProps,
} from '../data/types'
import { Entity } from '../data/entity'
import { Nav } from '../services/nav'
import { register } from '../routing/view-registry'
import type { RouteModule } from '../routing/view-registry'
import { CategoryItem } from '../components/CategoryItem'
import { ContentIcon } from '../components/EntityLabel'
import { UserLabel } from '../components/UserLabel'
import { TimeAgo } from '../components/TimeAgo'
import { MarkupContent } from '../islands/MarkupContent'

// CategoryView.psize (category.js:106) — page size for the child-content list.
const PSIZE = 30

// The `etc` object category.js:68 forwards to convert_lang: `{intersection_observer: View.observer}`.
// View.observer is always null (ARCHITECTURE §8.2), so this is a stable `{intersection_observer:null}`.
// Kept as a module constant so MarkupContent's by-reference `etc` dep never churns across renders.
const MARKUP_ETC = { intersection_observer: null }

// navigate.js:66 add_header_links built each anchor from a {href,label,icon,target} descriptor.
// The port's SlotHeaderApi.add_header_links takes prebuilt Nodes, so that construction moves here,
// reproduced exactly (span label, optional prepended `text-shadow` icon span, target default _self).
interface HeaderLinkSpec {
  href: string
  label: string
  icon?: string
  target?: string
}
function build_header_link({ href, label, icon, target }: HeaderLinkSpec): HTMLAnchorElement {
  const a = document.createElement('a')
  a.href = href
  a.target = target || '_self'
  let lb = document.createElement('span')
  lb.textContent = label
  a.append(lb)
  if (icon) {
    lb = document.createElement('span')
    lb.className = 'text-shadow'
    lb.append(icon)
    a.prepend(lb)
  }
  return a
}

// category.js:4 Start — build the chain. Every query string / macro name is byte-identical to the
// original (server templates). `field`/`parent` branch on numeric-vs-hash id; `check` passes for a
// numeric id even with no content (→ fake category) but requires content for a hash id.
function Start(loc: NavLocation): StartResult {
  const id = loc.id
  let field: string
  let parent: string
  if ('number' == typeof id) {
    field = 'id'
    parent = ' = @key'
  } else {
    field = 'hash'
    parent = ' IN @content.id'
  }
  const pnum = +loc.query.page || 1
  const cfields =
    'parentId,deleted,literalType,name,id,contentType,hash,permissions,lastCommentId,createUserId'
  const cquery = `parentId ${parent} AND !notdeleted() AND id NOT IN @Ccategories.id`
  return {
    chain: {
      values: {
        key: id,
      },
      requests: [
        { type: 'content', fields: '*', query: `${field} = @key` },
        {
          name: 'Ccategories',
          type: 'content',
          fields: cfields,
          query: `parentId ${parent} AND !notdeleted() AND (!onlyparents() OR literalType={{category}} )`,
          order: 'name_desc',
        },
        {
          name: 'Cchildren',
          type: 'content',
          fields: cfields,
          query: cquery,
          order: 'lastCommentId_desc',
          limit: PSIZE,
          skip: PSIZE * (pnum - 1),
        },
        {
          name: 'count',
          type: 'content',
          fields: 'parentId,deleted,id,specialCount,literalType',
          query: cquery,
        },
        // will be blank if we're on the root category
        {
          name: 'Cparent',
          type: 'content',
          fields: cfields,
          query: 'id IN @content.parentId AND !notdeleted()',
        },
        {
          type: 'user',
          fields: '*',
          query:
            'id In @content.createUserId OR id In @Ccategories.createUserId OR id In @Cchildren.createUserId OR id In @Cparent.createUserId ',
        },
      ],
    },
    check(resp) {
      return field == 'id' || resp.content[0]
    },
  }
}

function CategoryView({ data, loc, header }: ViewComponentProps): React.JSX.Element {
  // category.js:4-14 — page_id / pnum recomputed from the url (Start stored these on `this`).
  const id = loc.id
  const url_page_id = 'number' == typeof id ? id : null
  const pnum = +loc.query.page || 1

  // Render's destructure: {content:[page], Ccategories, Cchildren, user, Cparent:[parent], count:[{specialCount}]}
  const raw_page = data.content[0] as Content | undefined
  const user = data.user as EntityList<User>
  const categories = data.Ccategories as EntityList<Content>
  const children = data.Cchildren as EntityList<Content>
  const specialCount = data.count[0].specialCount
  let cparent = data.Cparent[0] as Content | undefined

  // category.js:79 — no content ⇒ fake category (numeric-id branch only, per `check`).
  const is_fake = !raw_page
  const page: Content = raw_page ?? Entity.fake_category(url_page_id as number)
  const page_id = raw_page ? raw_page.id : url_page_id
  // category.js:91 — fall back to a fake parent when the parent row is absent.
  if (raw_page && !cparent) cparent = Entity.fake_category(raw_page.parentId)

  // category.js:52-62 go() — paginate this slot. Clicking the button mousedown-focuses this slot
  // (navigate.js:29 capture handler), so Nav.load_location's default focused slot IS this slot —
  // equivalent to the original's explicit `this.Slot.load_location`.
  const go = (dir: number): void => {
    const p = pnum || 1
    if (p + dir < 1) return
    const next: NavLocation = { ...loc, query: { ...loc.query, page: String(p + dir) } }
    Nav.load_location(next)
  }

  // category.js:80-97 — the two imperative header side effects. Deferred to a layout effect (the
  // header refs are populated by React's commit) with a cleanup that removes the appended links.
  useLayoutEffect(() => {
    const links: Node[] = []
    if (is_fake) {
      links.push(
        build_header_link({ icon: '📝️', label: 'new child', href: '#editpage?parent=' + page_id }),
      )
    } else {
      links.push(
        build_header_link({ icon: '📝️', label: 'new child', href: '#editpage?parent=' + page_id }),
      )
      links.push(
        build_header_link({ icon: '📄️', label: 'visit page', href: '#page/' + page_id }),
      )
      links.push(build_header_link({ icon: '✏️', label: 'edit', href: '#editpage/' + page.id }))
    }
    header.add_header_links(...links)
    header.set_entity_title(page)
    return () => {
      for (const l of links) (l as ChildNode).remove()
    }
    // data + loc are stable for a slot's lifetime (Slot is keyed by url) and fully determine
    // is_fake/page/page_id, so this runs once per mount (StrictMode's second pass re-appends after
    // the cleanup — no duplication). `page` is intentionally not a dep: it is a fresh fake_category
    // object each render but deterministic from `loc`, so recomputing it wouldn't change the header.
  }, [data, loc, header])

  // category.js:72 — author for the info pane.
  const page_author = user[~page.createUserId]
  // parent's author (category_item replaces its trailing <span> with a user_label when present).
  const parent_author = cparent ? user[~cparent.createUserId] : undefined

  return (
    <view-root class="COL" style={{ overflowY: 'auto' }}>
      <div className="pageInfoPane bar rem1-5" style={{ justifyContent: 'space-between' }}>
        <div className="ROW">
          <span style={{ marginRight: '0.5rem' }}>
            {page_author ? <UserLabel user={page_author} /> : null}
          </span>
          <span>
            Created: <TimeAgo time={page.createDate2 as Date} />
          </span>
        </div>
      </div>
      {page.description ? (
        <MarkupContent
          tag="div"
          className="pageContents"
          text={page.description}
          lang={page.values.markupLang as string}
          etc={MARKUP_ETC}
        />
      ) : (
        <div className="pageContents" />
      )}
      <div className="category-list">
        {!is_fake && cparent ? (
          <>
            {/* category.js:93 — category_item(parent, user, true) with "Parent ⮭" prepended into
                the <a> (which holds content_label's inner icon span). */}
            <a className="bar rem1-5 category-page" href={'#category/' + cparent.id}>
              {'Parent ⮭'}
              <ContentIcon content={cparent} isCategory={true} />
            </a>
            {parent_author ? <UserLabel user={parent_author} /> : <span />}
          </>
        ) : null}
      </div>
      Child categories:
      <div className="category-list">
        {categories.map((c) => (
          <CategoryItem key={c.id} content={c} user={user} isCategory={true} />
        ))}
      </div>
      <div className="bar rem1-5 nav ROW">
        <button onClick={() => go(-1)}>◀prev</button>
        <span>{pnum + '/' + Math.ceil(specialCount / PSIZE)}</span>
        <button onClick={() => go(1)}>next▶</button>
      </div>
      <div className="category-list">
        {children.map((c) => (
          <CategoryItem key={c.id} content={c} user={user} isCategory={false} />
        ))}
      </div>
    </view-root>
  )
}

// category.js:128-131 — register the view and the `categories` → `category` redirect.
const CategoryViewModule: RouteModule = { Start, Component: CategoryView }
register('category', CategoryViewModule)
register('categories', {
  Redirect(location) {
    location.type = 'category'
  },
})

export { CategoryViewModule }
