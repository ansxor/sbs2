// Presentational twin of Draw.avatar (draw.js:63). Emits the identical
// `<img class='item avatar' width=50 height=50>` with `src=avatar_url(user)` and
// `alt=user.username`. Static — the avatar url is a snapshot computed at render time.
import type { Author, User } from '../data/types'
import { avatar_url } from '../services/draw'

// Draw.avatar always calls avatar_url(user) with the default AVATAR_SIZE; `size` is exposed
// here for the callers that render avatars at other sizes through avatar_url directly.
export function Avatar({
  user,
  size,
}: {
  user: User | Author
  size?: number
}): React.JSX.Element {
  return (
    <img
      className="item avatar"
      width={50}
      height={50}
      src={size === undefined ? avatar_url(user) : avatar_url(user, size)}
      alt={user.username}
    />
  )
}
