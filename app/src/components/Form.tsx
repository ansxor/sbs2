// L6d — src/input.js ported. A declarative form/input widget system (`Form` + `INPUTS`
// registry) built as a <form-table> grid of typed inputs. Ported UNCONTROLLED (ARCHITECTURE
// §9): every input keeps a JS-typed in-memory `value` (the source of truth) separate from the
// DOM element's string value. `read()` pulls DOM→value, `write()` pushes value→DOM, and these
// are NEVER automatic — `attach_onchange()` always returns null (this.auto is never set), so DOM
// `change` events do not sync into `value`. Callers must `read()` before `get()`/`to_query()`.
//
// Only two callers exist (both L7): FileUploader (upload.js) and CommentsView (comments.js).
//
// React only mounts the container: `useForm(spec)` builds the imperative controller (a near-
// verbatim port of `class Form`) and returns it as a ref-stable handle; `<Form handle={...}/>`
// renders the <form-table> host and moves the pre-built children into it. React never diffs
// inside the form-table. The flat grid child ordering (label div + field element, no per-field
// wrapper) is preserved exactly or the CSS grid (layout.css) breaks.

import { useLayoutEffect, useRef } from 'react'

// ---- value types (per input) ----

export interface RangeValue {
  min?: number | null
  max?: number | null
  ids?: number[]
}

// select options may be arbitrary scalars (upload uses [null, 2, 4, ...]).
export type InputValue =
  | string
  | number
  | boolean
  | Date
  | number[]
  | string[]
  | RangeValue
  | null

// ---- field spec ----

export interface FieldOpt {
  label?: string
  param?: string
  span?: boolean
  default?: InputValue
  onchange?: (value: InputValue) => void
  placeholder?: string
  // select
  options?: InputValue[]
  option_labels?: string[]
  allow_extra?: boolean
  // text
  confirm?: boolean
  type?: string
  // date
  date_shortcuts?: boolean
}

export type FormField = [name: string, type: FieldType, opt: FieldOpt]

export interface FormSpec {
  fields: FormField[]
}

// ---- public handle contract (frozen: read/write/get/set/set_some/to_query/from_query, element).
// FormController is a superset (adds `inputs`, `reset`, `destroy`, `mount`, `unmount`). ----

export interface FormHandle {
  read(): void
  write(): void
  get(): Record<string, InputValue>
  set(data: Record<string, InputValue | undefined>): void
  set_some(data: Record<string, InputValue | undefined>): void
  to_query(): Record<string, string>
  from_query(query: Record<string, string>): void
  reset(): void
  readonly element: HTMLElement
  readonly inputs: Record<string, GenericInput>
}

// fill.js:164 — safe .match returning [] on no match (destructuring never throws).
function rmatch(re: RegExp, str: string): RegExpMatchArray | never[] {
  if (typeof str != 'string') throw new TypeError('RegExp.rmatch() expects string')
  return str.match(re) || []
}

// ---- GenericInput (base) ----

abstract class GenericInput {
  static html_id = 0
  static unique_id(): string {
    this.html_id++
    return 'input-' + this.html_id
  }

  p: FieldOpt
  name!: string
  html_id: string
  default: InputValue | undefined
  private _value: InputValue = null
  // never assigned anywhere → attach_onchange() always returns null (kept quirk).
  auto?: boolean
  // used by GenericInput.toString / text draw
  type?: string
  // word_list draw writes here instead of input.placeholder (kept quirk)
  placeholder?: string
  output?: boolean
  elem!: HTMLElement

  constructor(p: FieldOpt) {
    this.p = p
    this.value = p.default
    this.default = p.default
    this.html_id = GenericInput.unique_id()
  }

  abstract draw(): void
  abstract read(): void
  abstract write(): void

  // select/word_list/output do not override these; calling them throws (as in the original,
  // where the method is simply undefined). Only ever reached for inputs with a truthy p.param,
  // which none of those types have — so this is never hit in practice.
  to_query(): string | null {
    throw new TypeError('input.to_query is not a function')
  }
  from_query(_s: string): void {
    throw new TypeError('input.from_query is not a function')
  }

  toString(): string {
    return `Input.${this.type}()`
  }

  attach_onchange(): ((e: Event) => void) | null {
    if (!this.auto) return null
    return () => {
      this.read()
      if (this.p.onchange) this.p.onchange(this.value)
    }
  }

  reset(): void {
    if (this.default === undefined) this._value = null
    else this._value = this.default
  }

  get value(): InputValue {
    return this._value
  }
  set value(v: InputValue | undefined) {
    if (v === undefined) this.reset()
    else this._value = v
  }
}

function elem(x: string): HTMLElement {
  return document.createElement(x)
}

// ---- input registry ----

class SelectInput extends GenericInput {
  options!: InputValue[]
  allow_extra: boolean | undefined
  input!: HTMLSelectElement
  extra_option!: HTMLOptionElement
  extra_value: InputValue = null

  constructor(p: FieldOpt) {
    super(p)
    this.options = p.options!
    this.allow_extra = p.allow_extra
  }
  override draw(): void {
    this.elem = this.input = document.createElement('select')
    this.input.onchange = this.attach_onchange()
    this.input.id = this.html_id
    function option(value: string, label: string): HTMLOptionElement {
      const o = document.createElement('option')
      o.value = value
      o.append(label)
      return o
    }
    const labels = this.p.option_labels || (this.options as unknown as string[])
    this.input.append(...labels.map((label, i) => option(String(i), label as unknown as string)))
    this.extra_option = option('extra', '')
  }
  override read(): void {
    const raw = this.input.value
    if (raw == 'extra') {
      this.value = this.extra_value
      return
    } else {
      const v = (raw as unknown as number) | 0
      if (v >= 0 && v < this.options.length) {
        this.value = this.options[v]!
        return
      }
    }
    this.value = this.default
  }
  override write(): void {
    const v = this.value
    const i = this.options.indexOf(v)
    if (i >= 0) {
      this.extra_option.remove()
      this.input.value = String(i)
    } else {
      this.extra_value = v
      try {
        this.extra_option.textContent = 'Unknown value: ' + v
      } catch (e) {
        print('input dropdown error invalid value??', e)
        this.extra_option.textContent = 'Unknown value: ???'
      }
      this.input.append(this.extra_option)
      this.input.value = 'extra'
    }
  }
}

class CheckboxInput extends GenericInput {
  input!: HTMLInputElement
  override draw(): void {
    this.elem = this.input = document.createElement('input')
    this.input.id = this.html_id
    this.input.type = 'checkbox'
    this.input.onchange = this.attach_onchange()
  }
  override read(): void {
    this.value = this.input.checked
  }
  override write(): void {
    this.input.checked = this.value as boolean
  }
  override to_query(): string | null {
    return this.value ? '' : null
  }
  override from_query(s: string): void {
    this.value = s != null
  }
}

class TextInput extends GenericInput {
  confirm: boolean | undefined
  input!: HTMLInputElement
  input2!: HTMLInputElement
  constructor(p: FieldOpt) {
    super(p)
    this.confirm = p.confirm
    this.type = p.type
  }
  override draw(): void {
    this.elem = this.input = elem('input') as HTMLInputElement
    this.input.id = this.html_id
    this.input.placeholder = 'text'
    if (this.type == 'password') this.input.type = 'password'
    else if (this.type == 'email') this.input.type = 'email'
    this.input.onchange = this.attach_onchange()
    if (this.confirm == true) {
      this.confirm = true
      this.elem = document.createElement('div')
      this.input2 = elem('input') as HTMLInputElement
      this.input2.placeholder = '(repeat)'
      this.input2.type = this.input.type
      this.input2.onchange = this.input.onchange
      this.elem.append(this.input, this.input2)
    }
  }
  override read(): void {
    let v: string | null = this.input.value
    if (this.confirm) {
      if (v != this.input2.value) v = null
    }
    if (v == '') v = null
    this.value = v
  }
  override write(): void {
    this.input.value = (this.value as string) || ''
    if (this.confirm) this.input2.value = ''
  }
  override to_query(): string | null {
    return this.value as string | null
  }
  override from_query(s: string): void {
    this.value = s
  }
}

class RangeInput extends GenericInput {
  input!: HTMLInputElement
  override draw(): void {
    this.elem = this.input = elem('input') as HTMLInputElement
    this.input.id = this.html_id
    this.input.placeholder = 'min-max or id list'
    this.input.onchange = this.attach_onchange()
  }
  decode(x: string | null): void {
    if (x == '' || x == null) {
      this.value = null
      return
    }
    const [match, min, max] = rmatch(/^(\d*)-(\d*)$/, x)
    if (match) {
      this.value = {
        min: min ? Number(min) : null,
        max: max ? Number(max) : null,
      }
    } else {
      this.value = { ids: x.split(',').map((y) => Number(y)) }
    }
  }
  encode(): string | null {
    const x = this.value as RangeValue | null
    if (x == null) return null
    if (x.ids != null) return x.ids.join(',')
    if (x.min != null && x.max != null) return `${x.min}-${x.max}`
    if (x.min != null) return `${x.min}-`
    if (x.max != null) return `0-${x.max}`
    return null
  }
  override read(): void {
    this.decode(this.input.value)
  }
  override write(): void {
    this.input.value = this.encode() || ''
  }
  override to_query(): string | null {
    return this.encode()
  }
  override from_query(s: string): void {
    this.decode(s)
  }
}

class TextareaInput extends GenericInput {
  input!: HTMLTextAreaElement
  override draw(): void {
    this.elem = this.input = elem('textarea') as HTMLTextAreaElement
    this.input.id = this.html_id
    this.input.onchange = this.attach_onchange()
  }
  // NO-OP quirk kept: reads this.value (in-memory), NOT this.input.value.
  override read(): void {
    let v = this.value as string | null
    if (v == '') v = null
    this.value = v
  }
  override write(): void {
    this.input.value = (this.value as string) || ''
  }
  override to_query(): string | null {
    return this.value as string | null
  }
  override from_query(s: string): void {
    this.value = s
  }
}

class NumberInput extends GenericInput {
  input!: HTMLInputElement
  override draw(): void {
    this.elem = this.input = elem('input') as HTMLInputElement
    this.input.id = this.html_id
    this.input.type = 'number'
    this.input.onchange = this.attach_onchange()
  }
  override read(): void {
    this.value = this.input.value == '' ? null : Number(this.input.value)
  }
  override write(): void {
    this.input.value = this.value == null ? '' : String(this.value)
  }
  override to_query(): string | null {
    return this.value == null ? null : String(this.value)
  }
  override from_query(s: string): void {
    this.value = s == null ? null : Number(s)
  }
}

class NumberListInput extends GenericInput {
  input!: HTMLInputElement
  override draw(): void {
    this.elem = this.input = elem('input') as HTMLInputElement
    this.input.id = this.html_id
    this.input.pattern = ' *(\\d+( *[, ] *\\d+)*)? *'
    this.input.placeholder = 'list of numbers'
    this.input.onchange = this.attach_onchange()
  }
  override read(): void {
    const m = this.input.value.match(/[^,\s]+/g)
    if (m) this.value = m.map((x) => Number(x))
    else this.value = null
  }
  override write(): void {
    if (this.value == null) this.input.value = ''
    else this.input.value = (this.value as number[]).join(',')
  }
  override to_query(): string | null {
    return this.value ? (this.value as number[]).join(',') : null
  }
  override from_query(s: string): void {
    if (s) this.value = s.match(/[^,\s]+/g)!.map((x) => Number(x))
    else this.value = null
  }
}

class WordListInput extends GenericInput {
  input!: HTMLInputElement
  override draw(): void {
    this.elem = this.input = elem('input') as HTMLInputElement
    this.input.id = this.html_id
    // quirk: sets this.placeholder (dead) instead of this.input.placeholder
    this.placeholder = 'list of words'
    this.input.onchange = this.attach_onchange()
  }
  override read(): void {
    const words = this.input.value.match(/[^\s]+/g)
    this.value = words
  }
  override write(): void {
    this.input.value = this.value == null ? '' : (this.value as string[]).join(' ')
  }
}

class DateInput extends GenericInput {
  shortcuts: boolean
  input1!: HTMLInputElement
  input2!: HTMLInputElement
  constructor(p: FieldOpt) {
    super(p)
    this.shortcuts = !!p.date_shortcuts
  }
  override draw(): void {
    this.elem = elem('div')

    this.input1 = elem('input') as HTMLInputElement
    this.input1.id = this.html_id
    this.input1.type = 'date'
    this.elem.append(this.input1)

    this.input2 = elem('input') as HTMLInputElement
    this.input2.type = 'time'
    this.elem.append(this.input2)

    const oc = (this.input2.onchange = this.input1.onchange = this.attach_onchange())
    if (this.shortcuts) {
      // HACK
      for (const [label, prop] of [
        ['−1y', 'FullYear'],
        ['−1mo', 'Month'],
      ] as const) {
        const btn = elem('button') as HTMLButtonElement
        btn.type = 'button'
        btn.textContent = label
        btn.onclick = (ev) => {
          const old = this.value
          this.read()
          if (!this.value) this.value = new Date()
          const d = this.value as Date
          if (prop === 'FullYear') d.setFullYear(d.getFullYear() - 1)
          else d.setMonth(d.getMonth() - 1)
          this.write()
          this.value = old
          oc && oc(ev)
        }
        this.elem.append(btn)
      }
    }
  }
  override read(): void {
    // local time (cannot use valueAsNumber/valueAsDate — those read UTC)
    const [m1, year, month, day] = rmatch(/(\d+)-(\d+)-(\d+)/, this.input1.value)
    if (!m1) {
      this.value = null
    } else {
      const t = rmatch(/(\d+):(\d+)(?::([\d.]+))?/, this.input2.value)
      let hour: string | number | undefined = t[1]
      let minute: string | number | undefined = t[2]
      let second: string | number | undefined = t[3]
      if (!t[0]) hour = minute = second = 0
      this.value = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Math.floor(Number(second) || 0),
      )
    }
  }
  override write(): void {
    const v = this.value as Date | null
    let date = '',
      time = ''
    function str(x: number, len = 2): string {
      return String(x).padStart(len, '0')
    }
    if (v) {
      date = str(v.getFullYear(), 4) + '-' + str(v.getMonth() + 1) + '-' + str(v.getDate())
      time = str(v.getHours()) + ':' + str(v.getMinutes())
    }
    this.input1.value = date
    this.input2.value = time
  }
  override to_query(): string | null {
    return this.value ? (this.value as Date).toISOString() : null
  }
  override from_query(s: string): void {
    if (s) this.value = new Date(s)
    else this.value = null
  }
}

class OutputInput extends GenericInput {
  input!: HTMLOutputElement
  constructor(p: FieldOpt) {
    super(p)
    this.output = true
  }
  override draw(): void {
    this.input = elem('output') as HTMLOutputElement
    this.elem = this.input
  }
  override write(): void {
    this.input.value = (this.value as string) || ''
  }
  override read(): void {
    // useless
    this.value = this.input.value || null
  }
}

const INPUTS = {
  select: SelectInput,
  checkbox: CheckboxInput,
  text: TextInput,
  range: RangeInput,
  textarea: TextareaInput,
  number: NumberInput,
  number_list: NumberListInput,
  word_list: WordListInput,
  date: DateInput,
  output: OutputInput,
} satisfies Record<string, new (opt: FieldOpt) => GenericInput>

export type FieldType = keyof typeof INPUTS

// ---- Form controller (port of `class Form`) ----

class FormController implements FormHandle {
  inputs: Record<string, GenericInput>
  elem: HTMLElement

  constructor(p: FormSpec) {
    this.inputs = Object.create(null) as Record<string, GenericInput>

    this.elem = document.createElement('form-table')
    const body = this.elem

    for (const [name, type, opt] of p.fields) {
      const Ctor = INPUTS[type] as new (opt: FieldOpt) => GenericInput
      const input = new Ctor(opt)
      input.name = name
      this.inputs[name] = input
      input.draw()

      const lc = document.createElement('div')
      lc.className = 'label'
      body.append(lc)
      const label = document.createElement('label')
      lc.append(label)
      label.htmlFor = input.html_id
      label.textContent = (opt.label as string) + ':'
      input.elem.className += ' field'
      if (opt.span) {
        lc.className += ' wide'
        input.elem.className += ' wide'
      }
      body.append(input.elem)
    }
  }

  get element(): HTMLElement {
    return this.elem
  }

  private each(fn: (input: GenericInput, name: string) => void): void {
    for (const [name, input] of Object.entries(this.inputs)) fn(input, name)
  }

  destroy(): void {
    this.elem.replaceChildren()
  }
  reset(): void {
    this.each((input) => {
      input.reset()
      input.write()
    })
  }
  read(): void {
    this.each((input) => input.read())
  }
  write(): void {
    this.each((input) => input.write())
  }
  get(): Record<string, InputValue> {
    const a: Record<string, InputValue> = {}
    this.each((input, name) => {
      a[name] = input.value
    })
    return a
  }
  set(data: Record<string, InputValue | undefined>): void {
    this.each((input, name) => {
      input.value = data[name]
    })
  }
  set_some(data: Record<string, InputValue | undefined>): void {
    this.each((input, name) => {
      const value = data[name]
      if (value !== undefined) input.value = value
    })
  }
  to_query(): Record<string, string> {
    const params: Record<string, string> = {}
    this.each((input) => {
      const key = input.p.param
      if (key) {
        const q = input.to_query()
        if (q != null) params[key] = q
      }
    })
    return params
  }
  from_query(query: Record<string, string>): void {
    this.each((input) => {
      const key = input.p.param
      if (key) {
        const value = query[key]
        if (value !== undefined) input.from_query(value)
        else input.reset()
      }
    })
  }

  // --- island mount (not part of the frozen handle) ---
  mount(host: HTMLElement): void {
    const src = this.elem
    while (src.firstChild) host.appendChild(src.firstChild)
    this.elem = host
  }
  unmount(): void {
    const host = this.elem
    const detached = document.createElement('form-table')
    while (host.firstChild) detached.appendChild(host.firstChild)
    this.elem = detached
  }
}

// ---- React surface ----

/**
 * Build the imperative form controller once and keep it ref-stable across re-renders (the inputs
 * hold the source-of-truth values; recreating would lose them). Returns the frozen handle plus
 * the superset used by the two L7 callers (direct `inputs` access, `reset`/`destroy`).
 */
export function useForm(spec: FormSpec): FormController {
  const ref = useRef<FormController | null>(null)
  if (ref.current === null) ref.current = new FormController(spec)
  return ref.current
}

export interface FormProps {
  handle: FormController
}

/**
 * Renders the <form-table> host and hands its interior to the controller (island pattern). React
 * never diffs inside it, so the flat label-div/field-element child ordering is preserved exactly.
 */
export function Form({ handle }: FormProps): React.JSX.Element {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const host = ref.current
    if (!host) return
    handle.mount(host)
    return () => {
      handle.unmount()
    }
  }, [handle])
  return <form-table ref={ref} />
}
