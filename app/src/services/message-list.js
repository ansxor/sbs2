import { Req } from './request';
import { Lp } from './socket';
import { convert } from './markup';
import { avatar_url, time_string, censorSpoilerText, recalc_image_scale } from './draw';
import { Settings } from './settings';
// messages.js:3 — spoiler-preview censor. Called via "".startsWith.call(text,…) to tolerate a
// non-string; the `$1` in the replacement string IS the capture group ((\[.*?\])? = the optional
// [..] arg), and the rest of the text after the \h[..] prefix is dropped.
export { censorSpoilerText };
// ---------------------------------------------------------------------------------------
// Templates. The original used the `𐀶` tagged-template (parse HTML, collapse newline
// whitespace, return a fresh-clone factory). Each is inlined as createElement with byte-identical
// tags / attributes / interspersed text nodes so the downstream `.children`/`.firstChild`/
// `.lastElementChild` walks resolve to the exact same nodes.
// ---------------------------------------------------------------------------------------
// 𐀶`<message-part role=listitem><div></div></message-part>`
function tmpl_part() {
    const e = document.createElement('message-part');
    e.setAttribute('role', 'listitem');
    e.appendChild(document.createElement('div'));
    return e;
}
// 𐀶`<reply-block class='bar ellipsis'>⤴️ <b>Reply to</b>&#32;<a><img class='item avatar'>
//    <span class='entity-title pre'></span>: <span>Loading...</span></a></reply-block>`
function tmpl_reply() {
    const rb = document.createElement('reply-block');
    rb.className = 'bar ellipsis';
    rb.append('⤴️ ');
    const b = document.createElement('b');
    b.append('Reply to');
    rb.append(b);
    rb.append(' '); // &#32;
    const a = document.createElement('a');
    const img = document.createElement('img');
    img.className = 'item avatar';
    a.append(img);
    a.append(' ');
    const s1 = document.createElement('span');
    s1.className = 'entity-title pre';
    a.append(s1);
    a.append(': ');
    const s2 = document.createElement('span');
    s2.append('Loading...');
    a.append(s2);
    rb.append(a);
    return rb;
}
// 𐀶`<message-block><message-header><span><b class='pre'></b>:</span>
//    <span role=time></span></message-header><div></div></message-block>`
function tmpl_block() {
    const e = document.createElement('message-block');
    const header = document.createElement('message-header');
    const nameSpan = document.createElement('span');
    const b = document.createElement('b');
    b.className = 'pre';
    nameSpan.append(b);
    nameSpan.append(':');
    header.append(nameSpan);
    const timeSpan = document.createElement('span');
    timeSpan.setAttribute('role', 'time');
    header.append(timeSpan);
    e.append(header);
    e.append(document.createElement('div'));
    return e;
}
// 𐀶` <i>(<span class='pre'></span>)</i>` — leading space → a DocumentFragment [" ", <i>].
function tmpl_nickname() {
    const f = document.createDocumentFragment();
    f.append(' ');
    const i = document.createElement('i');
    i.append('(');
    const s = document.createElement('span');
    s.className = 'pre';
    i.append(s);
    i.append(')');
    f.append(i);
    return f;
}
// 𐀶` <i>[discord bridge]</i>` → DocumentFragment [" ", <i>].
function tmpl_bridge() {
    const f = document.createDocumentFragment();
    f.append(' ');
    const i = document.createElement('i');
    i.append('[discord bridge]');
    f.append(i);
    return f;
}
// 𐀶` <i><img class='avatar module-avatar' width=50 height=50> <span class='pre'></span></i>`
function tmpl_module() {
    const f = document.createDocumentFragment();
    f.append(' ');
    const i = document.createElement('i');
    const img = document.createElement('img');
    img.className = 'avatar module-avatar';
    img.setAttribute('width', '50');
    img.setAttribute('height', '50');
    i.append(img);
    i.append(' ');
    const s = document.createElement('span');
    s.className = 'pre';
    i.append(s);
    f.append(i);
    return f;
}
// 𐀶`<img class='avatar' width=50 height=50 alt="----">`
function tmpl_avatar() {
    const img = document.createElement('img');
    img.className = 'avatar';
    img.setAttribute('width', '50');
    img.setAttribute('height', '50');
    img.setAttribute('alt', '----');
    return img;
}
// 𐀶`<span class='module-name'></span>`
function tmpl_module_name() {
    const s = document.createElement('span');
    s.className = 'module-name';
    return s;
}
export class MessageList {
    constructor(element, pid, _edit) {
        Object.defineProperty(this, "$list", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pid", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "parts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // `this` is a node in the linked list! (top = this.next, bottom = this.prev)
        Object.defineProperty(this, "next", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "prev", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "max_parts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 500
        });
        this.$list = element;
        this.$list.classList.add('message-list'); // todo: just create a new elem <message-list> ?
        this.pid = pid;
        this.parts = new Map();
        // top, bottom
        this.next = this.prev = this;
        // this listens for events created by the message edit/info buttons
        // and modifies the event to add the message data
        this.$list.addEventListener('message_control', (ev) => {
            const part = this.parts.get(+ev.target.dataset.id);
            if (part)
                ev.detail.data = part.data; // eeehehe
        }, { capture: true });
        Object.seal(this);
    }
    check_merge(top, bottom) {
        if (top.Author.merge_hash == bottom.Author.merge_hash)
            if (Math.abs(bottom.Author.date.getTime() - top.Author.date.getTime()) <= 1e3 * 60 * 5)
                return true;
        return false;
    }
    remove(part) {
        if (part == this)
            throw new TypeError('tried to remove list terminator');
        const p = part;
        const { prev, next, elem, data: { id }, } = p;
        // remove from map
        this.parts.delete(id);
        // update linked list
        prev.next = next;
        next.prev = prev;
        // remove element
        if (elem == MessageList.controls_message)
            MessageList.show_controls(null);
        if (elem.nextSibling || elem.previousSibling) {
            elem.remove();
        }
        else {
            // remove the message block
            ;
            elem.parentNode.parentNode.remove();
            // was first or last message block
            if (next == this || prev == this)
                return;
            // merge surrounding blocks, if needed
            if (this.check_merge(prev.data, next.data)) {
                const die = next.elem.parentNode;
                prev.elem.parentNode.append(...die.childNodes);
                die.parentNode.remove();
            }
        }
    }
    get_reply_message(id) {
        return new Promise((resolve, reject) => {
            const replyMessage = this.parts.get(id);
            if (replyMessage) {
                resolve(replyMessage.data);
                return;
            }
            // here's to hoping that it captures the element in the closure during a promise...
            Req.chain({
                values: {
                    key: id,
                },
                requests: [
                    { type: 'message', fields: '*', query: 'id = @key' },
                    { type: 'user', fields: '*', query: 'id in @message.createUserId' },
                ],
            }).do = (resp, err) => {
                if (err) {
                    reject(err);
                }
                resolve(resp.message[~id]);
            };
        });
    }
    // msg: Message being replied to
    // target: reply block link
    draw_reply_block(target, msg) {
        const [avatar, name, content] = target.children;
        if (!msg) {
            ;
            content.textContent = 'Not Available';
            return;
        }
        ;
        target.href = `#comments?ids=${msg.id}`;
        avatar.src = avatar_url(msg.Author);
        const text = censorSpoilerText(msg.text);
        name.textContent = msg.Author.username;
        content.textContent = text;
    }
    // draw a message
    // msg: Message
    // return: Element
    draw_part(msg) {
        const e = tmpl_part();
        e.dataset.id = String(msg.id);
        if (msg.edited)
            e.className += ' edited';
        if (msg.module !== null && msg.uidsInText.length > 0)
            msg.LinkedUsers.forEach((user) => {
                msg.text = msg.text.replace(new RegExp(`%${user.id}%`, 'g'), user.username);
            });
        convert(msg.text, msg.values.m, e.firstElementChild, {
            intersection_observer: null,
        });
        if (msg.values.replyingTo) {
            const { replyingTo } = msg.values;
            const replyBlock = tmpl_reply();
            const replyLink = replyBlock.lastElementChild;
            // reply is already chained and linked
            if (msg.Author.reply) {
                this.draw_reply_block(replyLink, msg.Author.reply);
            }
            else {
                // find existing message
                this.get_reply_message(replyingTo)
                    .then((resp) => {
                    this.draw_reply_block(replyLink, resp);
                })
                    .catch((err) => {
                    console.error(err);
                    this.draw_reply_block(replyLink);
                });
            }
            e.prepend(replyBlock);
        }
        return e;
    }
    // draw a message and insert it into the linked list
    // msg: Message
    // prev,next: Part - surrounding list nodes
    add_part(msg, prev, next) {
        const elem = this.draw_part(msg);
        const part = { data: msg, elem, prev, next };
        this.parts.set(msg.id, (next.prev = prev.next = part));
        return part;
    }
    // display the first message in the list
    display_only(msg) {
        const part = this.add_part(msg, this, this);
        this.$list.append(MessageList.draw_block(msg, part.elem));
        return part;
    }
    // display a new message at the top of the list
    display_top(msg) {
        const next = this.next;
        const part = this.add_part(msg, this, next);
        if (this.check_merge(part.data, next.data))
            next.elem.before(part.elem); // todo: timestamp
        else
            this.$list.prepend(MessageList.draw_block(msg, part.elem));
        return part;
    }
    // display a new message at the bottom of the list
    display_bottom(msg) {
        const prev = this.prev;
        const part = this.add_part(msg, prev, this);
        if (this.check_merge(prev.data, part.data))
            prev.elem.after(part.elem);
        else
            this.$list.append(MessageList.draw_block(msg, part.elem));
        return part;
    }
    // `relative`: the message to display the message `msg` around
    // `where`: where around the message? either 'before'/'after'
    display_around(relative, msg, where = 'before') {
        const rel = relative;
        const [prev, next] = where == 'before' ? [rel.prev, rel] : [rel, rel.next];
        // know: `where` doesn't matter anymore
        if (next == this)
            return this.display_bottom(msg);
        if (prev == this)
            return this.display_top(msg);
        // know: the [prev/next]s are not the ends, so they'll have `elem`s
        const same_block = prev.elem.parentNode == next.elem.parentNode;
        const part = this.add_part(msg, prev, next);
        if (this.check_merge(msg, next.data)) {
            // print('new message part can be part of next message block')
            ;
            next.elem.before(part.elem);
            return part;
        }
        if (this.check_merge(prev.data, msg)) {
            // print('new message part can be part of prev message block')
            ;
            prev.elem.after(part.elem);
            return part;
        }
        const next_block = next.elem.parentNode.parentNode;
        // Are `prev` and `next` effectively in separate message blocks?
        // (Can't use `prev.elem` in the expr because it might be null)
        if (!same_block) {
            // print('cannot merge with either, so create a new block before next message block')
            next_block.before(MessageList.draw_block(msg, part.elem));
        }
        else {
            // print('splice (create a block inside an existing block, splitting it into two)...')
            const block_containing_msg = MessageList.draw_block(msg, part.elem);
            const parts = Array.from(next.elem.parentNode.children);
            const next_index = parts.indexOf(next.elem);
            next_block.after(block_containing_msg);
            const splice_block = MessageList.draw_block(next.data);
            block_containing_msg.after(splice_block);
            Element.prototype.append.apply(splice_block.lastChild, parts.splice(next_index));
        }
        return part;
    }
    // existing: Part - the part to replace
    // msg: Message - the new message data
    replace(existing, msg) {
        if (existing == this)
            throw new TypeError('tried to replace list terminator');
        const ex = existing;
        const id = msg.id;
        // deleted from this room
        if (msg.deleted) {
            this.remove(existing);
            return null;
        }
        // moved to other room
        if (msg.contentId != this.pid) {
            if (!msg.edited)
                print('warning: impossible? ', id);
            this.remove(existing);
            return null;
        }
        // normal edited message?
        if (!msg.edited)
            print('warning: duplicate message ', id);
        // fancy edited message?
        if (msg.Author.merge_hash != ex.data.Author.merge_hash) {
            const next = ex.next;
            this.remove(existing);
            return this.display_around(next, msg, 'before');
        }
        const elem = this.draw_part(msg);
        ex.elem.replaceWith(elem);
        ex.elem = elem;
        ex.data = msg;
        return ex;
    }
    // display a Message at the bottom of the list
    // ONLY use this for messages from live message_events
    // if cb is set, it will be called before a message is inserted
    // return: (todo improve this. rn we only use it for updating the title notif.)
    // true - new message added at bottom
    // false - replaced/removed an edited/deleted/rethreaded message
    // null - nothing
    display_live(msg, cb = null) {
        const id = msg.id;
        const existing = this.parts.get(id);
        if (existing) {
            cb && cb();
            this.replace(existing, msg);
            return false;
        }
        // deleted, or for another room
        if (msg.deleted || msg.contentId != this.pid)
            return null;
        const prev = this.prev;
        if (prev == this) {
            cb && cb();
            // note: if message is edited, this isn't really safe
            // because it could be an old edited message
            // but, in practice, this only happens if the page
            // has no messages at all, because otherwise
            // we would've loaded initial messages
            /// but technically, we should check against the page's
            // lastmessageid, if we /aren't/ loading initial messages
            // to make sure the edited message is new message.
            this.display_only(msg);
            return true;
        }
        if (id > prev.data.id) {
            cb && cb();
            this.display_bottom(msg);
            return true;
        }
        if (!msg.edited)
            print('warning: out of order: ', id);
        // old message
        if (id < this.next.data.id)
            return null;
        // rethreaded from another room
        this.rethread(msg);
        return false;
    }
    // display a Message at the top or bottom of the list
    display_edge(msg) {
        const id = msg.id;
        const existing = this.parts.get(id);
        if (existing) {
            print('warning: duplicate message? ' + id);
            return this.replace(existing, msg);
        }
        if (this.next == this)
            return this.display_only(msg);
        if (id > this.prev.data.id)
            return this.display_bottom(msg);
        if (id < this.next.data.id)
            return this.display_top(msg);
        throw new Error('messages out of order?');
    }
    // todo
    // need to prevent this from loading messages multiple times at once
    // and inserting out of order...x
    load_messages_near(top, amount, callback) {
        const part = top ? this.next : this.prev;
        if (part == this)
            return;
        const id = part.data.id;
        //
        const order = top ? 'id_desc' : 'id';
        const query = `contentId = @pid AND id ${top ? '<' : '>'} @last AND !notdeleted()`;
        Lp.chain({
            values: { last: id, pid: this.pid },
            requests: [
                { type: 'message', fields: '*', query, order, limit: amount },
                { name: 'replies', type: 'message', fields: '*', query: 'id in @message.values.replyingTo' },
                {
                    type: 'user',
                    fields: '*',
                    query: 'id in @message.createUserId OR id IN @replies.createUserId',
                },
            ],
        }, (resp) => {
            let first = true;
            for (const c of resp.message) {
                const part = this.display_edge(c);
                if (part && first) {
                    ;
                    part.elem.classList.add('boundary-' + (top ? 'bottom' : 'top'));
                    first = false;
                }
            }
            callback(resp.message.length != 0);
        });
    }
    // limiting number of displayed messages
    // NOTE (parity): `parts` is a Map, which has no `.length` (it's `.size`), so `.length` is
    // undefined — `undefined > max_parts` is false and `undefined - max_parts` is NaN. The 500
    // limit is therefore permanently inert. Reproduced exactly, NOT fixed.
    over_limit() {
        return this.parts.length > this.max_parts;
    }
    limit_messages() {
        const over = this.parts.length - this.max_parts;
        for (let i = 0; i < over; i++)
            this.remove(this.next);
    }
    rethread(msg) {
        let pivot = this.prev;
        while (pivot != this && pivot.data.id > msg.id)
            pivot = pivot.prev;
        return this.display_around(pivot, msg, 'after');
    }
    // elem: <message-part> or null
    static show_controls(elem) {
        if (elem == this.controls_message)
            return; // shouldn't happen?
        if (elem) {
            elem.before(this.controls);
        }
        else
            this.controls.remove();
        this.controls_message = elem;
        // pick them
        if (elem) {
            const block = elem.closest('message-block');
            const me = block && +block.dataset.uid == Req.uid;
            this.control_buttons.reply.hidden = me;
            this.control_buttons.edit.hidden = !me;
        }
    }
    static send_mce(action, data, target) {
        const ev2 = new CustomEvent('message_control', {
            bubbles: true,
            cancellable: true,
            detail: { data, action },
        });
        target.dispatchEvent(ev2);
    }
    static init() {
        // draw the message controls — `controls`/`control_buttons` are created by the static field
        // initializers above (once, at class eval); init just fills and wires them.
        // draw the things
        // yeah
        const btn = (action, label) => {
            const b = document.createElement('button');
            b.onclick = () => {
                this.send_mce(action, null, this.controls_message);
            };
            b.dataset.action = action;
            b.tabIndex = -1;
            b.append(label);
            this.controls.append(b);
            this.control_buttons[action] = b;
        };
        btn('info', '🗺️');
        btn('edit', '✏️');
        btn('reply', '⤴️');
        const listen = (ev, fn) => {
            document.addEventListener(ev, fn, { passive: true });
        };
        // todo: fix this so focusing shows controls again.
        // the issue is that clicking the buttons can alter focus
        // and on mobile, there are other issues too
        /*listen('focusin', e=>{ … })
          listen('focusout', e=>{ … })*/
        // show controls when hovering over a <message-part>
        //
        // This works on mobile, because touches trigger mouseover.
        // the touch creates a virtual cursor which stays there,
        // until you touch somewhere else (which then triggers mouseleave)
        const enter = (ev) => {
            const elem = ev.target.closest('message-part, message-controls, .message-list');
            if (!elem || elem.classList.contains('message-list'))
                this.show_controls(null);
            else if (elem.tagName == 'MESSAGE-PART')
                this.show_controls(elem);
            // otherwise, the element is <message-controls> so we do nothing
        };
        if (IOS_SAFARI) {
            listen('click', enter);
            listen('touchstart', (ev) => {
                if (!this.controls_message)
                    return;
                if (this.controls.contains(ev.target))
                    return;
                if (this.controls_message.contains(ev.target)) {
                    //return
                }
                this.show_controls(null);
            });
        }
        else {
            listen('mouseover', enter);
            listen('mouseleave', () => {
                this.show_controls(null);
            });
        }
    }
    // messages.js:486 — was `MessageList.draw_block = function(comment, part){…}.bind({block, …})`
    // where `this.block()` etc. cloned a named template. The bound template object is replaced by
    // the module-level `tmpl_*` factories; behavior is byte-identical.
    static draw_block(comment, part) {
        const e = tmpl_block();
        const author = comment.Author;
        const module = comment.module;
        e.dataset.uid = String(comment.createUserId);
        if (module === null) {
            const avatar = tmpl_avatar();
            e.prepend(avatar);
            avatar.src = avatar_url(author);
            if (author.bigAvatar) {
                avatar.className = 'bigAvatar';
                // for now we don't support both
            }
            else {
                if (author.avatar_pixel) {
                    avatar.classList.add('apx');
                    if (Settings.values.pixel_art == 'on') {
                        // TODO: what if setting is turned off while image is loading?
                        if (avatar.naturalWidth) {
                            recalc_image_scale(avatar);
                        }
                        else {
                            avatar.decode().then(() => {
                                recalc_image_scale(avatar);
                            });
                        }
                    }
                }
            }
        }
        else {
            e.classList.add('module');
            const module_name = tmpl_module_name();
            module_name.textContent = comment.module;
            e.prepend(module_name);
        }
        const header = e.firstChild.nextSibling;
        const name = header.firstChild;
        const name_first = name.firstChild;
        if (module !== null) {
            name_first.textContent = module;
            name_first.classList.add('module-name');
            const module_elem = tmpl_module();
            const module_avatar = module_elem.lastChild.firstElementChild;
            const module_user = module_elem.lastChild.lastElementChild;
            module_avatar.src = avatar_url(author);
            module_user.textContent = author.username;
            name.appendChild(module_elem);
        }
        else if (author.nickname == null) {
            name_first.textContent = author.username;
        }
        else {
            name_first.textContent = author.nickname;
            if (author.bridge)
                name.appendChild(tmpl_bridge());
            else {
                const nickname = tmpl_nickname();
                const realname = nickname.lastChild.lastElementChild;
                realname.textContent = author.username;
                name.appendChild(nickname);
            }
        }
        const time = header.lastChild;
        //time.dateTime = comment.createDate
        time.textContent = '\t­\t' + time_string(comment.Author.date);
        if (part)
            e.lastChild.appendChild(part);
        return e;
    }
}
// ---- shared floating controls (statics) --------------------------------------------
Object.defineProperty(MessageList, "controls", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: document.createElement('message-controls')
});
Object.defineProperty(MessageList, "controls_message", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: null
});
Object.defineProperty(MessageList, "control_buttons", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: Object.create(null)
});
MessageList.init();
Object.seal(MessageList);
// fallback message_control handler, if events arent handled by the View
document.addEventListener('message_control', (ev) => {
    const e = ev;
    if (e.detail.action == 'info' || e.detail.action == 'raw')
        alert(JSON.stringify(e.detail.data, null, 1)); // <small heart>
    if (e.detail.action == 'link') {
        navigator.clipboard.writeText(`sbs:comments?ids=${e.detail.data.id}`);
        print('copied link');
    }
});
