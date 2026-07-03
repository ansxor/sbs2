// L5a — view registry (ports view.js's `View.views` / `register` / `register_redirect`
// / `handle_redirect`; ARCHITECTURE §6/§10).
//
// The old `View` namespace mapped `location.type` → a BaseView subclass (or a `{Redirect}`
// literal). In the React port a "view" is a `RouteModule = { Start, Component }`; a redirect
// is a `{ Redirect(location) }` normalizer run before lookup (category→categories,
// page→pages, comments→chatlogs). The `Object.seal` / `prototype.Name` machinery is dropped
// (there is no BaseView), but the observable contract — register-by-name, resolve-by-type,
// mutate-in-place redirects — is preserved.
import type { ComponentType } from 'react'
import type { NavLocation, StartResult, ViewComponentProps } from '../data/types'

// The contract every view implements (§5b/§6): a Start() that returns the chain/quick
// descriptor, and a React Component rendered with the loaded data.
export interface RouteModule {
  Start(loc: NavLocation): StartResult
  Component: ComponentType<ViewComponentProps>
  opts?: Record<string, unknown>
}

// A redirect normalizes a location before lookup. The original `Redirect(location)` mutated
// `location` in place and returned nothing; the port additionally allows returning a fresh
// NavLocation (handle_redirect honors either).
export interface RedirectModule {
  Redirect(location: NavLocation): NavLocation | void
}

type RegisteredView = RouteModule | RedirectModule

// null-prototype map (was `View.views = {__proto__: null}`) so a `location.type` of
// "constructor"/"__proto__"/etc. can never resolve to an inherited property.
const views: Record<string, RegisteredView | undefined> = Object.create(null)

function is_redirect(mod: RegisteredView): mod is RedirectModule {
  return typeof (mod as RedirectModule).Redirect === 'function'
}

// view.js:157 — register a view (or a `{Redirect}` literal, as page.js:560 does) under a
// name. Validation mirrors the original's "tried to register invalid view" guard: a value
// is valid iff it is a redirect OR exposes both Start and Component.
export function register(name: string, mod: RouteModule | RedirectModule): void {
  if (!is_redirect(mod)) {
    const view = mod as RouteModule
    if (typeof view.Start !== 'function' || !view.Component)
      throw new TypeError('tried to register invalid view')
  }
  views[name] = mod
}

// view.js:169 — register a standalone redirect normalizer under a name.
export function register_redirect(name: string, mod: RedirectModule): void {
  views[name] = mod
}

// view.js:173 — if a redirect is registered for `location.type`, run it. The original
// mutated `location` in place; we also accept a returned replacement location.
export function handle_redirect(location: NavLocation): NavLocation {
  const mod = views[location.type]
  if (mod && is_redirect(mod)) {
    const next = mod.Redirect(location)
    if (next) return next
  }
  return location
}

// Resolver for the lifecycle engine (L5b): was `View.views[location.type]`. Returns the
// RouteModule for a type, or undefined if unknown or if the entry is a redirect.
export function get_view(type: string): RouteModule | undefined {
  const mod = views[type]
  if (!mod || is_redirect(mod)) return undefined
  return mod
}
