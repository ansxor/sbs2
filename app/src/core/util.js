// Platform utilities ported from src/fill.js (the old bootstrap runtime), stripped of the
// global-prototype vandalism. Each of these was a method/function bolted onto a built-in in
// the vanilla app; here they are plain ES-module functions imported where used (ARCHITECTURE
// §10, fill-templating.md §6). Behavior is byte-for-byte with the originals.
// --- JSON.to_blob (fill.js:153) ---
// Wrap a value as a JSON Blob for XHR request bodies. type string kept verbatim.
export function to_blob(obj) {
    return new Blob([JSON.stringify(obj)], { type: 'application/json;charset=UTF-8' });
}
// --- Object.for (fill.js:158) ---
// Iterate own enumerable string-keyed entries in insertion order, calling
// callback(value, key, obj) (value-first, like Array.forEach). Order preservation is relied
// upon by callers (e.g. Views/comments.js).
export function objectFor(obj, callback) {
    for (const [key, value] of Object.entries(obj))
        callback(value, key, obj);
}
// --- RegExp.prototype.rmatch (fill.js:164) ---
// Null-safe String.match with the arguments reversed (regex first). Returns [] instead of
// null on no match so destructuring never throws. The typeof guard is preserved from the
// original (callers historically could pass non-strings).
export function rmatch(re, str) {
    if (typeof str !== 'string')
        throw new TypeError('RegExp.rmatch() expects string');
    return String.prototype.match.call(str, re) || [];
}
// --- Array.prototype.findLast (fill.js:125, polyfill) ---
// Return the last element for which filter is truthy, else undefined. Kept as a util for
// parity even though modern targets ship a native Array.prototype.findLast.
export function findLast(a, filter) {
    for (let i = a.length - 1; i >= 0; i--) {
        if (filter(a[i], i, a))
            return a[i];
    }
    return undefined;
}
// --- Generator.prototype.run (fill.js:94) ---
// The vanilla async/await replacement: drives a generator to completion as a coroutine. Each
// step exposes a resume function (obtained by the generator via `let STEP = yield`) which the
// generator hands to an async op (Lp.chain / setTimeout / doWhenReady) as a callback; calling
// STEP(value) resumes the generator with that value. The trampoline handles both synchronous
// and asynchronous resume through the `step` reassignment dance — ported character-for-character
// from the original destructuring-assignment form so the timing is identical. Returns the
// generator (callers keep it as an in-flight handle).
export function runGenerator(gen, ok = console.info, err = (e) => {
    throw e;
}) {
    let step;
    const main = (data) => {
        step = (defer) => {
            ;
            [data, step] = [defer, main];
        };
        try {
            const r = gen.next(data);
            if (r.done)
                [data, step] = [r.value, ok];
        }
        catch (e) {
            ;
            [data, step] = [e, err];
        }
        step(data);
    };
    main(undefined);
    step((x) => step(x));
    return gen;
}
