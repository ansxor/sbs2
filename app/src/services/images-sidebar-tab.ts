// Sidebar-tab bridge for ImagesView (ARCHITECTURE §6 sink pattern).
//
// The old ImagesView reached `Sidebar.tabs.select('file')`. Sidebar is a higher layer (L8) not
// present in ImagesView's layer, so a no-op sink is injected and Sidebar registers the real
// selector at mount — mirroring request.ts's setSidebarTabSelect / FilePanel's showInSidebar.
//
// This sink holder is split out from ImagesView so Sidebar (always loaded at boot) does not need
// to import ImagesView (now lazy-loaded) just to register the selector. ImagesView imports and
// calls `selectImagesSidebarTab`; Sidebar imports and calls `setImagesSidebarTabSelect`.

let selector: (name: string) => void = () => {}

export function setImagesSidebarTabSelect(fn: (name: string) => void): void {
  selector = fn
}

export function selectImagesSidebarTab(name: string): void {
  selector(name)
}
