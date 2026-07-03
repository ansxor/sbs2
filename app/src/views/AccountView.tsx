// L7g — AccountView route (ports src/Views/account.js). A quick (no-fetch) view: a
// change-password form plus a "log out all sessions" button. Near-stateless — the password
// inputs stay uncontrolled DOM (owned by <PasswordInput>) and are read by field name on submit,
// exactly as the original read ev.target.password / new_password / new_password2 off the live
// form. `method=dialog` + preventDefault fully suppress native submission (as in the original).
//
// Preserved quirks (behavior parity, per ARCHITECTURE §6.3 traps 13/14):
//   - console.log('passwording', opw, pw1) leaks the plaintext passwords (account.js:34) — kept.
//   - Nav.reload() is the global RELOAD() (navigate.js:370 → index.html) — called on success.
import { useLayoutEffect } from 'react'
import type { StartResult, ViewComponentProps } from '../data/types'
import type { RouteModule } from '../routing/view-registry'
import { register } from '../routing/view-registry'
import { PasswordInput } from '../components/PasswordInput'
import { Req } from '../services/request'

// account.js:4 — Start always returns {quick:true} (no request; the framework renders immediately).
function Start(): StartResult {
  return { quick: true }
}

function AccountComponent({ header }: ViewComponentProps): React.JSX.Element {
  // Quick(): this.Slot.set_title("Account") (account.js:48). A quick view has no data phase, so
  // populate the (per-nav-cleared) header on mount.
  useLayoutEffect(() => {
    header.set_title('Account')
  }, [header])

  // $logout_all.onclick (account.js:14).
  const logout_all = (): void => {
    Req.request('User/invalidateall', null, null).do = (_resp, err) => {
      if (err) {
        alert('❌ invalidate failed\n' + err)
      } else {
        RELOAD()
      }
    }
  }

  // $form.onsubmit (account.js:23). Read the uncontrolled fields by name off the submitted form.
  const on_submit = (ev: React.FormEvent<HTMLFormElement>): void => {
    ev.preventDefault()
    const fields = ev.currentTarget.elements
    const old_field = fields.namedItem('password') as HTMLInputElement
    const new_field1 = fields.namedItem('new_password') as HTMLInputElement
    const new_field2 = fields.namedItem('new_password2') as HTMLInputElement
    const opw = old_field.value
    const pw1 = new_field1.value
    const pw2 = new_field2.value
    if (pw1 !== pw2) {
      alert("❌ passwords don't match")
      new_field1.value = ''
      new_field2.value = ''
      return
    }
    // account.js:34 — plaintext password leak, kept for zero-behavior-change parity.
    console.log('passwording', opw, pw1)
    Req.request('User/privatedata', null, {
      currentPassword: opw,
      password: pw1,
    }).do = (_resp, err) => {
      if (err) {
        alert('❌ password change failed\n' + err)
      } else {
        RELOAD()
      }
    }
  }

  // account.js:54-75 template. The label divs carry a "…: " (&nbsp;) prefix and the password
  // inputs are appended AFTER it (the original ran $old_password.append(Draw.password_input(...))).
  return (
    <view-root>
      <div className="registerBox">
        <h2>Change Password</h2>
        <form method="dialog" autoComplete="off" onSubmit={on_submit}>
          <div className="ROW">
            {'current password: '}
            <PasswordInput name="password" />
          </div>
          <br />
          <div className="ROW">
            {'new password: '}
            <PasswordInput name="new_password" nw />
          </div>
          <br />
          <button>Change Password</button>
        </form>
      </div>
      <hr />
      <div className="registerBox">
        <button onClick={logout_all}>Log out all sessions</button>
      </div>
    </view-root>
  )
}

// account.js:77 — View.register('account', AccountView). Self-registers on import (the L8 shell
// imports this module for its side effect), matching the original module-load registration.
export const AccountView: RouteModule = {
  Start,
  Component: AccountComponent,
}

register('account', AccountView)
