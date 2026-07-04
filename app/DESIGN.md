---
version: alpha
name: SmileBASIC Source 2
aliases: [sbs2]
description: |
  A compact, information-dense forum/chat app for the SmileBASIC community.
  Built on a functional, color-coded foundation: high-contrast text, bright
  teal accents, and strong rectangular shapes. It favors keyboard navigation,
  visible focus outlines, and clear status indicators over decorative flair.
colors:
  # Core palette (light theme)
  primary: "#000000"
  secondary: "#333333"
  tertiary: "#009688"
  quaternary: "#045"
  neutral: "#FFFFFF"
  neutral-weak: "#F7F7F7"
  neutral-medium: "#EEEEEE"
  neutral-strong: "#808080"
  border: "#808080"
  dim: "#666666"
  link: "#045"
  link-hover: "#009688"
  link-visited: "#606"
  link-bg: "#E5E5FF"
  error: "#800000"
  error-bg: "#FFC0CB"
  warn: "#B8422E"
  success: "#094"
  info: "#089"
  # Accent backgrounds
  red-bg: "#FBC"
  orange-bg: "#FDA"
  yellow-bg: "#FF8"
  green-bg: "#BFA"
  blue-bg: "#CEF"
  purple-bg: "#DBF"
  gray-bg: "#DDD"
  # Status/chromatic
  online: "#3f9f5f"
  connecting: "#6fb7c0"
  pending: "#e0c87f"
  offline: "#f86060"
  focus: "#FF0000"
  focus-dark: "#B00"
  modified: "#B0F"
  edit: "goldenrod"
  edit-dark: "teal"
  # Inverted surfaces
  invert-bg: "#222222"
  invert-text: "#FFFFFF"
  invert-bg-light: "#333333"
  invert-bg-dark: "#111111"
  # Shared shadow color
  shadow: "#0000004D"

# Theme-specific tokens (not referenced by components, but documented for downstream tools)
# light-theme-* and dark-theme-* keys are retained for DTCG/Tailwind exports, even though the
# current app uses CSS custom properties and [data-theme] toggles rather than component tokens.
themes:
  light:
    primary: "#000000"
    secondary: "#333333"
    neutral: "#FFFFFF"
    neutral-weak: "#F7F7F7"
    neutral-medium: "#EEEEEE"
    border: "#808080"
    link: "#045"
    link-hover: "#009688"
    link-visited: "#606"
    link-bg: "#E5E5FF"
    error-bg: "#FFC0CB"
    dim: "#666666"
  dark:
    primary: "#FFFFFF"
    secondary: "#EEEEEE"
    neutral: "#292929"
    neutral-weak: "#444444"
    neutral-medium: "#555555"
    border: "#000000"
    link: "#9CE"
    link-hover: "#5CE"
    link-visited: "#C8F"
    link-bg: "#156"
    error-bg: "#800000"
    dim: "#666666"

typography:
  body:
    fontFamily: "Roboto, x-heart, system-ui, sans-serif, 'Apple Color Emoji', 'Twemoji Mozilla'"
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.2
  monospace:
    fontFamily: "'Cascadia Code', Consolas, monospace, 'Apple Color Emoji', 'Twemoji Mozilla'"
    fontSize: 0.8125rem
  h1:
    fontFamily: "Roboto, x-heart, system-ui, sans-serif, 'Apple Color Emoji', 'Twemoji Mozilla'"
    fontSize: 1.625rem
    fontWeight: 400
    lineHeight: 1.2
  small:
    fontFamily: "Roboto, x-heart, system-ui, sans-serif, 'Apple Color Emoji', 'Twemoji Mozilla'"
    fontSize: 0.875rem
    lineHeight: 1.2
  label:
    fontFamily: "Roboto, x-heart, system-ui, sans-serif, 'Apple Color Emoji', 'Twemoji Mozilla'"
    fontSize: 0.8125rem
    fontWeight: 500
  button:
    fontFamily: "Roboto, x-heart, system-ui, sans-serif, 'Apple Color Emoji', 'Twemoji Mozilla'"
    fontSize: 0.8125rem
    lineHeight: 1.2
  code:
    fontFamily: "'Cascadia Code', Consolas, monospace, 'Apple Color Emoji', 'Twemoji Mozilla'"
    fontSize: 12px
    lineHeight: 14px
    letterSpacing: "-0.5px"

rounded:
  none: 0px
  sm: 1px
  md: 3px
  lg: 5px
  full: 9999px

spacing:
  xs: 2px
  sm: 4px
  md: 8px
  lg: 16px
  xl: 24px
  xxl: 48px
  avatar: 52px
  bar-sm: 1.5625rem
  bar-md: 2.125rem
  bar-lg: 2.25rem
  bar-xl: 2.4375rem

shadows:
  normal: "0 2px 3px #0000004D"
  inset: "0px 1px 3px inset"
  focus: "inset 0 0 0 2px #878"

elevation:
  overlay: 25
  header: 4
  sticky: 4

components:
  button:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.none}"
    padding: "0 0.5rem"
    height: 1.5625rem
  button-hover:
    backgroundColor: "{colors.neutral-medium}"
    textColor: "{colors.primary}"
  button-selected:
    backgroundColor: "{colors.neutral-strong}"
    textColor: "{colors.primary}"
  button-disabled:
    backgroundColor: "{colors.neutral-strong}"
    textColor: "{colors.dim}"
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
  button-save-modified:
    backgroundColor: "{colors.modified}"
    textColor: "{colors.invert-text}"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: 2px
    height: 1.5625rem
  textarea:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.none}"
    padding: 0
  select:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: 2px
  tab:
    backgroundColor: "{colors.neutral-medium}"
    textColor: "{colors.invert-text}"
    rounded: "{rounded.md}"
  tab-active:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
  header:
    backgroundColor: "{colors.invert-bg}"
    textColor: "{colors.invert-text}"
  header-loading:
    backgroundColor: "{colors.info}"
  header-rendering:
    backgroundColor: "{colors.success}"
  header-error:
    backgroundColor: "{colors.error}"
    textColor: "#FDD"
  sidebar:
    backgroundColor: "{colors.neutral}"
  message-hover:
    backgroundColor: "{colors.neutral-medium}"
  message-focus:
    backgroundColor: "#E5FCFF"
  link:
    textColor: "{colors.link}"
  link-hover:
    textColor: "{colors.link-hover}"
  avatar:
    size: 52px
    backgroundColor: "{colors.neutral}"
---

## Overview

SmileBASIC Source 2 is a forum and chat client for a niche programming community.
Its UI is deliberately dense and keyboard-first: long pages of chat messages, compact
form tables, resizable panes, and a left sidebar that doubles as a status/debug panel.
The visual identity is functional rather than ornamental — every color and shape has a
job (status, focus, hierarchy, or action). The light theme is a clean white page with
black text and a teal accent; the dark theme swaps the page surface to near-black and
uses the same teal with brighter blues and purples to preserve contrast.

## Colors

- **Primary (`{colors.primary}`):** Main body text. Black in light mode, white in dark mode.
- **Secondary (`{colors.secondary}`):** Meta text, timestamps, dimmed content.
- **Tertiary (`{colors.tertiary}`):** The signature action color — teal (#009688). Used for
  input borders, button borders, focus states, and link hover.
- **Link (`{colors.link}`):** Dark blue (#045) for unvisited links; light blue in dark mode.
- **Neutral (`{colors.neutral}`):** Page background; white in light, near-black in dark.
- **Neutral-weak (`{colors.neutral-weak}`):** Box and alternate surface backgrounds.
- **Neutral-medium (`{colors.neutral-medium}`):** Bar backgrounds, hover states, separators.
- **Error / Warn / Success / Info:** Semantic colors for status headers, invalid inputs, and
  message feedback.
- **Accent backgrounds (`{colors.red-bg}`, `{colors.green-bg}`, etc.):** Soft, color-coded
  fills for tags, badges, and message emphasis.
- **Status (`{colors.online}`, `{colors.pending}`, `{colors.offline}`):** Applied to the
  sidebar-toggle border to indicate websocket health.

## Typography

Roboto is the single workhorse typeface. A custom `@font-face` named `x-heart` provides a
single glyph (U+16E6D), and the system emoji fonts serve as the last-resort fallback.
Code and preformatted blocks use Cascadia Code. Hierarchy is driven by size and weight,
not by family changes: body text is 1rem, small metadata is 0.875rem, labels are 0.8125rem,
monospace is 0.8125rem, and the large code editor area is 12px/14px line-height. No
letter-spacing adjustments are used.

## Layout

The layout is based on a fixed viewport: `html` and `body` fill the screen, overflow is
clipped, and the app is positioned with `position: fixed`. A flex-based `.ROW` / `.COL`
system handles most internal structure, with a few grid tables for forms. Spacing is in
multiples of 4px and rem units (2px, 4px, 8px, 16px, 24px). The chat gutter width is
`0.5rem + 52px + 0.5rem`, giving messages a clear avatar column. Bar heights are
standardized at 1.5625rem, 2.125rem, 2.25rem, and 2.4375rem.

## Elevation & Depth

Depth is communicated with a single soft shadow (`{shadows.normal}`) and z-index layers:
- Focus overlay: 25
- View header / userlist: 4
Most surfaces are flat and opaque; backgrounds are deliberately solid to improve
rendering performance and subpixel text.

## Shapes

Corners are intentionally sharp. Buttons, inputs, and textareas have zero or 1px radius.
Tabs are the only rounded shape (5px top radius). The app avoids large radii and pill
shapes except for circular avatar crops in future variants.

## Components

- **Button:** Sharp rectangular buttons with a 2px teal border and gradient background. Hover
  swaps to a cool gray gradient; selected/pressed uses a darker inset shadow.
- **Input / Textarea / Select:** 2px teal border, inherits body font, 0.875rem size. Textareas
  have no border-radius; selects have a thicker left border and slightly rounded left corners.
- **Tab list:** Dark bar (`databarbgcolor`) with pill-shaped tab tops. Inactive tabs are gray
  with white text; active tabs match the page background.
- **View header:** Dark bar with white text, shows loading/rendering/error states via
  background-color changes.
- **Sidebar:** A fixed, resizable left column containing the userlist, tabs, and debug log.
- **Message block:** Chat messages with an avatar gutter, username header, and stacked message
  parts. Hover and focus backgrounds give immediate feedback.
- **Link:** Plain text with no underline; hover adds underline and shifts to teal.
- **Avatar:** Default 52px square with a light background and a thin gray border. Pixel-art
  avatars are crisp-rendered.

## Do's and Don'ts

- **Do** keep the UI sharp and compact; the app is used for long reading and writing sessions.
- **Do** use teal (`{colors.tertiary}`) for interactive borders and hover feedback.
- **Do** provide a visible red focus outline (`{colors.focus}`) for keyboard navigation.
- **Do** preserve the light/dark theme pairings exactly; dark mode is not a simple inversion.
- **Don't** introduce rounded corners or large shadows for decoration; they conflict with the
  dense, utilitarian feel.
- **Don't** use colors outside the semantic/accent palette without adding them to the token map.
- **Don't** nest component variants. `button-hover` and `button-selected` are siblings, not children.
