// Room color generator for the All chat view (sbs2-cog).
//
// Generates a stable, deterministic color per room id using a hash → HSL
// function. The color is used for the vertical ribbon on message groups and
// for tab indicators. Colors are kept at a fixed saturation/lightness so they
// read as a cohesive palette rather than random noise.

import type * as React from 'react'
import type { Id } from '../data/types'

// fnv-1a 32-bit hash — small, fast, no dependencies.
function hash(id: number): number {
  let h = 0x811c9dc5
  // handle the id as a string so multi-digit ids differ more
  const str = String(id)
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// Returns a CSS color string, e.g. "hsl(120, 65%, 45%)".
export function roomColor(id: Id): string {
  const h = hash(id)
  const hue = h % 360
  // Fixed S/L for a cohesive palette — readable on both light and dark themes.
  const sat = 60
  const light = 42
  return `hsl(${hue}, ${sat}%, ${light}%)`
}

// A lighter variant for backgrounds / hover states.
export function roomColorBg(id: Id): string {
  const h = hash(id)
  const hue = h % 360
  return `hsl(${hue}, 45%, 90%)`
}

// Returns a React CSSProperties-compatible record with the --room-color variable.
export function roomColorStyle(id: Id): React.CSSProperties {
  const style: Record<string, string> = {}
  style['--room-color'] = roomColor(id)
  return style as React.CSSProperties
}
