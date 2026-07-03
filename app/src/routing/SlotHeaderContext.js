// L5b — per-slot header portal (ports the ViewSlot header methods from navigate.js:57–93 and
// View.set_title from view.js:182; ARCHITECTURE §6/§10). Replaces the L0 stub.
//
// Each Slot renders a `<view-header>` with three imperatively-managed nodes ($header_extra,
// $title, $header_buttons) and builds a SlotHeaderApi bound to their refs. The api is provided
// via SlotHeaderContext and passed to the route Component as a prop; the Component (or its
// descendants via useSlotHeader) fills the header. Because the Slot is keyed by url string, a
// navigation remounts the Slot with a fresh (empty) header — reproducing the old switch_view()
// `$title.fill()/$header_buttons.fill()/$header_extra.fill()` clear-on-every-nav behavior.
//
// React renders those three nodes with NO JSX children, so React never touches the children the
// api appends into them (the standard imperative-container pattern).
import { createContext, useContext } from 'react';
import { content_label } from '../services/draw-dom';
// ---- context (frozen L0 exports, signatures unchanged) ----------------------------------
export const SlotHeaderContext = createContext(null);
export function useSlotHeader() {
    const header = useContext(SlotHeaderContext);
    if (!header)
        throw new Error('useSlotHeader must be used inside a Slot');
    return header;
}
// view.js:182 View.set_title — prevent the browser from collapsing runs of spaces by replacing
// every other one with a NBSP. The replacement strings contain U+00A0 verbatim (kept
// byte-identical). The favicon reset (change_favicon(null)) is a no-op in this path — no
// notification/favicon module is in scope and $favicon starts null — so it is omitted.
function apply_document_title(title) {
    title = title.replace(/  /g, '  ').replace(/\n/g, '  \n');
    document.title = title;
}
export function createSlotHeaderApi(refs) {
    return {
        // navigate.js:57 ViewSlot.set_title
        set_title(text) {
            apply_document_title(text);
            const el = refs.title();
            if (el) {
                const span = document.createElement('span');
                span.className = 'pre'; // todo: this is silly .. (kept)
                span.textContent = text;
                el.replaceChildren(span);
            }
        },
        // navigate.js:84 ViewSlot.set_entity_title
        set_entity_title(entity) {
            const name2 = entity.name2;
            apply_document_title(name2);
            const el = refs.title();
            if (el)
                el.replaceChildren(content_label(entity));
        },
        // navigate.js:66 ViewSlot.add_header_links — the frozen contract takes prebuilt Nodes
        // (the old {href,label,icon,target} descriptor → <a> construction moves into the calling
        // view, which appends the built anchors here).
        add_header_links(...links) {
            const el = refs.buttons();
            if (el)
                for (const link of links)
                    el.append(link);
        },
        get header_extra() {
            return refs.extra();
        },
    };
}
