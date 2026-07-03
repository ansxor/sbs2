import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// L7g — AccountView route (ports src/Views/account.js). A quick (no-fetch) view: a
// change-password form plus a "log out all sessions" button. Near-stateless — the password
// inputs stay uncontrolled DOM (owned by <PasswordInput>) and are read by field name on submit,
// exactly as the original read ev.target.password / new_password / new_password2 off the live
// form. `method=dialog` + preventDefault fully suppress native submission (as in the original).
//
// Preserved quirks (behavior parity, per ARCHITECTURE §6.3 traps 13/14):
//   - console.log('passwording', opw, pw1) leaks the plaintext passwords (account.js:34) — kept.
//   - Nav.reload() is the global RELOAD() (navigate.js:370 → index.html) — called on success.
import { useLayoutEffect } from 'react';
import { register } from '../routing/view-registry';
import { PasswordInput } from '../components/PasswordInput';
import { Req } from '../services/request';
// account.js:4 — Start always returns {quick:true} (no request; the framework renders immediately).
function Start() {
    return { quick: true };
}
function AccountComponent({ header }) {
    // Quick(): this.Slot.set_title("Account") (account.js:48). A quick view has no data phase, so
    // populate the (per-nav-cleared) header on mount.
    useLayoutEffect(() => {
        header.set_title('Account');
    }, [header]);
    // $logout_all.onclick (account.js:14).
    const logout_all = () => {
        Req.request('User/invalidateall', null, null).do = (_resp, err) => {
            if (err) {
                alert('❌ invalidate failed\n' + err);
            }
            else {
                RELOAD();
            }
        };
    };
    // $form.onsubmit (account.js:23). Read the uncontrolled fields by name off the submitted form.
    const on_submit = (ev) => {
        ev.preventDefault();
        const fields = ev.currentTarget.elements;
        const old_field = fields.namedItem('password');
        const new_field1 = fields.namedItem('new_password');
        const new_field2 = fields.namedItem('new_password2');
        const opw = old_field.value;
        const pw1 = new_field1.value;
        const pw2 = new_field2.value;
        if (pw1 !== pw2) {
            alert("❌ passwords don't match");
            new_field1.value = '';
            new_field2.value = '';
            return;
        }
        // account.js:34 — plaintext password leak, kept for zero-behavior-change parity.
        console.log('passwording', opw, pw1);
        Req.request('User/privatedata', null, {
            currentPassword: opw,
            password: pw1,
        }).do = (_resp, err) => {
            if (err) {
                alert('❌ password change failed\n' + err);
            }
            else {
                RELOAD();
            }
        };
    };
    // account.js:54-75 template. The label divs carry a "…: " (&nbsp;) prefix and the password
    // inputs are appended AFTER it (the original ran $old_password.append(Draw.password_input(...))).
    return (_jsxs("view-root", { children: [_jsxs("div", { className: "registerBox", children: [_jsx("h2", { children: "Change Password" }), _jsxs("form", { method: "dialog", autoComplete: "off", onSubmit: on_submit, children: [_jsxs("div", { className: "ROW", children: ['current password: ', _jsx(PasswordInput, { name: "password" })] }), _jsx("br", {}), _jsxs("div", { className: "ROW", children: ['new password: ', _jsx(PasswordInput, { name: "new_password", nw: true })] }), _jsx("br", {}), _jsx("button", { children: "Change Password" })] })] }), _jsx("hr", {}), _jsx("div", { className: "registerBox", children: _jsx("button", { onClick: logout_all, children: "Log out all sessions" }) })] }));
}
// account.js:77 — View.register('account', AccountView). Self-registers on import (the L8 shell
// imports this module for its side effect), matching the original module-load registration.
export const AccountView = {
    Start,
    Component: AccountComponent,
};
register('account', AccountView);
