// referenced from https://12me21.github.io/taito-f3/website/link.js
let ql
~function self() {
	const dpr = +window.devicePixelRatio
	// refresh listener*/
	ql && ql.removeListener(self)
	ql = matchMedia("(-webkit-device-pixel-ratio: "+dpr+")")
	ql.addEventListener('change', self)
	for (let img of document.querySelectorAll('.apx')) {
		recalc_image_scale(img)
	}
}()

function recalc_image_scale(img) {
	let dpr = +window.devicePixelRatio
	let resx = img.naturalWidth
	if (!resx)
		return
	let resy = img.naturalHeight
	
	let maxx = 50
	let maxy = 50
	
	let basex = resx / dpr
	let basey = resy / dpr
	let scalex = maxx / basex
	let scaley = maxy / basey
	let scale = Math.min(scalex, scaley)
	console.log(scale, basex, basey)
	if (scale >= 1) {
		img.classList.add("pixelAvatar")
		img.style.setProperty('--avatar-width', Math.floor(scale) * basex + "px")
		img.style.width = Math.floor(scale) * basex + "px"
		img.style.height = Math.floor(scale) * basey + "px"
	} else {
		img.classList.remove("pixelAvatar")
		img.style.width = ""
		img.style.height = ""
	}
}
