import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// L7a — PageView (ports src/Views/page.js; ARCHITECTURE §6/§8/§10/§11, L7 views).
//
// The content markup body (or file image) + watch checkbox + per-page userlist + live chat
// (MessageList island inside a Scroller island) + composer (send / edit / reply / delete /
// slash-commands / pinned / load-older) + resizable content/chat divider.
//
// Fragile state (the linked-list MessageList, the Scroller math, the presence StatusDisplay) lives
// in the imperative islands/components (ScrollerHost, MessageListView, UserList) exactly as the
// architecture prescribes — React only mounts empty containers. Everything page.js kept as instance
// fields that are READ synchronously by imperative handlers (editing / replying_to / pre_edit / the
// live scroller + list instances) is kept in refs here so a re-render can never stale-close them;
// only `infoMessage` (the MessageInfo selection, which is set-only, never read imperatively) is
// React state. The <view-root> base class + the f-editing / f-replying flags are managed
// imperatively (BaseView.Flag) so a re-render can't clobber them.
import { useLayoutEffect, useRef, useState } from 'react';
import { Entity, CODES, Author } from '../data/entity';
import { Req } from '../services/request';
import { Lp } from '../services/socket';
import { Settings } from '../services/settings';
import { Edit } from '../services/edit';
import { avatar_url } from '../services/draw';
import { ResizeTracker } from '../services/scroller';
import { MessageList } from '../services/message-list';
import { StatusDisplay } from '../services/status-display';
import { Apx } from '../services/apx';
import { print } from '../services/sidebar-log';
import { Nav, setActiveEditor } from '../services/nav';
import { register } from '../routing/view-registry';
import { ScrollerHost } from '../islands/ScrollerHost';
import { MessageListView } from '../islands/MessageListView';
import { MarkupContent } from '../islands/MarkupContent';
import { UserList } from '../components/UserList';
import { MessageInfo } from '../components/MessageInfo';
import { UserLabel } from '../components/UserLabel';
import { TimeAgo } from '../components/TimeAgo';
import { showInSidebar } from '../components/FilePanel';
import { useResizable } from '../hooks/useResizable';
// page.js:506 — `PageView.track_resize_2 = new ResizeTracker('width')`. A single tracker shared by
// every PageView instance (a class static → module singleton).
const track_resize_2 = new ResizeTracker('width');
// page.js Destroy/Init — `View.lost`: the stashed unsent textarea text that survives a same-page
// reload. Per ARCHITECTURE §6 it lives at module scope in the view module.
let lost;
// Markup `etc` forwarded by reference to MarkupContent — page.js passed
// `{intersection_observer: View.observer}` and View.observer is always null (§8.2/§12). A module
// const keeps the reference maximally stable so MarkupContent never re-converts.
const MARKUP_ETC = { intersection_observer: null };
// navigate.js:66 ViewSlot.add_header_links built each anchor as
// `<a href target><span class=text-shadow>{icon}</span><span>{label}</span></a>`. The frozen
// SlotHeaderApi now takes prebuilt Nodes, so the view builds them.
function header_link(icon, label, href, target) {
    const a = document.createElement('a');
    a.href = href;
    a.target = target || '_self';
    const lb = document.createElement('span');
    lb.textContent = label;
    a.append(lb);
    if (icon) {
        const ic = document.createElement('span');
        ic.className = 'text-shadow';
        ic.append(icon);
        a.prepend(ic);
    }
    return a;
}
// draw.js:226-233 Draw.event_lock — disable the target element until `done()` is called, so a
// double-click can't fire the async action twice.
function event_lock(cb) {
    return (ev) => {
        const elem = ev.currentTarget;
        if (elem.disabled)
            return;
        elem.disabled = true;
        cb(() => {
            elem.disabled = false;
        }, elem);
    };
}
// page.js:12 PageView.Start — the content/pinned/messages/replies/users/watch chain.
function Start(loc) {
    const id = loc.id;
    const field = typeof id === 'number' ? 'id' : 'hash';
    if (field === 'id')
        StatusDisplay.prepare(id);
    return {
        chain: {
            values: { key: id },
            requests: [
                { type: 'content', fields: '*', query: `${field} = @key` },
                { name: 'Pcontent', type: 'content', fields: '*', query: 'id = @content.parentId' },
                {
                    type: 'message',
                    fields: '*',
                    query: 'contentId IN @content.id AND !notdeleted()',
                    order: 'id_desc',
                    limit: 30,
                },
                {
                    name: 'replies',
                    type: 'message',
                    fields: '*',
                    query: 'id in @message.values.replyingTo AND id NOT IN @message.id',
                },
                { name: 'Mpinned', type: 'message', fields: '*', query: 'id IN @content.values.pinned' },
                {
                    type: 'user',
                    fields: '*',
                    query: 'id IN @content.createUserId OR id IN @message.createUserId OR id IN @message.editUserId OR id IN @Mpinned.createUserId OR id IN @Mpinned.editUserId OR id IN @replies.createUserId',
                },
                { type: 'watch', fields: '*', query: 'contentId IN @content.id' },
            ],
        },
        check: (resp) => resp.content[0],
    };
}
function PageView({ data, header }) {
    // page.js:123 Render destructure
    const page = data.content[0];
    const page_id = page.id;
    const messages = data.message;
    const pinned = data.Mpinned;
    const users = data.user;
    const watchList = data.watch;
    const parent = data.Pcontent ? data.Pcontent[0] : undefined;
    const author = users[~page.createUserId];
    const isFile = page.contentType === CODES.InternalContentType.file;
    // ---- refs: DOM ----
    const rootRef = useRef(null);
    const textareaRef = useRef(null);
    const textareaContainerRef = useRef(null);
    const markupRef = useRef(null);
    const watchingRef = useRef(null);
    const limitCheckboxRef = useRef(null);
    const extraRef = useRef(null);
    const replyAvatarRef = useRef(null);
    const replyNameRef = useRef(null);
    const replyTextRef = useRef(null);
    // ---- refs: imperative instances / fields (page.js instance fields) ----
    const scrollerRef = useRef(null);
    const listRef = useRef(null);
    const pinnedListRef = useRef(null);
    const editingRef = useRef(null);
    const replyingToRef = useRef(null);
    const preEditRef = useRef(null);
    const preEditReplyingToRef = useRef(null);
    // ---- state: MessageInfo selection (set-only; the only React state) ----
    const [infoMessage, setInfoMessage] = useState(null);
    // resizable content/chat divider (page.js:191 `new ResizeBar($page_container, $resize_handle,
    // 'top', 'setting--divider-pos-'+page_id, null)`).
    const { containerRef: pageContainerRef, handleRef: resizeHandleRef } = useResizable('setting--divider-pos-' + page_id, { side: 'top', default: null });
    // page.js:285 Insert_Text — cross-view file insertion target (active-editor registry).
    const insert_text = (text) => {
        Edit.insert(textareaRef.current, text);
    };
    // Registered on textarea focus; kept until unmount (NOT cleared on blur) so the sidebar FilePanel
    // — which the user must click, blurring the textarea — still targets this view, matching the
    // original's last-focused-slot `Nav.focused.view` semantics.
    const editorHandle = useRef(null);
    if (!editorHandle.current)
        editorHandle.current = { Insert_Text: insert_text };
    // view.js:58 BaseView.Flag
    const flag = (name, state) => {
        rootRef.current?.classList.toggle('f-' + name, state);
    };
    // page.js:43 enter_submits
    const enter_submits = () => !['newline', 'newline, strip trailing'].includes(Settings.values.chat_enter);
    // page.js:330 textarea_resize
    const textarea_resize = () => {
        const ta = textareaRef.current;
        ta.style.height = '10px';
        let height = ta.scrollHeight;
        const dpr = window.devicePixelRatio;
        height = Math.ceil(height / dpr + 1) * dpr;
        textareaContainerRef.current.style.height = `${height}px`;
        ta.style.height = '100%';
    };
    // page.js:289 my_last_message
    const my_last_message = () => {
        const list = listRef.current;
        if (!list)
            return null;
        const sentinel = list;
        let cnt = 0;
        for (let node = sentinel.prev; node !== sentinel; node = node.prev) {
            if (cnt++ > 100)
                break;
            if (node.data.createUserId == Req.uid)
                return node.data;
        }
        return null;
    };
    // page.js:408 read_input
    const read_input = (data = null) => {
        let d;
        // editing
        if (data) {
            d = data;
            if (markupRef.current.value)
                d.values.m = markupRef.current.value;
            else
                delete d.values.m;
        }
        else {
            // new message
            d = { values: {}, contentId: page_id, text: null };
            const sv = Settings.values;
            if (sv.avatar)
                d.values.a = sv.avatar;
            else if (Req.me)
                d.values.a = Req.me.avatar;
            if (sv.nickname)
                d.values.n = Author.filter_nickname(sv.nickname);
            if (sv.big_avatar == 'on' && sv.big_avatar_id)
                d.values.big = sv.big_avatar_id;
            if (sv.avatar_pixel == 'on')
                d.values.apx = true;
            d.values.m = sv.chat_markup;
        }
        if (replyingToRef.current)
            d.values.replyingTo = replyingToRef.current.id;
        else
            delete d.values.replyingTo;
        d.text = textareaRef.current.value;
        if (['submit, strip trailing', 'newline, strip trailing'].includes(Settings.values.chat_enter) &&
            d.text.endsWith('\n'))
            d.text = d.text.slice(0, -1);
        return d;
    };
    // page.js:442 write_input
    const write_input = (data) => {
        const text = data.text;
        if (['submit, strip trailing', 'newline, strip trailing'].includes(Settings.values.chat_enter) &&
            data.text.endsWith('\n'))
            data.text += '\n';
        Edit.set(textareaRef.current, text);
        textarea_resize();
        if (editingRef.current) {
            let markup = data.values.m;
            if ('string' != typeof markup)
                markup = '';
            markupRef.current.value = markup;
        }
    };
    // page.js:489 reply_to_comment
    const reply_to_comment = (comment = null) => {
        if (!comment) {
            if (replyingToRef.current) {
                replyTextRef.current.textContent = '';
                replyingToRef.current = null;
                flag('replying', false);
            }
            return;
        }
        replyingToRef.current = comment;
        replyAvatarRef.current.src = avatar_url(comment.Author);
        replyNameRef.current.textContent = comment.Author.username;
        replyTextRef.current.textContent = comment.text.replace(/\n/g, '  ');
        flag('replying', true);
    };
    // page.js:457 edit_comment
    const edit_comment = (comment = null) => {
        if (!comment) {
            if (editingRef.current) {
                editingRef.current = null;
                write_input(preEditRef.current);
                flag('editing', false);
                if (replyingToRef.current)
                    reply_to_comment(preEditReplyingToRef.current);
            }
            return;
        }
        if (!editingRef.current) {
            preEditRef.current = read_input();
            preEditReplyingToRef.current = replyingToRef.current;
        }
        editingRef.current = comment;
        if (comment.values.replyingTo) {
            listRef.current.get_reply_message(comment.values.replyingTo).then((msg) => {
                reply_to_comment(msg);
            });
        }
        flag('editing', true);
        // do this after the flag, so the width is right
        write_input(comment);
        window.setTimeout(() => {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(99999, 99999); // move cursor to end
        });
    };
    // page.js:339 send_message
    const send_message = () => {
        const old_text = editingRef.current && editingRef.current.text;
        const data = read_input(editingRef.current);
        // empty input
        if (!data.text) {
            // delete message, if in edit mode
            if (!editingRef.current)
                return;
            const ok = confirm('Are you sure you want to delete this message?\n' + old_text);
            if (!ok)
                return;
            Req.delete('message', data.id).do = (_resp, err) => {
                if (err)
                    alert('Deleting comment failed');
            };
        }
        else {
            // create/edit message
            const match = /^[/][/](\w+) ?/.exec(data.text);
            if (!editingRef.current && match) {
                const [full, command] = match;
                const args = data.text.slice(full.length);
                if (command == 'help') {
                    Req.search_modules().do = (resp, err) => {
                        if (err) {
                            alert('Searching for modules failed');
                            return;
                        }
                        // build up a list of commands to present
                        let outputMessage = '⚙️ Commands Available:\n';
                        resp.forEach((command) => {
                            Object.entries(command.subcommands).forEach(([subname, subcommand]) => {
                                outputMessage += `/${command.name} `;
                                if (subname)
                                    outputMessage += subname + ' ';
                                outputMessage += subcommand.arguments.map((argument) => `<${argument.name}>`).join(' ');
                                if (subcommand['description'])
                                    outputMessage += ' - ' + subcommand.description;
                                outputMessage += '\n';
                            });
                        });
                        print(outputMessage);
                    };
                }
                else {
                    Req.send_module_message(command, data.contentId, args).do = (_resp, err) => {
                        if (err)
                            print('Posting module failed');
                    };
                }
            }
            else {
                Req.send_message(data).do = (_resp, err) => {
                    if (err)
                        alert('Posting failed');
                };
            }
        }
        if (replyingToRef.current)
            reply_to_comment(null);
        // reset input
        if (editingRef.current)
            edit_comment(null);
        else {
            Edit.clear(textareaRef.current);
            textarea_resize();
        }
    };
    // page.js:303 display_live — bracket the printed batch with before_print / after_print so the
    // Scroller can smooth-scroll only when something new lands at the end.
    const display_live = (comments) => {
        const list = listRef.current;
        const scroller = scrollerRef.current;
        if (list.over_limit() && !limitCheckboxRef.current.checked) {
            scroller.print_top(() => {
                list.limit_messages();
            });
        }
        let last_new = null;
        let x = null;
        let cb = () => {
            cb = null;
            x = scroller.before_print(true);
        };
        for (const msg of comments) {
            if (list.display_live(msg, cb))
                last_new = msg;
        }
        if (x == null)
            return; // nothing printed
        scroller.after_print(x);
        if (last_new) {
            // page.js:327 View.comment_notification(last_new) — the title/favicon notification module is
            // not ported (ARCHITECTURE SlotHeaderContext note: no notification/favicon module in scope),
            // so the tab-title flash is intentionally omitted here.
        }
    };
    // page.js:202 update_pinned — a second, separate MessageList prepended above the load-older
    // controls, via the Scroller's print_top so it can't jump the scroll position.
    const update_pinned = () => {
        Entity.link_comments({ message: pinned, user: users });
        const listEl = document.createElement('message-list');
        pinnedListRef.current = new MessageList(listEl, page_id);
        const separator = document.createElement('div');
        separator.className = 'messageGap';
        scrollerRef.current.print_top(() => {
            extraRef.current.prepend(separator);
            extraRef.current.prepend(listEl);
            for (const msg of pinned)
                pinnedListRef.current.display_edge(msg);
        });
    };
    // ---- island onReady handlers ----
    const onScrollerReady = (s) => {
        scrollerRef.current = s;
    };
    // page.js:151/165-166 — stash the list, then display the initial (id_desc) batch oldest-first.
    const onListReady = (l) => {
        listRef.current = l;
        for (let i = messages.length - 1; i >= 0; i--)
            l.display_edge(messages[i]);
    };
    // Events.messages fires (comments, message_event); page.js closed over just `comments`.
    const onLiveMessages = (...args) => {
        display_live(args[0]);
    };
    // page.js:172 Events.after_messages → scroller.unlock()
    const onAfterMessages = () => {
        scrollerRef.current?.unlock();
    };
    // ---- JSX event handlers ----
    const onWatchChange = event_lock((done) => {
        Req.set_watch(page_id, watchingRef.current.checked).do = () => {
            done();
        };
    });
    const onLoadOlder = event_lock((done) => {
        listRef.current.load_messages_near(true, 50, () => {
            done();
        });
    });
    const onContainerKeyDown = (ev) => {
        if (ev.nativeEvent.isComposing)
            return;
        // enter - send
        if (ev.key === 'Enter' && !ev.shiftKey && enter_submits()) {
            ev.preventDefault();
            send_message();
        }
        // up arrow - edit previous message
        if (ev.key === 'ArrowUp' && textareaRef.current.value === '') {
            const comment = my_last_message();
            if (comment) {
                ev.preventDefault();
                edit_comment(comment);
            }
        }
    };
    const onRootKeyDown = (ev) => {
        if (ev.key === 'Escape') {
            edit_comment(null);
            reply_to_comment(null);
            setInfoMessage(null);
        }
    };
    const onSetAvatar = () => {
        Req.me.avatar = page.hash;
        Req.write(Req.me).do = (_resp, err) => {
            if (!err)
                print('set avatar');
            else
                alert('edit failed');
        };
    };
    const onShowInSidebar = () => {
        showInSidebar(page);
        // page.js:253 also did `Sidebar.tabs.select('file')`; no L7-accessible sidebar-tab-select
        // bridge exists (Sidebar is L8), so the tab is not auto-selected here.
    };
    // ---- mount lifecycle (Init + Render + Visible + Destroy), imperative + run once ----
    useLayoutEffect(() => {
        const root = rootRef.current;
        const textarea = textareaRef.current;
        const container = textareaContainerRef.current;
        // Set the template's base classes imperatively so a re-render can't clobber the f-editing /
        // f-replying flags toggled by edit_comment / reply_to_comment.
        root.className = 'COL resize-box';
        // Init: restore stashed unsent text.
        if (lost != null)
            textarea.value = lost;
        // Render: header (title + links)
        header.set_entity_title(page);
        header.add_header_links(header_link('📜️', 'logs', '#comments/' + page.id + '?r'), header_link('✏️', 'edit', '#editpage/' + page.id), header_link('🗂️', 'childs', '#category/' + page.id));
        if (Req.server_url === 'https://qcs.shsbs.xyz') {
            let href;
            if (page.values.share)
                href = `${Req.server_url}/share/${page.hash}`;
            else if (parent && parent.values.share && parent.literalType === 'resource')
                href = `${Req.server_url}/share/${parent.hash}/${page.hash}`;
            if (href)
                header.add_header_links(header_link('🌐', 'blog', href, '_blank'));
        }
        // Render: merge chain users into Lp.users (before UserList's StatusDisplay redraws — its
        // useEffect runs after this layout effect), set the watch checkbox.
        Object.assign(Lp.users, users);
        watchingRef.current.checked = !!watchList[0];
        // Render: pinned messages (needs both the Scroller and the list islands, whose child layout
        // effects have already run by the time this parent layout effect fires).
        if (pinned instanceof Array && pinned.length)
            update_pinned();
        // Init: message_control events bubble here from the MessageList controls, the MessageInfo
        // buttons, and the reply-info button.
        const on_mce = (e) => {
            const ce = e;
            const action = ce.detail.action;
            const d = ce.detail.data;
            if (action == 'info') {
                e.stopPropagation();
                setInfoMessage(d);
            }
            if (action == 'edit') {
                e.stopPropagation();
                edit_comment(d);
            }
            if (action == 'reply') {
                e.stopPropagation();
                reply_to_comment(d);
                textarea.focus();
            }
            if (action == 'link') {
                e.stopPropagation();
                insert_text(`sbs:comments?ids=${d.id}`);
            }
        };
        root.addEventListener('message_control', on_mce);
        // Init: textarea autosize on input + on width change.
        const r = () => textarea_resize();
        container.addEventListener('input', r, { passive: true });
        track_resize_2.add(container, () => {
            window.setTimeout(r);
        });
        // Render: gate the composer on create permission, focus if allowed.
        const can_talk = Entity.user_has_perm(page.permissions, Req.me, 'C');
        textarea.disabled = !can_talk;
        if (can_talk)
            textarea.focus();
        // Visible
        textarea_resize();
        scrollerRef.current.scroll_instant();
        return () => {
            // Destroy: stash unsent text; detach this instance's listeners. (Scroller/UserList release
            // themselves via their own islands.)
            lost = textarea.value;
            track_resize_2.remove(container);
            container.removeEventListener('input', r);
            root.removeEventListener('message_control', on_mce);
            if (Nav.view() === editorHandle.current)
                setActiveEditor(null);
        };
        // Run exactly once on mount — every dependency is a first-render-stable value/ref.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // page.js:228 file image, else the markup body.
    let imgWidth;
    let imgHeight;
    if (isFile && page.meta) {
        const meta = JSON.parse(page.meta);
        if (meta.width) {
            imgWidth = meta.width;
            imgHeight = meta.height;
        }
    }
    return (_jsxs("view-root", { ref: rootRef, onKeyDown: onRootKeyDown, children: [_jsxs("scroll-outer", { ref: pageContainerRef, className: "page-container sized", children: [_jsxs("div", { className: "pageInfoPane bar rem1-5 ROW", children: [_jsxs("label", { children: ["Watching: ", _jsx("input", { type: "checkbox", ref: watchingRef, onChange: onWatchChange })] }), _jsx("span", { style: { margin: '0 0.5rem' }, children: author && _jsx(UserLabel, { user: author }) }), _jsxs("span", { children: ["Created: ", _jsx(TimeAgo, { time: page.createDate2 })] })] }), isFile ? (_jsxs("div", { className: "pageContents", children: [_jsx("button", { onClick: onSetAvatar, children: "Set Avatar" }), _jsx("button", { onClick: onShowInSidebar, children: "Show in sidebar" }), _jsx("img", { className: "file-page-image", width: imgWidth, height: imgHeight, alt: page.description, src: Req.image_url(page.hash) }), _jsx("pre", { children: JSON.stringify(page, null, 1) })] })) : (_jsx(MarkupContent, { tag: "div", className: "pageContents", text: page.text, lang: page.values.markupLang, etc: MARKUP_ETC }))] }), _jsx("resize-handle", { ref: resizeHandleRef, className: "userlist2", style: { '--bar-height': '2.4375rem' }, children: _jsx(UserList, { id: page_id, status: "viewing" }) }), _jsxs(ScrollerHost, { className: "FILL", onReady: onScrollerReady, children: [_jsxs("div", { ref: extraRef, children: [_jsx("button", { onClick: onLoadOlder, children: "load older messages" }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", ref: limitCheckboxRef }), "disable limit"] })] }), _jsx(MessageListView, { pageId: page_id, onReady: onListReady, onMessages: onLiveMessages, onAfterMessages: onAfterMessages }), _jsx("div", { className: "chat-bottom", tabIndex: 0 })] }), _jsxs("div", { children: [_jsx("div", { className: "inputPane", children: _jsx(MessageInfo, { selected: infoMessage, onClose: () => setInfoMessage(null) }) }), _jsxs("div", { className: "ROW inputPane replyPane", children: [_jsx("button", { onClick: () => {
                                    reply_to_comment(null);
                                    textareaRef.current.focus();
                                }, children: "\u00D7" }), _jsx("button", { onClick: () => MessageList.send_mce('info', replyingToRef.current, rootRef.current), children: "\u2699\uFE0F" }), _jsxs("div", { className: "FILL bar ellipsis", style: {
                                    '--bar-height': '1rem',
                                    alignSelf: 'center',
                                    contain: 'strict',
                                    fontSize: '0.8em',
                                    marginLeft: '0.5em',
                                }, children: ["\u2934\uFE0F ", _jsx("b", { children: "Replying to" }), ' ', _jsxs("span", { className: "user-label", children: [_jsx("img", { className: "item avatar", ref: replyAvatarRef }), _jsx("span", { className: "entity-title pre", ref: replyNameRef })] }), ": ", _jsx("span", { className: "pre", ref: replyTextRef })] })] }), _jsxs("div", { className: "inputPane ROW", children: [_jsxs("div", { className: "chat-edit-controls COL", children: [_jsx("input", { ref: markupRef, placeholder: "markup", style: { width: '50px' } }), _jsx("button", { className: "FILL", onClick: () => edit_comment(null), children: "Cancel" })] }), _jsxs("div", { className: "chat-controls-extra COL", style: { justifyContent: 'end' }, children: [_jsx("button", { style: { padding: '0 2px' }, onClick: () => Edit.exec(textareaRef.current, 'redo'), children: "\u21B7" }), _jsx("button", { style: { padding: '0 2px' }, onClick: () => Edit.exec(textareaRef.current, 'undo'), children: "\u21B6" })] }), _jsx("textarea-container", { className: "FILL", ref: textareaContainerRef, onKeyDown: onContainerKeyDown, children: _jsx("textarea", { className: "chatTextarea", ref: textareaRef, accessKey: "z", enterKeyHint: enter_submits() ? 'send' : 'enter', onFocus: () => setActiveEditor(editorHandle.current) }) }), _jsxs("div", { className: "COL", children: ["(temp)", _jsx("button", { className: "FILL", onClick: () => send_message(), children: "Send" })] })] })] })] }));
}
// page.js:559 View.register('page', PageView) + View.register('pages', {Redirect})
register('page', { Start, Component: PageView });
register('pages', {
    Redirect(location) {
        location.type = 'page';
    },
});
// page.js:564-614 — the chat-related Settings, registered as import side effects (init order =
// registration order). The commented-out big_avatar / big_avatar_id fields stay commented.
Settings.add({ name: 'nickname', label: 'Chat Nickname', type: 'text', order: -9000 });
Settings.add({
    name: 'chat_markup',
    label: 'Chat Markup',
    type: 'select',
    options: ['12y2', '12y', 'plaintext'],
    order: -8000,
});
Settings.add({ name: 'avatar', label: 'Device Avatar', type: 'text', order: -7000 });
Settings.add({
    name: 'avatar_pixel',
    label: 'Pixelate My Avatar',
    type: 'select',
    options: ['off', 'on'],
    order: -6000,
});
Settings.add({
    name: 'pixel_art',
    label: 'Display Pixel Avatars',
    type: 'select',
    options: ['on', 'off'],
    default: 'off',
    order: -5000,
    update(value) {
        if (value == 'on')
            Apx.start();
        else {
            Apx.stop();
            for (const img of document.querySelectorAll('.apx')) {
                img.classList.remove('pixelAvatar');
                img.style.width = '';
                img.style.height = '';
            }
        }
    },
});
Settings.add({
    name: 'chat_enter',
    label: 'Chat Enter Key',
    type: 'select',
    options: ['submit', 'newline', 'submit, strip trailing', 'newline, strip trailing'],
});
export { PageView };
