import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// L7b — src/Views/comments.js ported. Route `comments` (+ `chatlogs` redirect): a chat-search
// form (text / page ids / user ids / date range / id range / pagination / reverse) that builds an
// `Lp.chain` query byte-identical to the original and renders result groups, each an imperative
// `MessageList` island with load-older/newer buttons.
//
// Structure (ARCHITECTURE §0/§6/§12): the RouteModule exposes `Start(loc)` (builds the chain, or
// `{quick}` for an empty form) and a `Component`. Start and the Component both derive their query
// state from `loc` via the same pure `prepare()` helper, so the merge/quick/pid decisions match
// exactly (there is no shared `this`). The interactive `<Form>` (useForm) is a separate stateful
// controller used only for display + re-navigation (`go`). The result groups are built
// imperatively into a ref'd container (the same DOM the old `draw_result` produced), each hosting
// its own `MessageList` — React never renders a message.
import { useLayoutEffect, useRef, useState } from 'react';
import { register } from '../routing/view-registry';
import { Form, useForm } from '../components/Form';
import { MessageInfo } from '../components/MessageInfo';
import { MessageList } from '../services/message-list';
import { content_label } from '../services/draw-dom';
import { Nav } from '../services/nav';
// ---- form spec (comments.js Start) — field order + params are load-bearing (query keys) ----
const FORM_SPEC = {
    fields: [
        ['search', 'text', { label: 'Text', param: 's', placeholder: 'wildcards: _ %' }],
        ['pages', 'number_list', { label: 'Page Ids', param: 'pid' }],
        ['users', 'number_list', { label: 'User Ids', param: 'uid' }],
        ['start', 'date', { label: 'Start Date', param: 'start', date_shortcuts: true }],
        ['end', 'date', { label: 'End Date', param: 'end' }],
        ['range', 'range', { label: 'Id Range', param: 'ids' }],
    ],
};
// fill.js:164 rmatch — .match returning [] on no match so destructuring never throws.
function rmatch(re, str) {
    return str.match(re) || [];
}
// input.js number_list.from_query — `s.match(/[^,\s]+/g).map(Number)` (unguarded, as the
// original; throws on a truthy-but-matchless string, kept for parity), null when falsy.
function nl_from_query(s) {
    if (s)
        return s.match(/[^,\s]+/g).map((x) => Number(x));
    return null;
}
// input.js range.decode/from_query.
function decode_range(x) {
    if (x == '' || x == null)
        return null;
    const [match, min, max] = rmatch(/^(\d*)-(\d*)$/, x);
    if (match)
        return { min: min ? Number(min) : null, max: max ? Number(max) : null };
    return { ids: x.split(',').map((y) => Number(y)) };
}
// comments.js build_search — returns [chainOrNull, merge]. Query strings/order/limit/skip are
// reproduced byte-for-byte (the empty-form check deliberately ignores `data.pages`, kept).
function build_search(data, page, limit, reverse) {
    if (!(data.search || (data.users && data.users.length) || data.range || data.start || data.end))
        return [null, false];
    const values = {};
    const query = ['!notdeleted()'];
    let order = 'id';
    let merge = true;
    if (reverse) {
        order = 'id_desc';
        merge = false;
    }
    const text = data.search;
    if (text) {
        values.text = `%${text}%`;
        query.push('text LIKE @text');
        merge = false;
    }
    if (data.pages) {
        values.pids = data.pages;
        query.push('contentId IN @pids');
    }
    if (data.users) {
        values.uids = data.users;
        query.push('createUserId IN @uids');
        merge = false;
    }
    const range = data.range;
    if (range) {
        if (range.ids) {
            values.ids = range.ids;
            query.push('id IN @ids');
            if (range.ids.length > 1)
                merge = false;
        }
        else {
            if (range.min != null) {
                values.min_id = range.min - 1;
                query.push('id > @min_id');
            }
            if (range.max != null) {
                values.max_id = range.max + 1;
                query.push('id < @max_id');
            }
        }
    }
    if (!data.pages || data.pages.length > 1)
        merge = false; // temporary hack disable
    if (data.start) {
        values.start = data.start.toISOString();
        query.push('createDate > @start');
    }
    if (data.end) {
        values.end = data.end.toISOString();
        query.push('createDate < @end');
    }
    if (page < 1)
        page = 1;
    limit = limit || 200;
    const skip = (page - 1) * limit;
    return [
        {
            values,
            requests: [
                { type: 'message', fields: '*', query: query.join(' AND '), order, limit, skip },
                { name: 'replies', type: 'message', fields: '*', query: 'id in @message.values.replyingTo' },
                {
                    type: 'content',
                    fields: 'name,id,createUserId,permissions,contentType,literalType,values',
                    query: 'id IN @message.contentId',
                },
                {
                    type: 'user',
                    fields: '*',
                    query: 'id IN @message.createUserId OR id IN @content.createUserId OR id IN @replies.createUserId',
                },
            ],
        },
        merge,
    ];
}
function prepare(loc) {
    const query = loc.query;
    const id = loc.id;
    const data = {
        search: query.s !== undefined ? query.s : null,
        // form.from_query(query) then, if id, form.inputs.pages.value = [id].
        pages: id ? [id] : nl_from_query(query.pid),
        users: nl_from_query(query.uid),
        start: query.start ? new Date(query.start) : null,
        end: query.end ? new Date(query.end) : null,
        range: decode_range(query.ids),
    };
    const page = Math.max(Number(query.page) | 0, 1);
    const limit = Number(query.limit) | 0;
    const reverse = query.r != null;
    const pid = id ? id : null;
    const [chain, merge] = build_search(data, page, limit, reverse);
    return { page, limit, reverse, pid, chain, merge };
}
// draw.js:226 event_lock — gate a button handler on `elem.disabled`; hand back a `done()` that
// re-enables. Reimplemented inline (Draw.event_lock is not a shared export in the port).
function event_lock(callback) {
    return (ev) => {
        const elem = ev.currentTarget;
        if (elem.disabled)
            return;
        elem.disabled = true;
        callback(() => {
            elem.disabled = false;
        }, elem);
    };
}
// comments.js CommentsView.result_template (a `𐀶` deep-clone template) — rebuilt with DOM APIs.
function result_template() {
    const outer = document.createElement('div');
    outer.className = 'search-comment';
    const bar = document.createElement('div');
    bar.className = 'bar rem1-5 search-comment-page';
    const row = document.createElement('div');
    row.className = 'ROW';
    const btns = document.createElement('div');
    btns.className = 'search-comment-buttons COL';
    const older = document.createElement('button');
    older.dataset.action = 'load_older';
    older.append('↑');
    const newer = document.createElement('button');
    newer.dataset.action = 'load_newer';
    newer.append('↓');
    btns.append(older, newer);
    const ml = document.createElement('message-list');
    ml.className = 'FILL';
    row.append(btns, ml);
    outer.append(bar, row);
    return outer;
}
// comments.js CommentsView.draw_result — build one result group (single message via display_only,
// or a merged edge-run via display_edge) hosting its own MessageList, with wired load buttons.
function draw_result(comment, pages) {
    const e = result_template();
    const inner = e.lastChild.lastChild; // <message-list>
    const link = e.firstChild; // .search-comment-page
    let list;
    if (Array.isArray(comment)) {
        list = new MessageList(inner, comment[0].contentId); // i sure hope it does (contentId)
        for (const c of comment)
            list.display_edge(c);
    }
    else {
        list = new MessageList(inner, comment.contentId);
        list.display_only(comment);
    }
    const parent = pages[~list.pid];
    link.append(content_label(parent));
    const btns = inner.previousSibling.childNodes;
    const handler = event_lock((done, elem) => {
        const old = elem.dataset.action == 'load_older';
        list.load_messages_near(old, 10, (ok) => {
            if (ok)
                done();
        });
    });
    btns[0].onclick = handler;
    btns[1].onclick = handler;
    return e;
}
// ---- React Component (comments.js Init/Render/Quick/go) ----------------------------------------
function CommentsComponent({ data, loc, header }) {
    const prep = prepare(loc);
    const form = useForm(FORM_SPEC);
    const rootRef = useRef(null);
    const resultsRef = useRef(null);
    const pageRef = useRef(null);
    const limitRef = useRef(null);
    const orderRef = useRef(null);
    const [status, setStatus] = useState('');
    const [selected, setSelected] = useState(null);
    // Init: from_query(query) + id override + write() into the mounted form.
    useLayoutEffect(() => {
        form.from_query(loc.query);
        if (loc.id)
            form.inputs.pages.value = [loc.id];
        form.write();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form]);
    // Init: set the header title and, for a single-page search, the page link. The frozen
    // add_header_links takes prebuilt Nodes, so the old {href,label,icon} → <a> construction
    // (navigate.js:66) moves here. Runs once (slot is url-keyed → header cleared on every nav).
    useLayoutEffect(() => {
        header.set_title('Chat Search');
        if (prep.pid) {
            const a = document.createElement('a');
            a.href = '#page/' + prep.pid;
            a.target = '_self';
            const label = document.createElement('span');
            label.textContent = 'page';
            a.append(label);
            const icon = document.createElement('span');
            icon.className = 'text-shadow';
            icon.append('📄️');
            a.prepend(icon);
            header.add_header_links(a);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Init: message_control 'info' handler on the view-root (bubble phase) → open MessageInfo.
    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root)
            return;
        const on_control = (ev) => {
            const e = ev;
            if (e.detail.action == 'info') {
                e.stopPropagation();
                setSelected(e.detail.data);
            }
        };
        root.addEventListener('message_control', on_control);
        return () => root.removeEventListener('message_control', on_control);
    }, []);
    // Render / Quick — build the result groups imperatively (island) and set the status text.
    useLayoutEffect(() => {
        const el = resultsRef.current;
        if (!el)
            return;
        el.replaceChildren(); // this.$results.fill()
        if (!prep.chain) {
            setStatus('(no query)'); // Quick()
            return;
        }
        const comments = data.message || [];
        const pages = data.content;
        if (!comments.length) {
            setStatus('(none)');
            return;
        }
        setStatus(comments.length);
        if (prep.merge) {
            el.append(draw_result(comments, pages));
        }
        else {
            el.append(...comments.map((msg) => draw_result(msg, pages)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);
    // go(dir) — recompute the query from the form + pagination and re-navigate the (focused) slot.
    const go = (dir) => {
        form.read();
        let pnum = Math.max(Number(pageRef.current.value) | 0, 1);
        if (dir) {
            pnum += dir;
            if (pnum < 1)
                pnum = 1;
        }
        const reverse = orderRef.current.checked;
        const limit = Number(limitRef.current.value) | 0;
        const query = form.to_query();
        let id;
        const pages = form.inputs.pages.value;
        if (pages && pages.length == 1) {
            id = pages[0];
            delete query.pid;
        }
        else {
            id = null;
        }
        if (reverse)
            query.r = '';
        else
            delete query.r;
        if (limit)
            query.limit = String(limit);
        else
            delete query.limit;
        if (pnum != 1)
            query.page = String(pnum);
        else
            delete query.page;
        Nav.load_location({ type: loc.type, id, query, fragment: loc.fragment });
    };
    const on_submit = (e) => {
        console.log(e);
        e.preventDefault();
        const btn = e.nativeEvent.submitter;
        if (btn && btn.name == 'prev')
            go(-1);
        else if (btn && btn.name == 'next')
            go(1);
        else
            go(null);
    };
    return (_jsxs("view-root", { ref: rootRef, className: "COL", children: [_jsxs("div", { className: "FILL", style: { overflowY: 'scroll' }, children: [_jsxs("form", { method: "dialog", onSubmit: on_submit, style: { background: '#666', color: 'white' }, children: [_jsx(Form, { handle: form }), _jsxs("div", { className: "nav", children: [_jsxs("label", { children: ["new first:", _jsx("input", { type: "checkbox", ref: orderRef, defaultChecked: prep.reverse })] }), "\u00A0", _jsx("button", { name: "search", style: { marginRight: 'auto' }, children: "\uD83D\uDD0DSearch" }), _jsx("span", { children: status }), "/", _jsx("input", { ref: limitRef, style: { width: '6ch' }, placeholder: "200", defaultValue: prep.limit || '' }), "\u00A0page:", _jsx("button", { name: "prev", children: "\u25C0" }), _jsx("input", { ref: pageRef, style: { width: '4ch' }, defaultValue: prep.page }), _jsx("button", { name: "next", children: "\u25B6" })] })] }), _jsx("div", { ref: resultsRef, className: "comment-search-results" })] }), _jsx("div", { children: _jsx(MessageInfo, { selected: selected, onClose: () => setSelected(null) }) })] }));
}
// ---- RouteModule (comments.js Start) -----------------------------------------------------------
const CommentsView = {
    Start(loc) {
        const { chain } = prepare(loc);
        if (!chain)
            return { quick: true };
        return { chain };
    },
    Component: CommentsComponent,
};
register('comments', CommentsView);
// comments.js: View.register('chatlogs', {Redirect}) — copy t→s / s / pid / uid into a fresh query
// with `r` first (to preserve key order), drop to `comments`, and (single pid) fold pid into id.
register('chatlogs', {
    Redirect(location) {
        const q = { r: 'true' };
        // we do it this way so the ORDER is preserved :D
        for (const [rawKey, value] of Object.entries(location.query)) {
            let key = rawKey;
            if (key == 't')
                key = 's';
            if (key == 's' || key == 'pid' || key == 'uid')
                q[key] = value;
        }
        location.query = q;
        // switch to "comments/<id>" url if there is one pid
        location.id = null;
        if (q.pid) {
            const pids = nl_from_query(q.pid);
            if (pids && pids.length == 1) {
                delete q.pid;
                location.id = pids[0];
            }
        }
        location.type = 'comments';
    },
});
