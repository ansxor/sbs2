import { jsx as _jsx } from "react/jsx-runtime";
import { avatar_url } from '../services/draw';
// Draw.avatar always calls avatar_url(user) with the default AVATAR_SIZE; `size` is exposed
// here for the callers that render avatars at other sizes through avatar_url directly.
export function Avatar({ user, size, }) {
    return (_jsx("img", { className: "item avatar", width: 50, height: 50, src: size === undefined ? avatar_url(user) : avatar_url(user, size), alt: user.username }));
}
