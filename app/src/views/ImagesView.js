import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// L7d — ImagesView (ports src/Views/images.js; ARCHITECTURE §6/§10). Route `images`: a
// URL-driven paginated gallery of files (contentType=3) with layered-CSS thumbnails, a detail
// pane, "Set Avatar", and "show in sidebar".
//
// Per ARCHITECTURE, Images is a "simple view" (JSX + chain data): Start() builds the chain,
// the Component renders from the loaded `data` and the parsed `loc`. Pagination/bucket changes
// re-navigate the focused slot via Nav.load_location (== the old `this.Slot.load_location`),
// which remounts this view with a fresh Start/Render — so the thumbnail clear + detail reset the
// old Init/Render did on every load happen naturally on remount.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Req } from '../services/request';
import { Nav } from '../services/nav';
import { Entity, FileMeta } from '../data/entity';
import { AVATAR_SIZE, avatar_url, time_string } from '../services/draw';
import { showInSidebar } from '../components/FilePanel';
import { register } from '../routing/view-registry';
// images.js:3 — page size (module-global; only read here).
const IMG_PER_PAGE = 30;
// ---- Sidebar bridge (Sidebar.tabs.select) -------------------------------------------------------
// The old ImagesView reached the global `Sidebar.tabs.select('file')`. Sidebar is a higher layer
// (L8) not present here, so a no-op sink is injected and Sidebar/boot registers the real selector
// at mount — mirroring request.ts's setSidebarTabSelect / FilePanel's showInSidebar controller.
let selectSidebarTab = () => { };
export function setImagesSidebarTabSelect(fn) {
    selectSidebarTab = fn;
}
// images.js:6 — Start(location): read {bucket,page,uid} from the query and build the chain. The
// `page|0||1`, the `{{3}}`/`@bucket`/`JSON.stringify(bucket)` query-DSL templates, and the raw
// `uid` string interpolation are kept byte-identical (server templates).
function Start(location) {
    const bucket = location.query.bucket;
    const page = (Number(location.query.page) | 0) || 1;
    const uid = location.query.uid;
    let search = 'contentType = {{3}}';
    if (bucket)
        search += ' AND !valuelike({{bucket}}, @bucket)';
    if (uid)
        search += ' AND createUserId = {{' + uid + '}}';
    return {
        chain: {
            values: {
                bucket: JSON.stringify(bucket),
            },
            requests: [
                {
                    type: 'content',
                    fields: '*',
                    query: search,
                    order: 'id_desc',
                    limit: IMG_PER_PAGE,
                    skip: (page - 1) * IMG_PER_PAGE,
                },
                { type: 'user', fields: '*', query: 'id IN @content.createUserId.' },
            ],
        },
    };
}
function ImagesViewComponent({ data, loc, header }) {
    const content = (data.content ?? []);
    const user = (data.user ?? []);
    // images.js:9-13 — page/bucket re-derived from the parsed location (Start stored them on `this`;
    // the port reads them straight off `loc`).
    const page = (Number(loc.query.page) | 0) || 1;
    const bucket = loc.query.bucket;
    // The detail pane's currently-selected image (was `this.current`; select_image(null) on load →
    // initial null).
    const [current, setCurrent] = useState(null);
    // images.js:71 — title: " Images " + "(bucket)". Set in a layout effect so the header portal is
    // populated post-commit / pre-paint (the old Render called Slot.set_title synchronously).
    let title = ' Images ';
    if (bucket)
        title += '(' + bucket + ')';
    useLayoutEffect(() => {
        header.set_title(title);
    }, [header, title]);
    // images.js:77-114 — build the thumbnails. Each is a bare <div> whose layered `background`
    // shorthand composites the border-gradient, the image, and (when private) the hidden overlay,
    // exactly as the original. `file.Meta` is attached in place on the entity (used later by the
    // detail pane), matching the old Render.
    const thumbs = useMemo(() => {
        // images.js:83 — round .5 down to floor, else Math.round (kept verbatim, quirk and all).
        function round(x) {
            if (x % 2 == 0.5)
                return Math.floor(x);
            return Math.round(x);
        }
        return content.map((file) => {
            const meta = (file.Meta = new FileMeta(file, user[~file.createUserId]));
            let bg = '#DDD';
            if (meta.width) {
                const max = Math.max(meta.width, meta.height);
                const width = round((meta.width / max) * AVATAR_SIZE);
                const height = round((meta.height / max) * AVATAR_SIZE);
                bg = `no-repeat linear-gradient(orange, red) center / ${width + 2}px ${height + 2}px, ` + bg;
            }
            // Req.image_url is typed (id: number) but the original passes the content HASH string
            // (L3a-flagged); cast to preserve behavior.
            const url = Req.image_url(file.hash, AVATAR_SIZE);
            bg = `no-repeat url("${url}") center, ` + bg;
            if (!Entity.has_perm(file.permissions, 0, 'R'))
                bg = `no-repeat url(resource/hiddenpage.png) top left / 20px, ` + bg;
            return (_jsx("div", { title: file.name, style: { background: bg }, onClick: () => setCurrent(file) }, file.id));
        });
    }, [content, user]);
    // images.js:49-57 — prev/next pagination. Clicking a button first grabs slot focus (the
    // <view-slot> capture handlers), so Nav.load_location's default focused-slot target is this
    // slot — the faithful stand-in for `this.Slot.load_location(this.location)`.
    const go = (dir) => {
        const p = page || 1;
        if (p + dir < 1)
            return;
        const next = { ...loc, query: { ...loc.query, page: String(p + dir) } };
        Nav.load_location(next);
    };
    // images.js:59-62 — bucket filter. The original used the native `change` event (fires on
    // commit/blur, NOT per keystroke), so a native listener is attached via ref rather than React's
    // input-driven onChange. Empty value ≡ null here: unparse_url emits a bare `?bucket` either way.
    const bucketRef = useRef(null);
    useLayoutEffect(() => {
        const el = bucketRef.current;
        if (!el)
            return;
        const handler = () => {
            const next = { ...loc, query: { ...loc.query, bucket: el.value || '' } };
            Nav.load_location(next);
        };
        el.addEventListener('change', handler);
        return () => el.removeEventListener('change', handler);
    }, [loc]);
    // images.js:36-45 — Set Avatar: Req.me.avatar = hash, then Req.write(Req.me).
    const onSetAvatar = () => {
        if (!current)
            return;
        Req.me.avatar = current.hash;
        Req.write(Req.me).do = (_resp, err) => {
            if (!err)
                print('ok');
            else
                alert('edit failed');
        };
    };
    // images.js:64-69 — show in sidebar: open the file in the sidebar's file tab.
    const onInSidebar = () => {
        if (!current)
            return;
        showInSidebar(current);
        selectSidebarTab('file');
    };
    // images.js:120-148 — the detail pane (select_image). Rendered from `current`; when null the
    // whole ROW is `hidden` (== `$image_show.hidden = !content`). Keying the <img> by content id
    // gives a fresh element on each selection so the previous image never lingers while the new one
    // loads (the old `$image.src = ""` reset).
    const c = current;
    const meta = c?.Meta ?? null;
    return (_jsxs("view-root", { className: "COL", children: [_jsx("div", { className: "images-thumbnails", children: thumbs }), _jsxs("div", { className: "nav rem1-5 ROW", children: [_jsx("button", { onClick: () => go(-1), children: "\u25C0prev" }), _jsx("span", { children: page }), _jsx("button", { onClick: () => go(1), children: "next\u25B6" }), "Bucket:", _jsx("input", { ref: bucketRef, placeholder: "bucket", defaultValue: bucket || '' })] }), _jsxs("div", { className: "FILL ROW", hidden: !current, children: [_jsx("div", { className: "images-container", style: { width: '50%' }, children: _jsx("img", { className: "images-current", style: meta ? { aspectRatio: `${meta.width} / ${meta.height}` } : undefined, src: c ? Req.image_url(c.hash) : '' }, c ? c.id : 'none') }), _jsxs("div", { className: "COL images-data FILL", children: [_jsx("a", { style: { fontWeight: 'bold', textDecoration: 'underline' }, href: c ? '#page/' + c.id : undefined, children: _jsx("span", { className: "pre", children: c ? c.name2 : '' }) }), _jsxs("div", { className: "images-meta", children: [_jsx("b", { children: c ? c.literalType.replace('image/', '').toUpperCase() : '' }), _jsxs("span", { children: [_jsx("b", { children: meta ? Math.round(meta.size / 1000) : '' }), "kB"] }), _jsxs("span", { children: [_jsx("b", { children: meta?.width }), "\u00D7", _jsx("b", { children: meta?.height })] }), _jsxs("span", { children: ["q", _jsx("b", { children: meta?.quantize || '' })] })] }), _jsxs("div", { children: [_jsx("span", { children: meta ? (
                                        // Draw.user_label(createUser) + the added `user-label2` class. Inlined (rather than
                                        // reusing <UserLabel>) because that class must land on the anchor and UserLabel
                                        // takes no className; markup is otherwise identical to UserLabel.
                                        _jsxs("a", { tabIndex: -1, className: "bar rem1-5 user-label user-label2", href: '#user/' + meta.createUser.id, children: [_jsx("img", { className: "item avatar", width: 50, height: 50, src: avatar_url(meta.createUser) }), _jsx("span", { className: "entity-title pre", children: meta.createUser.username })] })) : null }), _jsx("time", { style: { marginLeft: '0.5rem' }, children: c ? time_string(c.createDate2) : '' })] }), _jsxs("div", { children: [_jsx("button", { onClick: onSetAvatar, children: "Set Avatar" }), _jsx("button", { onClick: onInSidebar, children: "show in sidebar" })] })] })] })] }));
}
// images.js:188 — View.register('images', ImagesView).
export const ImagesView = { Start, Component: ImagesViewComponent };
register('images', ImagesView);
