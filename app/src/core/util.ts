// Platform utilities ported from src/fill.js (the old bootstrap runtime), stripped of the
// global-prototype vandalism. Each of these was a method/function bolted onto a built-in in
// the vanilla app; here they are plain ES-module functions imported where used (ARCHITECTURE
// §10, fill-templating.md §6). Behavior is byte-for-byte with the originals.

// --- JSON.to_blob (fill.js:153) ---
// Wrap a value as a JSON Blob for XHR request bodies. type string kept verbatim.
export function to_blob(obj: unknown): Blob {
  return new Blob([JSON.stringify(obj)], { type: 'application/json;charset=UTF-8' })
}

// --- Object.for (fill.js:158) ---
// Iterate own enumerable string-keyed entries in insertion order, calling
// callback(value, key, obj) (value-first, like Array.forEach). Order preservation is relied
// upon by callers (e.g. Views/comments.js).
export function objectFor(
  obj: Record<string, unknown>,
  callback: (value: unknown, key: string, obj: Record<string, unknown>) => void,
): void {
  for (const [key, value] of Object.entries(obj)) callback(value, key, obj)
}

// --- RegExp.prototype.rmatch (fill.js:164) ---
// Null-safe String.match with the arguments reversed (regex first). Returns [] instead of
// null on no match so destructuring never throws. The typeof guard is preserved from the
// original (callers historically could pass non-strings).
export function rmatch(re: RegExp, str: string): RegExpMatchArray | never[] {
  if (typeof str !== 'string') throw new TypeError('RegExp.rmatch() expects string')
  return String.prototype.match.call(str, re) || []
}

// --- Array.prototype.findLast (fill.js:125, polyfill) ---
// Return the last element for which filter is truthy, else undefined. Kept as a util for
// parity even though modern targets ship a native Array.prototype.findLast.
export function findLast<T>(
  a: readonly T[],
  filter: (value: T, index: number, array: readonly T[]) => unknown,
): T | undefined {
  for (let i = a.length - 1; i >= 0; i--) {
    if (filter(a[i], i, a)) return a[i]
  }
  return undefined
}

// --- number_list.from_query (input.js) ---
// `s.match(/[^,\s]+/g).map(Number)` (unguarded, as the original; throws on a
// truthy-but-matchless string, kept for parity), null when falsy. Used by the chatlogs
// redirect (routing/routes.ts) and CommentsView's form parsing.
export function nl_from_query(s: string): number[] | null {
  if (s) return s.match(/[^,\s]+/g)!.map((x) => Number(x))
  return null
}
// --- Generator.prototype.run (fill.js:94) ---
// The vanilla async/await replacement: drives a generator to completion as a coroutine. Each
// step exposes a resume function (obtained by the generator via `let STEP = yield`) which the
// generator hands to an async op (Lp.chain / setTimeout / doWhenReady) as a callback; calling
// STEP(value) resumes the generator with that value. The trampoline handles both synchronous
// and asynchronous resume through the `step` reassignment dance — ported character-for-character
// from the original destructuring-assignment form so the timing is identical. Returns the
// generator (callers keep it as an in-flight handle).
export function runGenerator(
  gen: Generator<unknown, unknown, unknown>,
  ok: (value: unknown) => void = console.info,
  err: (e: unknown) => void = (e) => {
    throw e
  },
): Generator<unknown, unknown, unknown> {
  let step!: (data: unknown) => void
  const main = (data: unknown): void => {
    step = (defer) => {
      ;[data, step] = [defer, main]
    }
    try {
      const r = gen.next(data)
      if (r.done) [data, step] = [r.value, ok]
    } catch (e) {
      ;[data, step] = [e, err]
    }
    step(data)
  }
  main(undefined)
  step((x: unknown) => step(x))
  return gen
}
