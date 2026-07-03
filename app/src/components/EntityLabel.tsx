// Presentational twin of Draw.content_label (draw.js:13-48). Emits an
// `<entity-label><span class='icon-title entity-title pre'>` whose icon carries the chosen
// background image (thumbnail / type icon + category / hidden overlays) and the entity's
// normalized name. The background-image selection is ported byte-for-byte from draw.js and
// draw-dom.ts's content_label; ContentIcon is exported so CategoryItem can drop the inner
// span into its <a> exactly as the original moved content_label's childNodes.
import type { Content, Id } from '../data/types'
import { CODES, Entity } from '../data/entity'
import { Req } from '../services/request'
import { AVATAR_SIZE } from '../services/draw'

// draw.js:14-36 — chooses the CSS backgroundImage string for a content's icon. Req.image_url's
// `id` is frozen numeric but takes string hashes at runtime (see draw.ts deviation note); cast
// through the frozen surface exactly as draw-dom.ts does.
export function content_label_bg(content: Content, isCategory?: boolean): string {
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
  return bg
}

// The inner `<span class='icon-title entity-title pre'>` — the single child content_label
// builds (draw.js:38-42). Shared with CategoryItem, which appends this same span into its <a>.
export function ContentIcon({
  content,
  isCategory,
}: {
  content: Content
  isCategory?: boolean
}): React.JSX.Element {
  return (
    <span className="icon-title entity-title pre" style={{ backgroundImage: content_label_bg(content, isCategory) }}>
      {content.name2}
    </span>
  )
}

export function EntityLabel({
  content,
  isCategory,
}: {
  content: Content
  isCategory?: boolean
}): React.JSX.Element {
  return (
    <entity-label>
      <ContentIcon content={content} isCategory={isCategory} />
    </entity-label>
  )
}
