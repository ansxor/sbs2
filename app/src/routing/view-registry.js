// null-prototype map (was `View.views = {__proto__: null}`) so a `location.type` of
// "constructor"/"__proto__"/etc. can never resolve to an inherited property.
const views = Object.create(null);
function is_redirect(mod) {
    return typeof mod.Redirect === 'function';
}
// view.js:157 — register a view (or a `{Redirect}` literal, as page.js:560 does) under a
// name. Validation mirrors the original's "tried to register invalid view" guard: a value
// is valid iff it is a redirect OR exposes both Start and Component.
export function register(name, mod) {
    if (!is_redirect(mod)) {
        const view = mod;
        if (typeof view.Start !== 'function' || !view.Component)
            throw new TypeError('tried to register invalid view');
    }
    views[name] = mod;
}
// view.js:169 — register a standalone redirect normalizer under a name.
export function register_redirect(name, mod) {
    views[name] = mod;
}
// view.js:173 — if a redirect is registered for `location.type`, run it. The original
// mutated `location` in place; we also accept a returned replacement location.
export function handle_redirect(location) {
    const mod = views[location.type];
    if (mod && is_redirect(mod)) {
        const next = mod.Redirect(location);
        if (next)
            return next;
    }
    return location;
}
// Resolver for the lifecycle engine (L5b): was `View.views[location.type]`. Returns the
// RouteModule for a type, or undefined if unknown or if the entry is a redirect.
export function get_view(type) {
    const mod = views[type];
    if (!mod || is_redirect(mod))
        return undefined;
    return mod;
}
