// useResizable — ports draw.js's ResizeBar (drag-to-resize + localStorage persist) as a hook
// (ARCHITECTURE §9 draw.js ResizeBar → hooks/useResizable.ts, L6b).
//
// The imperative ResizeBar class is ported near-verbatim: one global drag target at a time,
// document-level mouse/touch listeners installed once, per-instance handle listeners, and the
// exact resize math + localStorage key contract (sidebarWidth / sidebarPinnedHeight /
// setting--divider-pos-<page_id>). `Object.seal` is dropped (TS types replace it). React only
// hands the hook two refs (the element being resized and its drag handle); the controller mutates
// inline width/height on the element imperatively, the island pattern.
import { useLayoutEffect, useRef } from 'react';
// Near-verbatim port of draw.js `class ResizeBar` (src/draw.js:415-495).
class ResizeBar {
    // draw.js `static init()` — the document-level listeners, installed exactly once.
    static init() {
        if (this.initialized)
            return;
        this.initialized = true;
        this.current = null;
        const up = () => this.grab(null);
        document.addEventListener('mouseup', up, { passive: true });
        document.addEventListener('touchend', up, { passive: true });
        const move = (ev) => this.move(ev);
        document.addEventListener('mousemove', move, { passive: true });
        document.addEventListener('touchmove', move, { passive: true });
    }
    static grab(bar) {
        this.current && this.current.finish();
        this.current = bar;
    }
    static move(ev) {
        this.current && this.current.move(ev);
    }
    constructor(element, handle, side, save = null, def = null) {
        Object.defineProperty(this, "$elem", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "$handle", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "save", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "horiz", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "dir", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1
        });
        Object.defineProperty(this, "start_pos", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "start_size", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "size", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "down", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.$elem = element;
        this.$handle = handle;
        this.save = save;
        this.switch(side);
        this.down = (ev) => this.start(ev);
        handle.addEventListener('mousedown', this.down);
        handle.addEventListener('touchstart', this.down);
        if (this.save) {
            const s = localStorage.getItem(this.save);
            if (s)
                def = +s;
        }
        if (def != null)
            this.update_size(def);
    }
    switch(side) {
        this.horiz = side === 'left' || side === 'right';
        this.dir = side === 'top' || side === 'left' ? 1 : -1;
        if (this.size != null)
            this.update_size(this.size);
        // remove the opposite dir's style
        this.$elem.style[!this.horiz ? 'width' : 'height'] = '';
    }
    event_pos(ev) {
        // draw.js `if (ev.touches)` — MouseEvent has no `touches` (undefined→falsy). Casts are
        // parity-only and erase to the original dynamic property reads.
        const touches = ev.touches;
        if (touches)
            return touches[0][this.horiz ? 'pageX' : 'pageY'];
        return ev[this.horiz ? 'clientX' : 'clientY'];
    }
    start(ev) {
        let target = ev.target;
        if (target instanceof Text)
            target = target.parentNode;
        if (target !== this.$handle)
            return;
        ev.preventDefault();
        ResizeBar.grab(this);
        this.$handle.dataset.dragging = '';
        this.start_pos = this.event_pos(ev);
        this.start_size = this.$elem.getBoundingClientRect()[this.horiz ? 'width' : 'height'];
    }
    move(ev) {
        const v = (this.event_pos(ev) - this.start_pos) * this.dir;
        this.update_size(this.start_size + v);
    }
    finish() {
        delete this.$handle.dataset.dragging;
        if (this.save && this.size != null)
            localStorage.setItem(this.save, String(this.size));
    }
    update_size(px) {
        this.size = Math.max(px, 0);
        this.$elem.style[this.horiz ? 'width' : 'height'] = this.size + 'px';
    }
    // Not present in the original (ResizeBar was never torn down); needed so a React unmount /
    // Strict-Mode double-invoke fully detaches. Behavior-preserving: removes only this instance's
    // handle listeners and clears itself as the global drag target if currently grabbed.
    dispose() {
        this.$handle.removeEventListener('mousedown', this.down);
        this.$handle.removeEventListener('touchstart', this.down);
        if (ResizeBar.current === this)
            ResizeBar.current = null;
    }
}
Object.defineProperty(ResizeBar, "current", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: null
});
Object.defineProperty(ResizeBar, "initialized", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: false
});
ResizeBar.init();
// `key` is the localStorage persistence key (== draw.js `save`); pass null for a non-persisted
// bar (editpage's `new ResizeBar(..., null, '400')`).
export function useResizable(key, opts) {
    const containerRef = useRef(null);
    const handleRef = useRef(null);
    const { side } = opts;
    const def = opts.default ?? null;
    useLayoutEffect(() => {
        const elem = containerRef.current;
        const handle = handleRef.current;
        if (!elem || !handle)
            return;
        const bar = new ResizeBar(elem, handle, side, key, def);
        return () => bar.dispose();
    }, [key, side, def]);
    return { containerRef, handleRef };
}
