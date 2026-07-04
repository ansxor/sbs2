// Presentational twin of Draw.category_item (draw.js:211-222). Emits two root nodes (a
// fragment): `<a class='bar rem1-5 category-page' href="#category/"+content.id>` holding the
// content label's inner icon span (the original appended content_label's childNodes into the
// <a> — so the <entity-label> wrapper is intentionally NOT emitted here), followed by either a
// <UserLabel> for `user[~content.createUserId]` or an empty <span> placeholder when the author
// is not in the cache (matching the original's untouched trailing <span>).
import type { Content, EntityList, User } from '../data/types'
import { ContentIcon } from './EntityLabel'
import { UserLabel } from './UserLabel'
import { promptBlockRoom, roomBlockProps } from '../services/block'

export function CategoryItem({
  content,
  user,
  isCategory = true,
}: {
  content: Content
  user: EntityList<User>
  isCategory?: boolean
}): React.JSX.Element {
  const author = user[~content.createUserId]
  return (
    <>
      <a
        className="bar rem1-5 category-page"
        href={'#category/' + content.id}
        onClick={(ev) => promptBlockRoom(ev, roomBlockProps(content))}
      >
        <ContentIcon content={content} isCategory={isCategory} />
      </a>
      {author ? <UserLabel user={author} /> : <span />}
    </>
  )
}
