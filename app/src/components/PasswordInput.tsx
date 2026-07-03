// Presentational twin of Draw.password_input (draw.js:125-158). Emits `<password-input>` with
// either the "old" single-input layout (name, autocomplete=current-password) or the "new"
// two-input layout (name + name+"2", both autocomplete=new-password) wrapped in `<span class=COL>`.
// A 👁️ checkbox toggles the password field(s) between `type=password` and `type=text`. The
// inputs stay UNCONTROLLED (no value prop) so typed text is owned by the DOM and read by the
// uncontrolled Form system, exactly as the original mutated the live input elements.
import { useState } from 'react'

export function PasswordInput({
  name = 'password',
  nw = false,
}: {
  name?: string
  nw?: boolean
}): React.JSX.Element {
  // ev.target.checked ? 'text' : 'password' (draw.js:135-140), tracked as component state so the
  // toggle re-render swaps the input type without remounting (typed text survives).
  const [show, setShow] = useState(false)
  const type = show ? 'text' : 'password'
  const toggle = (
    <label title="Show Password">
      👁️
      <input type="checkbox" autoComplete="off" onChange={(ev) => setShow(ev.target.checked)} />
    </label>
  )
  if (nw)
    return (
      <password-input>
        <span className="COL">
          <input placeholder="new password" type={type} autoComplete="new-password" name={name} />
          <input placeholder="repeat" type={type} autoComplete="new-password" name={name + '2'} />
        </span>
        {toggle}
      </password-input>
    )
  return (
    <password-input>
      <input placeholder="password" type={type} autoComplete="current-password" name={name} />
      {toggle}
    </password-input>
  )
}
