// L2/L8 — "own user avatar loaded" notifier.
// Was in boot/bootstrap.ts (main.js:47 `do_when_ready(()=>Sidebar.redraw_my_avatar())`).
// Sidebar subscribes; boot fires it once the me-chain resolves.
const meAvatarListeners = new Set<() => void>()

export function onMeAvatar(cb: () => void): () => void {
  meAvatarListeners.add(cb)
  return () => {
    meAvatarListeners.delete(cb)
  }
}

export function fireMeAvatar(): void {
  for (const cb of meAvatarListeners) cb()
}
