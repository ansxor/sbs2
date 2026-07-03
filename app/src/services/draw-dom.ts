// Imperative DOM-returning label builders ported from draw.js (ARCHITECTURE §9, §10, L2c).
// These are consumed by the imperative activity/sidebar/view code and must emit byte-identical
// tags, classes and attributes to the originals (which cloned `𐀶`-tagged HTML templates). The
// React chrome uses the presentational twins in components/ instead; these stay imperative.
import type { Content, EntityList, Id, User } from '../data/types'
import { CODES, Entity } from '../data/entity'
import { Req } from './request'
import { AVATAR_SIZE, avatar_url } from './draw'

// draw.js:13-48. Icon+title label for a content entity. Returns an <entity-label> whose child
// span carries the chosen background image (thumbnail/type icon + category/hidden overlays)
// and the entity's normalized name. Req.image_url's `id` is frozen numeric but takes string
// hashes at runtime (see draw.ts deviation note); cast through the frozen surface.
export function content_label(content: Content, isCategory?: boolean): HTMLElement {
  // choose icon
  let bg
  if (content.values.thumbnail) {
    bg = 'url(' + Req.image_url(content.values.thumbnail as unknown as Id, AVATAR_SIZE, true) + ')'
  } else if (content.contentType == CODES.InternalContentType.file)
    bg = 'url(' + Req.image_url(content.hash as unknown as Id, AVATAR_SIZE, true) + ')'
  else if (content.contentType == CODES.InternalContentType.userpage)
    bg = 'url(resource/page-userpage.png)'
  else if (content.contentType != CODES.InternalContentType.page)
    bg = 'url(resource/page-unknown.png)'
  else if (content.literalType == 'category') {
    if (content.hash === 'FAKE')
      // hack
      bg = 'url(resource/page-fakeparent.png)'
    else bg = 'url(resource/page-category.png)'
  } else bg = 'url(resource/page-resource.png)'
  // fake category
  if (isCategory && content.literalType != 'category')
    bg = 'url(resource/overlay-categoryfront.png), ' + bg + ', url(resource/overlay-categoryback.png)'
  // non-public
  if (!Entity.has_perm(content.permissions, 0, 'R')) bg = 'url(resource/hiddenpage.png), ' + bg
  // draw
  const e = document.createElement('entity-label')
  const icon = document.createElement('span')
  icon.className = 'icon-title entity-title pre'
  e.appendChild(icon)
  icon.style.backgroundImage = bg
  // label
  icon.textContent = content.name2
  return e
}

// draw.js:197-210. Avatar + username link for a user. Kept here (rather than only as the
// UserLabel component twin) because category_item builds it imperatively.
function user_label(user: User, reverse = false): HTMLAnchorElement {
  const e = document.createElement('a')
  e.setAttribute('tabindex', '-1')
  e.className = 'bar rem1-5 user-label'
  const img = document.createElement('img')
  img.className = 'item avatar'
  img.setAttribute('width', '50')
  img.setAttribute('height', '50')
  const label = document.createElement('span')
  label.className = 'entity-title pre'
  e.append(img, label)

  e.href = '#user/' + user.id
  ;(e.firstChild as HTMLImageElement).src = avatar_url(user)
  ;(e.lastChild as HTMLSpanElement).textContent = user.username
  if (reverse) e.prepend(e.lastChild as ChildNode) // w
  return e
}

// draw.js:211-222. Category row: a <a.category-page> holding the content label's inner nodes,
// followed by the author's user label (or an empty <span> placeholder if the author is unknown).
// Returns a DocumentFragment (two root nodes), exactly like the original two-root template.
export function category_item(
  content: Content,
  user: EntityList<User>,
  isCategory = true,
): DocumentFragment {
  const e = document.createDocumentFragment()
  const link = document.createElement('a')
  link.className = 'bar rem1-5 category-page'
  const placeholder = document.createElement('span')
  e.append(link, placeholder)

  ;(e.firstChild as HTMLAnchorElement).href = '#category/' + content.id
  const label = content_label(content, isCategory)
  ;(e.firstChild as HTMLAnchorElement).append(...label.childNodes) //hack...
  let author = user[~content.createUserId]
  if (author) (e.lastChild as ChildNode).replaceWith(user_label(author))
  return e
}
