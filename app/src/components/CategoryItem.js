import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { ContentIcon } from './EntityLabel';
import { UserLabel } from './UserLabel';
export function CategoryItem({ content, user, isCategory = true, }) {
    const author = user[~content.createUserId];
    return (_jsxs(_Fragment, { children: [_jsx("a", { className: "bar rem1-5 category-page", href: '#category/' + content.id, children: _jsx(ContentIcon, { content: content, isCategory: isCategory }) }), author ? _jsx(UserLabel, { user: author }) : _jsx("span", {})] }));
}
