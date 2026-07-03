// SELF_DESTRUCT poison-pill proxy, ported verbatim from src/fill.js:26. Handed to request/socket
// completion callbacks as arg 0 on failure, so any attempt to read the "result" rethrows the
// original error. The request layer still throws AFTER invoking the callback (ARCHITECTURE §4).
// Callers: services/request.ts, services/socket.ts — cb(SELF_DESTRUCT(err), err).
export function SELF_DESTRUCT(err) {
    const x = () => {
        throw err;
    };
    return new Proxy({}, { get: x, set: x, has: x });
}
