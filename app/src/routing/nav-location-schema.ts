// Zod schema for NavLocation (ARCHITECTURE §3 frozen contract, §6 routing).
//
// data/types.ts declares the NavLocation interface; this schema is its runtime mirror. parse_url
// (services/nav.ts) parses a slot-url string into a NavLocation and then asserts it against this
// schema — so a broken parse (regex change, unexpected input shape) fails loudly with a clear
// message instead of propagating a malformed location to view.Start/redirect handlers.
//
// The assertion runs on every parse_url call. In production the schema is still cheap (4 field
// checks); keeping it on catches real-world URL mutations that dev testing missed. If a perf
// concern ever materializes it can be gated to import.meta.env.DEV, but that trades safety for
// cycles — not done preemptively.
import { z } from 'zod'

export const NavLocationSchema = z.object({
  type: z.string(),
  id: z.union([z.number(), z.string(), z.null()]),
  query: z.record(z.string(), z.string()),
  fragment: z.union([z.string(), z.null()]),
})

export type NavLocationParsed = z.infer<typeof NavLocationSchema>
