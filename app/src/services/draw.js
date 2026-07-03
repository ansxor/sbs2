import { Req } from './request';
// draw.js:3-5 — the ternary that "adjusts" AVATAR_SIZE for hi-DPI screens but assigns 100 in
// both branches; kept intact so the constant is always 100 exactly as in the original.
let AVATAR_SIZE = 100; // 50 // 50 was causing issues with jpegs being too low quality, for now.
if (window.devicePixelRatio > 1)
    AVATAR_SIZE = 100;
export { AVATAR_SIZE };
// draw.js:51-59. user: User or Author (only Author carries avatar_pixel).
// The Req.image_url `id` parameter is frozen as numeric `Id`, but avatar hashes are strings
// at runtime (kept as-is — see deviation note); cast through the frozen surface.
export function avatar_url(user, size = AVATAR_SIZE) {
    if (!user || !user.avatar || user.avatar === '0')
        return 'resource/avatar.png';
    // only `Author` contains `avatar_pixel`
    // Object.hasOwn (original) == hasOwnProperty.call; the latter is used to stay within the
    // ES2020 lib target while preserving identical runtime behavior.
    if (Object.prototype.hasOwnProperty.call(user, 'avatar_pixel') && user.avatar_pixel)
        return Req.image_url(user.avatar);
    else
        return Req.image_url(user.avatar, size, true);
}
// draw.js:113-123. Locale-dependent: "10:37 AM" for < 12h old, otherwise the full date.
export function time_string(date) {
    // time string as something like: (depends on locale)
    // today: "10:37 AM"
    // older: "December 25, 2021, 4:09 PM"
    let options;
    if (Date.now() - date.getTime() > 1000 * 60 * 60 * 12)
        options = { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    else
        options = { hour: 'numeric', minute: '2-digit' };
    return date.toLocaleString([], options);
}
// draw.js:175-195. Relative-time snapshot with the exact toFixed rounding + ".0" strip quirk.
export function time_ago_string(date) {
    if (!date)
        return 'When?';
    let t = date.getTime();
    if (t < 0 || isNaN(t))
        return 'Never?';
    let seconds = (Date.now() - t) / 1000;
    let desc = [
        [31536000, 1, 'year', 'years'],
        [2592000, 1, 'month', 'months'],
        [86400, 1, 'day', 'days'],
        [3600, 0, 'hour', 'hours'],
        [60, 0, 'min', 'min'],
    ].find((desc) => seconds > desc[0] * 0.96);
    if (!desc)
        return 'Just now';
    let round = (seconds / desc[0]).toFixed(desc[1]).replace(/[.]0/, '');
    let units = +round == 1 ? desc[2] : desc[3];
    return `${round} ${units} ago`;
    /*if (seconds <= -0.5)
        return " IN THE FUTURE?"
        return Math.round(seconds) + " seconds ago"*/
}
// messages.js:3-7. Turns a leading `\h` (optionally `\h[...]`) into a <spoiler> tag. When the
// optional bracket group is absent, `$1` expands to the empty string — kept verbatim.
export function censorSpoilerText(text) {
    if (''.startsWith.call(text, '\\h'))
        text = text.replace(/^\\h(\[.*?\])?[^]*/, '<spoiler $1>');
    return text;
}
// apx.js:1-29. Pixel-avatar scaling: integer-multiple upscale via CSS, or clear on downscale.
// referenced from https://12me21.github.io/taito-f3/website/link.js
export function recalc_image_scale(img) {
    let dpr = +window.devicePixelRatio;
    let resx = img.naturalWidth;
    if (!resx)
        return;
    let resy = img.naturalHeight;
    let maxx = 50;
    let maxy = 50;
    let basex = resx / dpr;
    let basey = resy / dpr;
    let scalex = maxx / basex;
    let scaley = maxy / basey;
    let scale = Math.min(scalex, scaley);
    //console.log(scale, basex, basey)
    if (scale >= 1) {
        img.classList.add('pixelAvatar');
        img.style.setProperty('--avatar-width', Math.floor(scale) * basex + 'px');
        img.style.width = Math.floor(scale) * basex + 'px';
        img.style.height = Math.floor(scale) * basey + 'px';
        // why do we set 3 properties instead of just a --w and --h ?
    }
    else {
        img.classList.remove('pixelAvatar');
        img.style.width = '';
        img.style.height = '';
    }
}
