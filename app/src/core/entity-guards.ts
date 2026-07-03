// Entity-scoped runtime guards ported from src/fill.js's STRICT proxy + NO_CONVERT trap +
// FieldError. The vanilla app installed these on Object.prototype APP-WIDE (wiping the
// prototype and trapping Symbol.toPrimitive for every plain object). That is deliberately NOT
// reproduced — a global prototype wipe breaks React internals and any bundled code that
// legitimately coerces objects (ARCHITECTURE §4). Instead the identical observable behavior —
// entities throw on unknown-field read/write and on coercion (`"" + entity`) — is applied ONLY
// to entity prototypes via applyEntityGuards(proto), called by data/entity.ts.

// --- Error.prototype.trim_stack (fill.js:32) ---
// On V8 (Error.captureStackTrace exists) do nothing; otherwise strip `levels + 1` leading
// lines from the stack. Used internally by FieldError.
function trim_stack(err: Error, levels = 1): void {
  if ((Error as { captureStackTrace?: unknown }).captureStackTrace) return
  while (levels-- > -1) err.stack = err.stack!.replace(/^.*\n/, '')
}

// --- FieldError (fill.js:39) ---
// Thrown by STRICT and NO_CONVERT. Stashes its extra args on the static `last` debug
// side-channel, exactly as the original.
export class FieldError extends Error {
  static last: unknown[] | undefined
  constructor(message: string, ...args: unknown[]) {
    super()
    trim_stack(this, 1)
    this.message = message
    FieldError.last = args
  }
}
FieldError.prototype.name = 'FieldError'

// --- field_name (fill.js:52) ---
function field_name(name: string | symbol): string {
  if (typeof name !== 'string') return `[${String(name)}]`
  return `.${name}`
}

// --- STRICT (fill.js:57) ---
// A prototype object that throws FieldError on read or write of any property. Placed at the
// root of the entity prototype chain so unknown fields fault loudly instead of yielding
// undefined.
const STRICT: object = new Proxy(Object.create(null) as object, {
  get(_t, name, obj) {
    const n = field_name(name)
    throw new FieldError(`🚮 invalid field read: ${n}`, obj, `⛔${n}`)
  },
  set(_t, name, value, obj) {
    const n = field_name(name)
    throw new FieldError(`🚮 invalid field write: ${n}`, obj, `⛔${n} =`, value)
  },
})

// --- NO_CONVERT (fill.js:76) ---
// A Symbol.toPrimitive implementation that throws instead of yielding "[object Object]"/NaN.
function NO_CONVERT(this: unknown, hint: string): never {
  let type = hint
  if (type === 'default') type = 'primitive'
  throw new FieldError('🚮 invalid type conversion', this, '⛔ to ' + type)
}

// --- applyEntityGuards(proto) ---
// Reproduces the vanilla `BaseEntity.prototype = Object.create(STRICT, { [Symbol.toPrimitive]:
// {value: NO_CONVERT} })` (entity.js:89-91) as an in-place mutation of the given prototype:
// makes STRICT its [[Prototype]] (unknown-field reads/writes throw) and installs the
// non-enumerable, configurable toPrimitive trap. Applied to the root entity prototype.
export function applyEntityGuards(proto: object): void {
  Object.setPrototypeOf(proto, STRICT)
  Object.defineProperty(proto, Symbol.toPrimitive, {
    value: NO_CONVERT,
    configurable: true,
  })
}
