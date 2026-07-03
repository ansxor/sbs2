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

// (Settings import removed — scroller_anim_type/scroller_anchor are now registered centrally by
// services/settings-modules.ts. anim_type/reverse class statics are mutated by that registrar.)

interface TrackItem {
	callback: (oldSize: number) => void
	size: number
}

export class ResizeTracker {
	measure: 'height' | 'width'
	tracking: WeakMap<Element, TrackItem> | Map<Element, TrackItem>
	observer: ResizeObserver | { observe(target: Element): void; unobserve(target: Element): void }
	interval?: number

	constructor(measure: 'height' | 'width') {
		this.measure = measure
		// ResizeObserver is a very new feature (added in ~2020)
		if (window.ResizeObserver) {
			this.tracking = new WeakMap()
			this.observer = new ResizeObserver((events) => {
				for (const { target, contentRect } of events) this.handle(target, contentRect)
			})
		} else {
			const map = (this.tracking = new Map<Element, TrackItem>())
			this.observer = { observe(_e: Element) {}, unobserve(_e: Element) {} }
			// this never gets cleared uhh
			this.interval = window.setInterval(() => {
				for (const target of map.keys()) this.handle(target, target.getBoundingClientRect())
			}, 200)
		}
		Object.seal(this)
	}
	handle(target: Element, rect: DOMRectReadOnly): void {
		const item = this.tracking.get(target)!
		const dim = rect[this.measure]
		// ignore changes for hidden and unchanged elements
		if (rect.width && dim != item.size) {
			item.callback(item.size) // pass old size
			item.size = dim
		}
	}
	add(element: Element, callback: (oldSize: number) => void): void {
		this.observer.observe(element)
		const size = element.getBoundingClientRect()[this.measure]
		this.tracking.set(element, { callback, size })
	}
	remove(element: Element): void {
		this.observer.unobserve(element)
		this.tracking.delete(element)
	}
}

export interface ScrollerOptions {
	// when set, Scroller does NOT insert its own <scroll-middle>; the React island already
	// rendered outer>scroll-middle>inner and hands the nodes in.
	skipReparent?: boolean
}

// the opaque state token returned by before_print and consumed by after_print.
type PrintToken = number | 'none' | 'instant'

export class Scroller {
	static track_height = new ResizeTracker('height')
	static anim_type = 2
	static reverse = false

	$outer: HTMLElement
	$inner: HTMLElement
	anim: number | null
	locked: boolean
	before: PrintToken | null
	bottom_region: number
	anim_type: number
	reverse: boolean

	constructor(outer: HTMLElement, inner: HTMLElement, opts?: ScrollerOptions) {
		this.$outer = outer
		this.$inner = inner

		if (!opts?.skipReparent) {
			const middle = document.createElement('scroll-middle')
			middle.append(this.$inner)
			this.$outer.append(middle)
		}

		this.anim = null
		this.locked = false
		this.before = null
		// autoscroll is enabled within this distance from the bottom
		this.bottom_region = 10

		this.anim_type = Scroller.anim_type
		if (this.anim_type == 2) this.$inner.classList.add('scroll-anim3')

		this.reverse = Scroller.reverse
		if (this.reverse) {
			this.$outer.classList.add('anchor-bottom')
			this.at_bottom = () => -this.$outer.scrollTop < this.bottom_region
		} else {
			// i think it might not be totally reliable if both these fire at once...
			Scroller.track_height.add(this.$outer, (old_size) => {
				if (this.at_bottom(old_size, undefined)) this.scroll_instant()
			})
			Scroller.track_height.add(this.$inner, (old_size) => {
				if (this.at_bottom(undefined, old_size)) this.scroll_instant()
			})
		}

		Object.seal(this)
	}
	at_bottom(outer: number = this.$outer.clientHeight, scroll: number = this.$outer.scrollHeight): boolean {
		const top = this.$outer.scrollTop
		return scroll - outer - top < this.bottom_region
	}
	scroll_instant(): void {
		this.$outer.scrollTop = this.reverse ? 0 : 9e9
	}
	scroll_height(): number {
		return this.$inner.getBoundingClientRect().height
	}
	set_offset(y?: number): void {
		this.$inner.style.transform = y ? `translateY(${y}px)` : ''
	}
	print_top(fn: (inner: HTMLElement) => void): void {
		// eh
		// i think we're saved by scroll anchoring here, or something
		fn(this.$inner)
	}
	before_print(smooth?: boolean): PrintToken {
		// not scrolled to bottom, don't do anything
		if (!this.at_bottom()) {
			if (this.reverse) {
				return -this.scroll_height()
			} else return 'none'
		}
		// anim disabled
		if (!smooth || this.anim_type == 0 || 'visible' != document.visibilityState) return 'instant'
		// at bottom + anim enabled
		// note: stop trying to use scrollheight instead, it wont work when the elem isnt tall enough!
		return this.scroll_height()
	}
	after_print(before: PrintToken): void {
		if (this.reverse && 'number' == typeof before && before < 0) {
			const after = this.scroll_height()
			before = -before
			if (before != after) this.$outer.scrollTop -= after - before // maybe round this to the nearest DPR or 1/DPR?
			return
		}
		if (this.locked) {
			this.before = before
			return
		}
		if (before === 'none') return
		if (before === 'instant') {
			this.scroll_instant()
			if (this.anim_type != 0) this.cancel_animation()
			return
		}
		const after = this.scroll_height()
		const dist = after - before
		if (Math.abs(dist) <= 1) {
			this.scroll_instant()
			return
		}
		// make sure no existing animation is happening
		// todo: somehow continue the current animation rather than
		if (this.anim) cancelAnimationFrame(this.anim)

		if (this.anim_type == 2) this.$inner.style.transitionProperty = 'none'
		this.set_offset(dist)

		this.scroll_instant()
		if (this.anim_type == 2) this.$inner.style.transitionProperty = ''

		this.anim_step(dist)
	}
	print(fn: (inner: HTMLElement) => void, smooth?: boolean): void {
		const x = this.before_print(smooth)
		try {
			fn(this.$inner)
		} finally {
			this.after_print(x)
		}
	}
	lock(): void {
		if (!this.locked) {
			this.locked = true
			this.before = null
		}
	}
	unlock(): void {
		if (this.locked) {
			this.locked = false
			if (this.before != null) this.after_print(this.before)
		}
	}
	cancel_animation(): void {
		if (this.anim) cancelAnimationFrame(this.anim)
		this.anim = null
		if (this.anim_type == 2) this.$inner.style.transitionProperty = 'none'
		this.set_offset()
	}
	// mode 1 only
	anim_step(dist: number, prev_time: number = document.timeline.currentTime as number): void {
		this.anim = window.requestAnimationFrame((time) => {
			this.anim = null
			// ideally we should cancel the animation when the document stops being visible
			// but there's no easy way to attach the event listener without creating a memory leak, of course
			if ('visible' != document.visibilityState) {
				this.cancel_animation()
				return
			}
			if (this.anim_type == 2) {
				this.set_offset()
				return
			}
			const dt = (time - prev_time) / (1000 / 60)
			dist *= Math.pow(0.75, Math.min(dt, 2))
			if (Math.abs(dist) <= 1) {
				this.set_offset()
			} else {
				this.set_offset(dist)
				this.anim_step(dist, time)
			}
		})
	}
	destroy(): void {
		// probably unneccessary but idk.. memory leaks
		// i don't think we actually call this reliably though?
		Scroller.track_height.remove(this.$inner)
		Scroller.track_height.remove(this.$outer)
	}
}
// (scrollerAnimType/scrollerAnchor + Settings.add removed — registered centrally by
// services/settings-modules.ts. The `options_labels` extension is defined there.)
