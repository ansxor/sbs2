// The do_when_ready / run_on_load "ready gate" ported from src/fill.js (definition) + src/main.js
// (drain). In the vanilla app, before DOMContentLoaded `do_when_ready(fn)` pushed fn onto the
// `run_on_load` array; on `dom_ready()` it flipped to immediate mode (`x => x()`) and drained the
// queue in order. This module reproduces that dual-mode queue as plain ES-module functions
// (ARCHITECTURE §10). The pre-React bootstrap (boot/bootstrap.ts, L8) drives the transition:
// setImmediateMode() then drainReady(), mirroring dom_ready()'s order so a nested doWhenReady
// during the drain runs synchronously.
//
// Self-contained: the early inline <script> in index.html defines its own `run_on_load` global,
// but nothing enqueues onto it before the module bundle runs (it is always empty at that point),
// so this module does not adopt it — bridging the early global, if ever needed, is bootstrap's job.
let immediate = false;
let queue = [];
// do_when_ready (fill.js:70 pre-ready form / main.js:67 immediate form). Before drain, enqueue;
// after setImmediateMode(), invoke synchronously.
export function doWhenReady(fn) {
    if (immediate)
        fn();
    else
        queue.push(fn);
}
// Flip to immediate mode (main.js:67 `do_when_ready = x => {x()}`). Subsequent doWhenReady calls
// run immediately.
export function setImmediateMode() {
    immediate = true;
}
// Drain the pending queue in registration order (main.js:69 `run_on_load.forEach(x=>x())`) and
// release it (main.js:70 `run_on_load = null`). Idempotent guard added so a second call is a
// no-op rather than a throw.
export function drainReady() {
    if (!queue)
        return;
    queue.forEach((fn) => fn());
    queue = null;
}
