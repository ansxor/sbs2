// Auto-scroller (scroller.js → ARCHITECTURE §8.1 / §10, L4a).
//
// `Scroller` + `ResizeTracker` are ported class-for-class from src/scroller.js with ALL raw math
// kept verbatim: bottom_region=10, the 9e9 scrollTop jump, translateY offsets, scroll_height via
// getBoundingClientRect().height (NOT scrollHeight), the <=1 epsilon, the 0.75^min(dt,2) rAF spring,
// the anim_type==2 CSS-transition sequence, lock/unlock batching, the reverse-mode at_bottom
// override, the before/after_print tokens, and print_top relying on native scroll anchoring.
//
// The ONLY intentional edit vs the original is the `skipReparent` flag (ScrollerOptions): when set,
// the constructor does NOT create/insert the <scroll-middle> wrapper, because ScrollerHost.tsx (L6a)
// renders the full outer > scroll-middle > inner tree in JSX and hands the nodes in. Final DOM is
// identical either way. anim_type/reverse are snapshotted from the class statics at construction, so
// changing the setting does not retro-update live instances (verbatim behavior).
import { Settings } from './settings';
export class ResizeTracker {
    constructor(measure) {
        Object.defineProperty(this, "measure", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "tracking", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "observer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "interval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.measure = measure;
        // ResizeObserver is a very new feature (added in ~2020)
        if (window.ResizeObserver) {
            this.tracking = new WeakMap();
            this.observer = new ResizeObserver((events) => {
                for (const { target, contentRect } of events)
                    this.handle(target, contentRect);
            });
        }
        else {
            const map = (this.tracking = new Map());
            this.observer = { observe(_e) { }, unobserve(_e) { } };
            // this never gets cleared uhh
            this.interval = window.setInterval(() => {
                for (const target of map.keys())
                    this.handle(target, target.getBoundingClientRect());
            }, 200);
        }
        Object.seal(this);
    }
    handle(target, rect) {
        const item = this.tracking.get(target);
        const dim = rect[this.measure];
        // ignore changes for hidden and unchanged elements
        if (rect.width && dim != item.size) {
            item.callback(item.size); // pass old size
            item.size = dim;
        }
    }
    add(element, callback) {
        this.observer.observe(element);
        const size = element.getBoundingClientRect()[this.measure];
        this.tracking.set(element, { callback, size });
    }
    remove(element) {
        this.observer.unobserve(element);
        this.tracking.delete(element);
    }
}
export class Scroller {
    constructor(outer, inner, opts) {
        Object.defineProperty(this, "$outer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "$inner", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "anim", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "locked", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "before", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "bottom_region", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "anim_type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "reverse", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.$outer = outer;
        this.$inner = inner;
        if (!opts?.skipReparent) {
            const middle = document.createElement('scroll-middle');
            middle.append(this.$inner);
            this.$outer.append(middle);
        }
        this.anim = null;
        this.locked = false;
        this.before = null;
        // autoscroll is enabled within this distance from the bottom
        this.bottom_region = 10;
        this.anim_type = Scroller.anim_type;
        if (this.anim_type == 2)
            this.$inner.classList.add('scroll-anim3');
        this.reverse = Scroller.reverse;
        if (this.reverse) {
            this.$outer.classList.add('anchor-bottom');
            this.at_bottom = () => -this.$outer.scrollTop < this.bottom_region;
        }
        else {
            // i think it might not be totally reliable if both these fire at once...
            Scroller.track_height.add(this.$outer, (old_size) => {
                if (this.at_bottom(old_size, undefined))
                    this.scroll_instant();
            });
            Scroller.track_height.add(this.$inner, (old_size) => {
                if (this.at_bottom(undefined, old_size))
                    this.scroll_instant();
            });
        }
        Object.seal(this);
    }
    at_bottom(outer = this.$outer.clientHeight, scroll = this.$outer.scrollHeight) {
        const top = this.$outer.scrollTop;
        return scroll - outer - top < this.bottom_region;
    }
    scroll_instant() {
        this.$outer.scrollTop = this.reverse ? 0 : 9e9;
    }
    scroll_height() {
        return this.$inner.getBoundingClientRect().height;
    }
    set_offset(y) {
        this.$inner.style.transform = y ? `translateY(${y}px)` : '';
    }
    print_top(fn) {
        // eh
        // i think we're saved by scroll anchoring here, or something
        fn(this.$inner);
    }
    before_print(smooth) {
        // not scrolled to bottom, don't do anything
        if (!this.at_bottom()) {
            if (this.reverse) {
                return -this.scroll_height();
            }
            else
                return 'none';
        }
        // anim disabled
        if (!smooth || this.anim_type == 0 || 'visible' != document.visibilityState)
            return 'instant';
        // at bottom + anim enabled
        // note: stop trying to use scrollheight instead, it wont work when the elem isnt tall enough!
        return this.scroll_height();
    }
    after_print(before) {
        if (this.reverse && 'number' == typeof before && before < 0) {
            const after = this.scroll_height();
            before = -before;
            if (before != after)
                this.$outer.scrollTop -= after - before; // maybe round this to the nearest DPR or 1/DPR?
            return;
        }
        if (this.locked) {
            this.before = before;
            return;
        }
        if (before === 'none')
            return;
        if (before === 'instant') {
            this.scroll_instant();
            if (this.anim_type != 0)
                this.cancel_animation();
            return;
        }
        const after = this.scroll_height();
        const dist = after - before;
        if (Math.abs(dist) <= 1) {
            this.scroll_instant();
            return;
        }
        // make sure no existing animation is happening
        // todo: somehow continue the current animation rather than
        if (this.anim)
            cancelAnimationFrame(this.anim);
        if (this.anim_type == 2)
            this.$inner.style.transitionProperty = 'none';
        this.set_offset(dist);
        this.scroll_instant();
        if (this.anim_type == 2)
            this.$inner.style.transitionProperty = '';
        this.anim_step(dist);
    }
    print(fn, smooth) {
        const x = this.before_print(smooth);
        try {
            fn(this.$inner);
        }
        finally {
            this.after_print(x);
        }
    }
    lock() {
        if (!this.locked) {
            this.locked = true;
            this.before = null;
        }
    }
    unlock() {
        if (this.locked) {
            this.locked = false;
            if (this.before != null)
                this.after_print(this.before);
        }
    }
    cancel_animation() {
        if (this.anim)
            cancelAnimationFrame(this.anim);
        this.anim = null;
        if (this.anim_type == 2)
            this.$inner.style.transitionProperty = 'none';
        this.set_offset();
    }
    // mode 1 only
    anim_step(dist, prev_time = document.timeline.currentTime) {
        this.anim = window.requestAnimationFrame((time) => {
            this.anim = null;
            // ideally we should cancel the animation when the document stops being visible
            // but there's no easy way to attach the event listener without creating a memory leak, of course
            if ('visible' != document.visibilityState) {
                this.cancel_animation();
                return;
            }
            if (this.anim_type == 2) {
                this.set_offset();
                return;
            }
            const dt = (time - prev_time) / (1000 / 60);
            dist *= Math.pow(0.75, Math.min(dt, 2));
            if (Math.abs(dist) <= 1) {
                this.set_offset();
            }
            else {
                this.set_offset(dist);
                this.anim_step(dist, time);
            }
        });
    }
    destroy() {
        // probably unneccessary but idk.. memory leaks
        // i don't think we actually call this reliably though?
        Scroller.track_height.remove(this.$inner);
        Scroller.track_height.remove(this.$outer);
    }
}
Object.defineProperty(Scroller, "track_height", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: new ResizeTracker('height')
});
Object.defineProperty(Scroller, "anim_type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 2
});
Object.defineProperty(Scroller, "reverse", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: false
});
const scrollerAnimType = {
    name: 'scroller_anim_type',
    label: 'Smooth Scrolling',
    type: 'select',
    options: ['1', '2', '0'],
    options_labels: ['original', 'css animation', 'disabled'],
    update(value) {
        Scroller.anim_type = +value;
    },
};
const scrollerAnchor = {
    name: 'scroller_anchor',
    label: 'Scroller Origin',
    type: 'select',
    options: ['top', 'bottom'],
    options_labels: ['top', 'bottom (unstable!)'],
    update(value) {
        Scroller.reverse = value == 'bottom';
    },
};
Settings.add(scrollerAnimType);
Settings.add(scrollerAnchor);
