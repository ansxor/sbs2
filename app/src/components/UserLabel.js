import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { avatar_url } from '../services/draw';
export function UserLabel({ user, reverse = false, }) {
    const img = _jsx("img", { className: "item avatar", width: 50, height: 50, src: avatar_url(user) });
    const name = _jsx("span", { className: "entity-title pre", children: user.username });
    return (_jsx("a", { tabIndex: -1, className: "bar rem1-5 user-label", href: '#user/' + user.id, children: reverse ? (_jsxs(_Fragment, { children: [name, img] })) : (_jsxs(_Fragment, { children: [img, name] })) }));
}
