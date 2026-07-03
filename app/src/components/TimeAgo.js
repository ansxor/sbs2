import { jsx as _jsx } from "react/jsx-runtime";
// Presentational twin of Draw.time_ago (draw.js:167-173). Emits
// `<time class='time-ago' datetime=... title=...>` whose text is the relative time_ago_string.
// STATIC SNAPSHOT: the string is computed once at render time from Date.now(); there is no
// ticking re-render (matching the original, which never auto-updates the element either).
import { time_ago_string } from '../services/draw';
export function TimeAgo({ time }) {
    return (_jsx("time", { className: "time-ago", dateTime: time.toISOString(), title: time.toString(), children: time_ago_string(time) }));
}
