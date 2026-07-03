// JSX intrinsic declarations for every custom-element tag the chrome emits (ARCHITECTURE
// §11/§12). Each accepts the full set of HTML attributes plus ref/key; `data-*`/`aria-*`
// attributes are permitted by TS's JSX checker (hyphenated names bypass excess-prop
// checking), so `$`-prefixed ids and `data-*` state attributes need no special typing.

import type * as React from 'react'

// Custom elements (any tag with a dash) do NOT get React's className→class
// mapping — React passes unknown props through verbatim, so `className` lands as a
// literal `classname` attribute the reused CSS never matches. Omit `className` here
// (so tsc flags every bad usage) and add `class` as the correct prop name.
type CustomElementProps = Omit<
  React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>,
  'className'
> & {
  class?: string
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'view-slot': CustomElementProps
      'view-header': CustomElementProps
      'view-root': CustomElementProps
      'not-sidebar': CustomElementProps
      'sidebar-container': CustomElementProps
      'tab-list': CustomElementProps
      'message-list': CustomElementProps
      'message-block': CustomElementProps
      'message-header': CustomElementProps
      'message-part': CustomElementProps
      'message-controls': CustomElementProps
      'reply-block': CustomElementProps
      'entity-label': CustomElementProps
      'password-input': CustomElementProps
      'scroll-outer': CustomElementProps
      'scroll-inner': CustomElementProps
      'scroll-middle': CustomElementProps
      'auto-scroller': CustomElementProps
      'form-table': CustomElementProps
      'resize-handle': CustomElementProps
      'textarea-container': CustomElementProps
    }
  }
}
