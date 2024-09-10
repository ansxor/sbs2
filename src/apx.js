// referenced from https://12me21.github.io/taito-f3/website/link.js
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
	//console.log(scale, basex, basey)
	if (scale >= 1) {
		img.classList.add('pixelAvatar')
		img.style.setProperty('--avatar-width', Math.floor(scale) * basex + "px")
		img.style.width = Math.floor(scale) * basex + "px"
		img.style.height = Math.floor(scale) * basey + "px"
		// why do we set 3 properties instead of just a --w and --h ?
	} else {
		img.classList.remove('pixelAvatar')
		img.style.width = ""
		img.style.height = ""
	}
}

const Apx = function(){
	let ql = null
	const cycle = ()=>{
		const dpr = +window.devicePixelRatio
		// refresh listener*/
		ql && ql.removeListener(cycle)
		ql = matchMedia("(-webkit-device-pixel-ratio: "+dpr+")")
		ql.addEventListener('change', cycle)
		console.log('dpr change')
		for (let img of document.querySelectorAll('.apx')) {
			recalc_image_scale(img)
		}
	}
	return {
		start() {
			console.log("apx start")
			if (!ql)
				cycle()
		},
		stop() {
			console.log("apx stop")
			if (ql) {
				ql.removeListener(cycle)
				ql = null
			}
		},
	}
}()
