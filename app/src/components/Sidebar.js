import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// L8 — the persistent right-hand Sidebar (ports src/sidebar.js's `Sidebar` singleton + the sidebar
// markup from index.html; ARCHITECTURE §9 "Sidebar", §11 Layer 8, §12).
//
// The old Sidebar was a sealed singleton constructed once and living forever, wiring pre-existing
// index.html DOM. Here it is a React component mounted once (App renders exactly one) that renders
// the whole `<sidebar-container>` chrome AND keeps the singleton's non-visual duties as module-level
// imperative bridges the rest of the app calls (print/log sink, tabs.select, close_fullscreen).
//
// Faithful quirks preserved (§12):
//   - `localStorage['sbs-sidebar']` read as `getItem(...) !== false` — ALWAYS true (a string|null is
//     never boolean false), so the desktop sidebar defaults OPEN; writes store real booleans.
//   - separate desktop `normal_open` (f-sidebar) vs mobile `fullscreen_open` (f-mobileSidebar) gated
//     on the 700px media query; only desktop toggles persist.
//   - the bottom debug console shares one Scroller + a 500-message cap between print() output and
//     live/initial watch messages (draw_comment), reconciled by id.
//   - the global online UserList is bound to room id 0.
import { useCallback, useEffect, useRef, useState, } from 'react';
import { Tabs } from './Tabs';
import { UserList } from './UserList';
import { FilePanel } from './FilePanel';
import { SettingsForm } from './SettingsForm';
import { DebugPanel } from './DebugPanel';
import { PasswordInput } from './PasswordInput';
import { ScrollerHost } from '../islands/ScrollerHost';
import { useResizable } from '../hooks/useResizable';
import { Req, setSidebarTabSelect } from '../services/request';
import { Lp } from '../services/socket';
import { Nav, setCloseFullscreen } from '../services/nav';
import { Events } from '../services/events';
import { Act, setCategoriesTarget, setActivityMessageSink } from '../services/activity';
import { content_label } from '../services/draw-dom';
import { avatar_url, censorSpoilerText } from '../services/draw';
import { setPrintSink, sidebar_debug } from '../services/sidebar-log';
import { setImagesSidebarTabSelect } from '../views/ImagesView';
import { onMeAvatar } from '../boot/bootstrap';
// ---------------------------------------------------------------------------------------------
// Module-level toggle bridge. `$openSidebar` lives in the shell (App), `$closeSidebar` here — both
// call the same toggle. Because there is only ever one Sidebar (it lives forever), a module-level
// handle set on mount lets App reach the toggle without prop-drilling (App imports toggleSidebar).
// ---------------------------------------------------------------------------------------------
let toggleImpl = null;
export function toggleSidebar(state = null) {
    toggleImpl?.(state);
}
const BAR_HEIGHT_STYLE = { ['--bar-height']: '1.625rem' };
export function Sidebar({ containerRef }) {
    // Captured once (like the old onload, which read Req.auth a single time): login triggers a full
    // RELOAD, so the chrome need not live-update. CSS `.loggedOut`/`.loggedIn` (driven by data-login)
    // handles show/hide of the login form vs logged-in controls.
    const [auth] = useState(() => !!Req.auth);
    // sidebar.js:9-10 — two independent open states (NOT React state: they drive root classes
    // imperatively and must not trigger re-render).
    const normalOpen = useRef(false);
    const fullscreenOpen = useRef(false);
    // debug-console state (all imperative — refs, never React state).
    const scrollerRef = useRef(null);
    const printing = useRef(false);
    const messageCount = useRef(0);
    const displayedIds = useRef(Object.create(null));
    // DOM refs
    const tabsRef = useRef(null);
    const myAvatarRef = useRef(null);
    const activityRef = useRef(null);
    const watchRef = useRef(null);
    const catsRef = useRef(null);
    const searchInputRef = useRef(null);
    const searchButtonRef = useRef(null);
    const searchResultsRef = useRef(null);
    // sidebar.js:17 ResizeBar($sidebarTop, $sidebarResize, 'top', "sidebarPinnedHeight", 300) — the
    // panel-area height drag (internal to the sidebar).
    const { containerRef: topRef, handleRef: panelHandleRef } = useResizable('sidebarPinnedHeight', {
        side: 'top',
        default: 300,
    });
    // sidebar.js:167 — is_mobile / toggle (open/close). Desktop vs mobile-fullscreen are separate.
    const isMobile = () => window.matchMedia('(max-width: 700px)').matches;
    const toggle = useCallback((state = null) => {
        if (isMobile()) {
            fullscreenOpen.current = state != null ? state : !fullscreenOpen.current;
            document.documentElement.classList.toggle('f-mobileSidebar', fullscreenOpen.current);
        }
        else {
            normalOpen.current = state != null ? state : !normalOpen.current;
            document.documentElement.classList.toggle('f-sidebar', normalOpen.current);
            localStorage.setItem('sbs-sidebar', String(normalOpen.current));
        }
    }, []);
    // sidebar.js:189 — collapse the mobile fullscreen sidebar (called after each view load / on link
    // navigation to a slot's current url / after inserting a file into the editor).
    const closeFullscreen = useCallback(() => {
        fullscreenOpen.current = false;
        document.documentElement.classList.remove('f-mobileSidebar');
    }, []);
    // ---- debug console: limit / draw_comment / display_messages / print / output ----------------
    const limitMessages = useCallback(() => {
        // sidebar.js:241 — trim to ≤500 messages from the top (relies on native scroll anchoring).
        if (messageCount.current > 500)
            scrollerRef.current.print_top((inner) => {
                while (messageCount.current > 500) {
                    const n = inner.firstChild;
                    const id = n.dataset.id;
                    if (id)
                        delete displayedIds.current[+id];
                    n.remove();
                    messageCount.current--;
                }
            });
    }, []);
    // sidebar.js:255 draw_comment — one compact `<div class='sidebar-comment bar ellipsis'>` line.
    // Reproduces the 𐀶 template (whitespace between tags collapsed → the only text node is ": ").
    const drawComment = useCallback((comment) => {
        const d = document.createElement('div');
        d.className = 'sidebar-comment bar ellipsis';
        const a = document.createElement('a');
        a.tabIndex = -1;
        a.className = 'user-label';
        const img = document.createElement('img');
        img.className = 'item avatar';
        img.width = 50;
        img.height = 50;
        const span = document.createElement('span');
        span.className = 'entity-title pre';
        a.append(img, span);
        d.append(a, ': '); // template `</a>:&#32;` → colon + space
        d.dataset.id = String(comment.id);
        d.dataset.pid = String(comment.contentId);
        // for bridge messages, display nicknames instead of username
        const author = comment.Author;
        const name = author.bridge ? author.nickname + '*' : author.username;
        // censor spoiler contents (not censored in mouseover text)
        const text = censorSpoilerText(comment.text);
        d.title = `${name} in [${author.page_name}]:\n${comment.text}`;
        a.href = '#user/' + comment.createUserId;
        img.src = avatar_url(author);
        span.textContent = name;
        d.append(text.replace(/\n/g, '  '));
        return d;
    }, []);
    // sidebar.js:198 display_messages — reconcile a batch of watch/activity messages into the debug
    // scroller (add / edit / delete), keyed by displayed_ids.
    const displayMessages = useCallback((comments, initial = false) => {
        limitMessages();
        scrollerRef.current.print((inner) => {
            for (const c of comments) {
                const old = displayedIds.current[c.id];
                if (c.deleted) {
                    if (old) {
                        old.remove();
                        delete displayedIds.current[c.id];
                        messageCount.current--;
                    }
                }
                else if (c.edited) {
                    if (old) {
                        const nw = drawComment(c);
                        old.replaceWith(nw);
                        displayedIds.current[c.id] = nw;
                    }
                    else {
                        const nw = drawComment(c);
                        inner.append(nw);
                        messageCount.current++;
                        displayedIds.current[c.id] = nw;
                    }
                }
                else {
                    const nw = drawComment(c);
                    if (old)
                        old.replaceWith(nw);
                    else {
                        inner.append(nw);
                        messageCount.current++;
                    }
                    displayedIds.current[c.id] = nw;
                }
            }
        }, !initial);
    }, [drawComment, limitMessages]);
    // sidebar.js:116 print — append each arg to the console via sidebar_debug (smooth-scrolled).
    const printSink = useCallback((args) => {
        const s = scrollerRef.current;
        if (!s)
            return;
        try {
            if (printing.current) {
                alert('recursive print detected!');
                return;
            }
            printing.current = true;
            s.print((inner) => {
                for (const arg of args) {
                    try {
                        inner.append(sidebar_debug(arg));
                    }
                    catch (e) {
                        console.error(e);
                        inner.append('error printing!');
                    }
                    messageCount.current++;
                }
            }, true);
            limitMessages();
        }
        catch (e) {
            console.error('print error', e, '\n', args);
        }
        printing.current = false;
    }, [limitMessages]);
    // sidebar.js:144 output — like print but wraps `stuff` in a `<div class='debugMessage pre'>` and
    // returns it (settings.js uses the return to append " [OK]"/" [ERROR]" later).
    const output = useCallback((stuff) => {
        const div = document.createElement('div');
        div.className += ' debugMessage pre';
        div.append(stuff);
        const s = scrollerRef.current;
        if (s) {
            try {
                if (printing.current) {
                    alert('recursive print detected!');
                    return div;
                }
                printing.current = true;
                s.print((inner) => {
                    inner.append(div);
                    messageCount.current++;
                });
                limitMessages();
            }
            finally {
                printing.current = false;
            }
        }
        return div;
    }, [limitMessages]);
    // sidebar.js:293 redraw_my_avatar — the logged-in user's avatar in the "user" tab label.
    const redrawMyAvatar = useCallback(() => {
        if (myAvatarRef.current && Req.me)
            myAvatarRef.current.src = avatar_url(Req.me);
    }, []);
    // sidebar.js:58 search — Draw.event_lock(single-flight) + Lp.chain, imperatively append results.
    const doSearch = useCallback(() => {
        const btn = searchButtonRef.current;
        if (!btn || btn.disabled)
            return;
        btn.disabled = true;
        const done = () => {
            btn.disabled = false;
        };
        Lp.chain({
            values: {
                search: `%${searchInputRef.current.value}%`,
                pagetype: [1, 4],
            },
            requests: [
                {
                    type: 'content',
                    fields: 'name,id,contentType,permissions,createUserId,lastCommentId,values',
                    query: 'contentType in @pagetype AND name LIKE @search',
                    limit: 50,
                    order: 'lastCommentId_desc',
                },
            ],
        }, (resp) => {
            done();
            const results = searchResultsRef.current;
            results.replaceChildren();
            let first = true;
            for (const item of resp.content) {
                const bar = document.createElement('a');
                bar.append(content_label(item));
                bar.setAttribute('role', 'listitem');
                bar.className += ' bar rem1-5 search-page ellipsis';
                bar.href = Nav.entity_link(item);
                results.append(bar);
                bar.tabIndex = first ? 0 : -1;
                if (first)
                    bar.focus();
                first = false;
            }
        });
    }, []);
    // ---- one-time wiring effects ---------------------------------------------------------------
    // toggle bridge + initial open state + close_fullscreen registration.
    useEffect(() => {
        // sidebar.js:19 — ALWAYS true (a string|null is never boolean false). Cast erases to the exact
        // original expression while satisfying strict comparison typing.
        normalOpen.current = localStorage.getItem('sbs-sidebar') !== false;
        document.documentElement.classList.toggle('f-sidebar', normalOpen.current);
        toggleImpl = toggle;
        setCloseFullscreen(closeFullscreen);
        return () => {
            toggleImpl = null;
            setCloseFullscreen(() => { });
        };
    }, [toggle, closeFullscreen]);
    // tab-select bridges (request.ts log_out → 'user'; images.js → 'file').
    useEffect(() => {
        const sel = (name) => {
            tabsRef.current?.select(name);
        };
        setSidebarTabSelect(sel);
        setImagesSidebarTabSelect(sel);
        return () => {
            setSidebarTabSelect(null);
            setImagesSidebarTabSelect(() => { });
        };
    }, []);
    // activity/watch containers + category tree + initial-message sink (was do_when_ready(Act.init) +
    // Sidebar.display_messages). Registered before pull_recent's async chain resolves (Sidebar mounts
    // before the websocket response), so initial messages render before any live message.
    useEffect(() => {
        if (activityRef.current)
            Act.normal.init(activityRef.current);
        if (watchRef.current)
            Act.watch.init(watchRef.current);
        setCategoriesTarget(catsRef.current);
        setActivityMessageSink((messages, initial) => displayMessages(messages, initial));
        return () => {
            setCategoriesTarget(null);
            setActivityMessageSink(null);
        };
    }, [displayMessages]);
    // print/log console sink (flushes any batches buffered before the Scroller existed).
    useEffect(() => {
        setPrintSink(printSink);
        return () => {
            setPrintSink(null);
        };
    }, [printSink]);
    // sidebar.js:297 init — the 4 permanent Events listeners (Sidebar never unmounts → equivalent).
    useEffect(() => {
        const view = {};
        Events.messages.listen(view, (c) => {
            scrollerRef.current?.lock();
            displayMessages(c);
        });
        Events.after_messages.listen(view, () => {
            scrollerRef.current?.unlock();
        });
        Events.user_edit.listen(view, (user) => {
            if (user.id == Req.uid)
                redrawMyAvatar();
            // userlist.redraw_user(user) is handled by the global <UserList id={0}> below.
        });
        return () => {
            Events.destroy(view);
        };
    }, [displayMessages, redrawMyAvatar]);
    // own-avatar: paint from Req.me if already loaded, then refresh when the me-chain resolves.
    useEffect(() => {
        redrawMyAvatar();
        return onMeAvatar(redrawMyAvatar);
    }, [redrawMyAvatar]);
    // ---- tab defs (sidebar.js:38) --------------------------------------------------------------
    const userLabel = auth ? (_jsx("span", { children: _jsx("img", { ref: myAvatarRef, width: 50, height: 50, className: "item avatar", alt: "\uD83D\uDD27\uFE0F" }) })) : ('log in');
    const tabs = [
        { name: 'activity', label: '✨', panelId: '$sidebarActivityPanel', accesskey: 'a', shadow: true },
        { name: 'watch', label: '🔖', panelId: '$sidebarWatchPanel', shadow: true },
        {
            name: 'search',
            label: '🔍',
            panelId: '$sidebarNavPanel',
            accesskey: 's',
            shadow: true,
            onswitch: () => {
                if (searchInputRef.current) {
                    searchInputRef.current.value = '';
                    searchInputRef.current.focus();
                }
            },
        },
        { name: 'file', label: '📷', panelId: '$sidebarFilePanel', shadow: true },
        { name: 'user', label: userLabel, panelId: '$sidebarUserPanel', shadow: true },
        { name: 'editor', label: null, panelId: '$sidebarEditorPanel', hidden: true },
        { name: 'popup', label: null, panelId: '$sidebarPopupPanel', hidden: true },
    ];
    const tabsSelect = (name) => tabsRef.current?.select(name);
    // Enter (no shift) on the search input → run the search (was View.bind_enter).
    const onSearchKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            doSearch();
        }
    };
    const onLogin = (ev) => {
        ev.preventDefault();
        const form = ev.currentTarget;
        const username = form.elements.namedItem('username').value;
        const password = form.elements.namedItem('password').value;
        const long = form.elements.namedItem('long').checked;
        Req.get_auth(username, password, long).do = (resp, err) => {
            if (err) {
                alert('❌ logging in failed\n' + err);
            }
            else {
                // resp is the raw token string (User/login has no proc); ApiDone types it as ListMap.
                Req.save_auth(resp);
                alert('✅ logged in!');
                RELOAD(); // was Nav.reload() (an alias of RELOAD)
            }
        };
    };
    // index.html:286 "Inspect (click element)" — arm a click listener that prints the clicked
    // element. The original's `{once:true}` was mis-nested (a comma expression), so the listener was
    // actually persistent; we pass it correctly for the labeled one-shot intent (dev-only tool).
    const onInspect = () => {
        window.setTimeout(() => document.addEventListener('click', (ev) => print(ev.target.outerHTML || ev.target), { once: true }));
    };
    return (_jsxs("sidebar-container", { id: "$sidebar", className: "sized resize-box sidebar-element COL", ref: containerRef, children: [_jsx("button", { className: "toggle-sidebar", id: "$closeSidebar", onClick: () => toggle(), children: "Close Sidebar" }), _jsx(UserList, { id: 0, className: "userlist", style: BAR_HEIGHT_STYLE }), _jsx(Tabs, { ref: tabsRef, name: "sidebar", id: "$sidebar_tabs", "aria-label": "sidebar tabs", tabs: tabs, initial: auth ? 'activity' : 'user' }), _jsxs("div", { id: "$sidebarTop", className: "sized SLIDES", ref: topRef, children: [_jsx("div", { id: "$sidebarActivityPanel", children: _jsx("scroll-outer", { id: "$sidebarActivity", className: "activity-scroller", tabIndex: -1, style: { paddingTop: '3px' }, ref: activityRef }) }), _jsx("div", { id: "$sidebarWatchPanel", children: _jsx("scroll-outer", { id: "$sidebarWatch", className: "activity-scroller", tabIndex: -1, ref: watchRef }) }), _jsxs("div", { id: "$sidebarNavPanel", tabIndex: -1, style: { overflowY: 'scroll' }, children: [_jsxs("div", { className: "rem1-5 ROW", children: [_jsx("input", { className: "FILL item", id: "$searchInput", ref: searchInputRef, onKeyDown: onSearchKey }), _jsx("button", { id: "$searchButton", className: "item", ref: searchButtonRef, onClick: doSearch, children: "Search" })] }), _jsx("div", { id: "$searchResults", role: "list", ref: searchResultsRef }), _jsxs("div", { className: "ROW", style: { justifyContent: 'space-around' }, children: [_jsx("span", { children: "\uD83D\uDC08\uFE0E" }), _jsx("span", { children: "\uD83D\uDC08\uFE0E" }), _jsx("span", { children: "\uD83D\uDC08\uFE0E" }), _jsx("span", { children: "\uD83D\uDC08\uFE0E" }), _jsx("span", { children: "\uD83D\uDC08\uFE0E" })] }), _jsx("div", { id: "$sidebarCategories", role: "list", ref: catsRef })] }), _jsx(FilePanel, { selectTab: tabsSelect, closeFullscreen: closeFullscreen }), _jsxs("div", { id: "$sidebarUserPanel", className: "COL", children: [_jsxs("div", { className: "registerBox", children: [_jsx("button", { onClick: () => RELOAD(), children: "Reload" }), _jsx("button", { onClick: () => Lp.start_websocket(true), children: "Reset Socket" }), _jsx("button", { id: "$logOut", style: { float: 'right' }, onClick: () => Req.log_out(), children: "Log out" })] }), _jsxs("div", { className: "loggedOut registerBox", children: [_jsxs("h2", { children: ["Log In", _jsx("span", { id: "$login_server_url", children: Req.server_url != 'https://qcs.shsbs.xyz' ? ' ⚠️ to server: ' + Req.server_url : '' })] }), _jsxs("form", { id: "$loginForm", method: "dialog", onSubmit: onLogin, children: [_jsx("input", { placeholder: "Username", name: "username" }), _jsx("br", {}), _jsx(PasswordInput, { name: "password" }), _jsx("br", {}), _jsxs("div", { className: "ROW", style: { alignItems: 'center' }, children: [_jsx("button", { children: "Log In" }), _jsxs("label", { style: { display: 'contents' }, children: ["\u00A0\u2014\u00A0forever:\u00A0", _jsx("input", { type: "checkbox", name: "long" })] })] })] }), _jsx("div", { id: "$loginError" })] }), auth ? _jsx(SettingsForm, { selectTab: tabsSelect, output: output }) : null, _jsx(DebugPanel, {}), _jsx("div", { className: "registerBox", children: _jsx("button", { onClick: onInspect, children: "Inspect (click element)" }) })] }), _jsx("div", { id: "$sidebarPopupPanel", className: "COL" }), _jsx("div", { id: "$sidebarEditorPanel", className: "COL" })] }), _jsx("resize-handle", { id: "$sidebarResize", ref: panelHandleRef }), _jsx("div", { className: "FILL", id: "$sidebarBottom", children: _jsx(ScrollerHost, { onReady: (s) => {
                        scrollerRef.current = s;
                    } }) })] }));
}
