// Presentational twin of Draw.user_label (draw.js:197-210). Emits
// `<a tabindex=-1 class='bar rem1-5 user-label'>` with `href="#user/"+user.id`, an avatar img
// and a `<span class='entity-title pre'>` username. `reverse` prepends the name span before the
// avatar (draw.js:203). The template's avatar img carries NO alt attribute (unlike Draw.avatar),
// so this img is emitted inline rather than through <Avatar> to preserve that exactly.
import type { User } from '../data/types'
import { avatar_url } from '../services/draw'

export function UserLabel({
  user,
  reverse = false,
}: {
  user: User
  reverse?: boolean
}): React.JSX.Element {
  const img = <img className="item avatar" width={50} height={50} src={avatar_url(user)} />
  const name = <span className="entity-title pre">{user.username}</span>
  return (
    <a tabIndex={-1} className="bar rem1-5 user-label" href={'#user/' + user.id}>
      {reverse ? (
        <>
          {name}
          {img}
        </>
      ) : (
        <>
          {img}
          {name}
        </>
      )}
    </a>
  )
}
