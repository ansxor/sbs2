// referenced from https://12me21.github.io/taito-f3/website/link.js
let ql
~function self() {
	const dpr = +window.devicePixelRatio
	const s = document.documentElement.style
	let adpr = dpr > 0.75 ? dpr : 1
	s.setProperty('--X', adpr || 1) // device pixels per css pixel
	s.setProperty('--RX', Math.round(adpr) || 1) // rounded
	// refresh listener
	ql && ql.removeListener(self)
	ql = matchMedia("(-webkit-device-pixel-ratio: "+dpr+")")
	ql.addEventListener('change', self)
}()