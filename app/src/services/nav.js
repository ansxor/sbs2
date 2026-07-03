import { handle_redirect } from '../routing/view-registry';
// ---- module state (the truth; `Nav.slots` is this same array) --------------------------
const slots = [];
let snapshot = slots.slice();
const listeners = new Set();
let active_editor = null;
// ---- injected sinks (wired by L6/L8; no-ops until then) ---------------------------------
let closeFullscreen = () => { };
// Sidebar.close_fullscreen() — called when a `#`-link resolves to the slot's current url
// (navigate.js:460).
export function setCloseFullscreen(fn) {
    closeFullscreen = fn;
}
// The active-editor registry backing `Nav.view()` (was `Nav.focused?.view`, consumed by
// upload.js's cross-view Insert_Text; ARCHITECTURE §6). L7 EditView/PageView register their
// focused editor here; clearing passes null.
export function setActiveEditor(editor) {
    active_editor = editor;
}
// ---- external-store plumbing ------------------------------------------------------------
function notify() {
    snapshot = slots.slice();
    for (const cb of listeners)
        cb();
}
// ---- slot helpers -----------------------------------------------------------------------
// Was `new ViewSlot()`: a fresh empty slot that grabs focus if nothing is focused yet
// (ViewSlot's constructor did `if (!Nav.focused) this.set_focus()`).
function create_slot() {
    const slot = { url: '' };
    if (!Nav.focused)
        Nav.focused = slot;
    return slot;
}
// Map a live `<view-slot>` DOM element back to its SlotDescriptor. The old handler matched
// `Nav.slots.find(s=>s.$root===slot)`; slots no longer own their DOM, but React renders the
// `<view-slot>`s in slots order inside one container, so DOM order = slots order.
function slot_from_el(el) {
    const parent = el.parentElement;
    if (!parent)
        return null;
    const siblings = parent.querySelectorAll(':scope > view-slot');
    const idx = Array.prototype.indexOf.call(siblings, el);
    return idx >= 0 ? slots[idx] ?? null : null;
}
// navigate.js:97 — load_url(url): skip if the slot already holds this exact url string.
function load_slot_url(slot, rawUrl) {
    if (slot.url === rawUrl)
        return false;
    return load_slot_location(slot, Nav.parse_url(rawUrl));
}
// navigate.js:102 — load_location: canonicalize (redirect + unparse), pushState, and return
// whether the url actually changed (drives whether React reloads / whether to close the
// mobile sidebar). set_address runs even on a no-op change, exactly as the original did.
function load_slot_location(slot, location) {
    const old = slot.url;
    const canonical = handle_redirect(location);
    slot.url = Nav.unparse_url(canonical);
    Nav.set_address();
    if (slot.url === old)
        return false;
    notify();
    return true;
}
export const Nav = {
    slots,
    focused: null,
    view() {
        return active_editor;
    },
    focused_slot() {
        if (Nav.focused)
            return Nav.focused;
        if (!slots[0])
            slots.push(create_slot());
        return slots[0];
    },
    set_focus(slot) {
        if (Nav.focused === slot)
            return;
        Nav.focused = slot;
        notify();
    },
    entity_link(entity) {
        const type = { user: 'user', content: 'page', category: 'category' }[entity.Type];
        if (!type)
            throw new Error('idk entity type');
        return '#' + type + '/' + entity.id;
    },
    // navigate.js:314 — parse a single slot-url string into {type,id,query,fragment}.
    parse_url(source) {
        const [, typeRaw, idRaw, query_str, fragment] = /^(.*?)(?:[/](.*?))?([?&].*?)?(?:[#](.*))?$/.exec(source);
        const type = decodeURIComponent(typeRaw);
        let id;
        if (idRaw == undefined)
            id = null;
        else {
            const decoded = decodeURIComponent(idRaw);
            if (/^-?\d+$/.test(decoded))
                id = +decoded;
            else if (decoded[0] == '@')
                id = decoded.substring(1);
            else
                id = decoded;
        }
        const query = {};
        if (query_str)
            for (const pair of query_str.match(/[^?&]+/g)) {
                const m = pair.match(/[^=]*(?==?([^]*))/);
                query[decodeURIComponent(m[0])] = decodeURIComponent(m[1]);
            }
        return { type, id, query, fragment: fragment ? decodeURIComponent(fragment) : null };
    },
    // navigate.js:336 — inverse of parse_url.
    unparse_url(location) {
        function esc(str, regex) {
            // allow: \w - . ! * ' $ + , : ; @
            str = encodeURI(str).replace(/[)~(]+/g, escape);
            if (regex)
                str = str.replace(regex, encodeURIComponent);
            return str;
        }
        let url = esc(location.type, /[/?&#]+/g);
        if (location.id != null) {
            url += '/';
            if ('string' == typeof location.id) {
                if (/^-?\d+$|^@/.test(location.id))
                    url += '@';
            }
            url += esc(String(location.id), /[/?&#]+/g);
        }
        const query = Object.entries(location.query)
            .map(([k, v]) => {
            k = esc(k, /[?=&#]+/g);
            return v ? k + '=' + esc(v, /[?&#]+/g) : k;
        })
            .join('&');
        if (query)
            url += '?' + query;
        if (location.fragment != null)
            url += '#' + esc(location.fragment);
        // don't allow , ! : . as final char
        url = url.replace(/[,!:.]$/, (x) => '%' + x.charCodeAt(0).toString(16));
        return url;
    },
    // navigate.js:377 — the address bar contents: "#" + slot urls joined by "~".
    make_url() {
        return '#' + slots.map((slot) => slot.url || '').join('~');
    },
    // "serialize" alias for the full-hash serializer (frozen contract).
    serialize() {
        return Nav.make_url();
    },
    // navigate.js:372 — push or replace the current address with make_url().
    set_address(replace = false) {
        window.history[replace ? 'replaceState' : 'pushState'](null, 'sbs2', Nav.make_url());
    },
    // navigate.js:102 — public entry for loading a location into a slot (default: focused).
    load_location(location, slot) {
        load_slot_location(slot ?? Nav.focused_slot(), location);
    },
    // navigate.js:381 — the router core. Reconcile slots against a "~"-joined fragment,
    // canonicalize each url, replaceState the canonical address, then notify React (which
    // reloads only the slots whose url string changed, via url-keyed <Slot> memoization).
    update_from_fragment(fragment) {
        const urls = fragment ? fragment.split('~') : [];
        for (let i = 0; i < urls.length; i++) {
            const raw = urls[i];
            let slot = slots[i];
            if (!slot) {
                slot = create_slot();
                slots[i] = slot;
            }
            // load_url(raw, suppress=true): recompute canonical url only if it differs.
            if (slot.url !== raw) {
                const canonical = handle_redirect(Nav.parse_url(raw));
                slot.url = Nav.unparse_url(canonical);
            }
        }
        // drop extra slots (was ViewSlot.destroy per slot; teardown now happens on React unmount)
        slots.length = urls.length;
        if (Nav.focused && !slots.includes(Nav.focused))
            Nav.focused = slots[0] ?? null;
        Nav.set_address(true);
        notify();
    },
    // navigate.js:406 — one-time boot: migrate a legacy `?page/123`-style query URL to the
    // `#page/123` hash (unless a hash is present, the query is empty, or it's `?api...`), then
    // route the current hash.
    start() {
        if (window.location.hash == '' &&
            window.location.search.length > 1 &&
            !window.location.search.startsWith('?api')) {
            const x = new URL(window.location.href);
            x.hash = '#' + x.search.substring(1);
            x.search = '';
            window.history.replaceState(null, 'sbs2', x.href);
        }
        Nav.update_from_fragment(window.location.hash.substring(1));
    },
    // external store for useSyncExternalStore (called unbound by React → must not use `this`).
    subscribe(cb) {
        listeners.add(cb);
        return () => {
            listeners.delete(cb);
        };
    },
    getSlots() {
        return snapshot;
    },
};
// navigate.js:425 — hashchange re-routes (never fires for replaceState-driven changes).
window.addEventListener('hashchange', () => {
    Nav.update_from_fragment(window.location.hash.substring(1));
});
// navigate.js:430 — global capture click handler: intercept `#`-href links and load them
// into a slot (Ctrl/Meta = open in a new slot; target="self" = in-page anchor scroll).
document.addEventListener('click', (ev) => {
    const el = ev.target;
    const link = (el instanceof Element ? el.closest(':any-link') : null);
    if (!link)
        return;
    let href = link.getAttribute('href'); // note: can't use `link.href`
    if (href == null)
        return;
    let target = link.target;
    if (href.startsWith('https://oboy.smilebasicsource.com/12/')) {
        href = link.hash;
        target = '';
    }
    if (!href.startsWith('#'))
        return;
    ev.preventDefault();
    ev.stopPropagation();
    // find nearest slot if we're inside one, otherwise use focused slot
    const slotEl = link.closest('view-slot');
    let slot = (slotEl && slot_from_el(slotEl)) || Nav.focused_slot();
    // load url into slot
    if (target != 'self') {
        // ctrl: new slot
        if (ev.ctrlKey || ev.metaKey) {
            slot = create_slot();
            slots.push(slot);
            Nav.focused = slot;
        }
        if (!load_slot_url(slot, href.slice(1)))
            closeFullscreen();
    }
    else {
        // #anchor url
        const root = slotEl ?? document;
        const anchor = root.querySelector(`a[name="${CSS.escape(href.slice(1))}"]`);
        if (anchor)
            anchor.scrollIntoView();
    }
}, { capture: true });
