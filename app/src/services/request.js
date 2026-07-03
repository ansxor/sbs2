import { SELF_DESTRUCT } from '../core/self-destruct';
import { to_blob } from '../core/util';
import { TYPES, Entity } from '../data/entity';
import { Lp } from './socket';
let sidebarTabSelect = null;
export function setSidebarTabSelect(fn) {
    sidebarTabSelect = fn;
}
// Custom-Error stack trimming from src/fill.js:32 (Error.prototype.trim_stack). NOT ported to the
// global Error prototype; reproduced locally so InvalidRequestError keeps identical behavior. On V8
// (which exposes Error.captureStackTrace) this is a no-op, matching the original exactly.
function trimStack(err, levels = 1) {
    if ('captureStackTrace' in Error)
        return;
    while (levels-- > -1) {
        if (err.stack)
            err.stack = err.stack.replace(/^.*\n/, '');
    }
}
class InvalidRequestError extends TypeError {
    constructor(apir) {
        super();
        Object.defineProperty(this, "resp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "url", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "code", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        trimStack(this);
        this.resp = apir.response;
        this.url = apir.url;
        this.code = apir.status;
        this.name = `http ${this.code} ➡️ api╱${this.url}`;
        //this.body = apir.body
    }
    get message() {
        if ('string' == typeof this.resp)
            return '\n' + this.resp;
        const lines = [''];
        if (!this.resp)
            lines.push('???');
        if (this.resp.title)
            lines.push(this.resp.title);
        if (this.resp.errors)
            for (const key in this.resp.errors) {
                const msg = this.resp.errors[key];
                lines.push(`❌${key}:`);
                lines.push(...msg.map((x) => ` 🔸${x}`));
            }
        return lines.join('\n');
    }
}
InvalidRequestError.prototype.name = 'InvalidRequestError';
// this class seemed clever at the time (and IS) but idk it's kinda gross...
export class ApiRequest extends XMLHttpRequest {
    constructor(url, method, body, proc) {
        super();
        Object.defineProperty(this, "url", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "method", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "body", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "proc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ok", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "aborted", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        // Defined as an instance arrow field (not a prototype method) because TS forbids a subclass
        // method from overriding the inherited `onreadystatechange` accessor (TS2425). `this` is the
        // instance either way — identical to the original, which set it via `super.onreadystatechange`.
        Object.defineProperty(this, "onreadystatechange", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                if (this.aborted)
                    return;
                switch (this.readyState) {
                    case XMLHttpRequest.HEADERS_RECEIVED: {
                        const type = this.getResponseHeader('Content-Type');
                        if (/[/+]json(;| |$)/i.test(type))
                            this.responseType = 'json';
                        return;
                    }
                    case XMLHttpRequest.DONE: {
                        let resp = this.response; // json or text
                        switch (this.status) {
                            // === Success ===
                            case 200:
                            case 204:
                                if (this.proc)
                                    resp = this.proc(resp);
                                return this.ok(resp);
                            // === Invalid request ===
                            case 400:
                            case 415:
                            case 404:
                            case 500:
                                return this.fail();
                            // === Network Conditions ===
                            case 0:
                                print('Request failed!');
                                return this.fail('connection');
                            // todo: maybe have some way to trigger a retry here?
                            case 502:
                                return this.retry(5000, 'bad gateway');
                            case 408:
                            case 524:
                                return this.retry(0, 'timeout');
                            case 429: {
                                const after = +(this.getResponseHeader('Retry-After') || 1);
                                return this.retry((after + 0.5) * 1000, `rate limited ${after}sec`);
                            }
                            // === Permissions ===
                            case 403:
                                return this.fail('permission');
                            case 418:
                                return this.fail('ban');
                            case 401:
                                alert(`AUTHENTICATION ERROR!?
if this is real, you must log out!
${resp}`);
                                // todo: let the user log in with the sidebar, without calling log_out, so the page only reloads once instead of twice
                                // this.log_out()
                                return this.fail('auth');
                            // === ??? some other error ===
                            default:
                                alert(`Request failed! ${this.status} ${this.url}`);
                                console.log('REQUEST FAILED', this);
                                return this.fail('error');
                        }
                    }
                }
            }
        });
        super.onreadystatechange = this.onreadystatechange;
        this.url = url;
        this.method = method;
        this.body = body;
        this.proc = proc;
        this.ok = console.info;
        this.go();
    }
    // completion hook: `Req.request(...).do = (resp, err) => {}`. Setter-only so `.do =` reads
    // naturally; there is no getter.
    set do(fn) {
        this.ok = fn;
    }
    fail(...e) {
        console.error('request error:', ...e, this);
        const err = new InvalidRequestError(this);
        this.ok(SELF_DESTRUCT(err), err);
        throw err;
    }
    go() {
        this.open(this.method, `${Req.server_url}/api/${this.url}`);
        this.setRequestHeader('CACHE-CONTROL', 'L, ratio, no-store, no-cache, must-revalidate'); // we probably only need no-store here
        if (Req.auth)
            this.setRequestHeader('AUTHORIZATION', 'Bearer ' + Req.auth);
        this.send(this.body);
    }
    abort() {
        super.abort();
        this.aborted = true;
    }
    retry(time, reason) {
        console.log(`will retry ${reason} in ${time / 1000} sec`);
        if (time > 2000)
            print(`Warning: request was rate limited with extremely long wait time: ${time / 1000} seconds`);
        window.setTimeout(() => {
            if (this.aborted)
                return;
            console.log('retrying request', reason);
            this.go();
        }, time);
    }
}
export const Req = {
    // this stuff can all be static methods on ApiRequest maybe?
    // url of the contentapi server, with the scheme (http or https) but without /api
    server_url: OPTS.get('api') || 'https://qcs.shsbs.xyz',
    // for backwards compat
    get server() {
        return this.server_url.replace(/^https?:[/][/]/, '') + '/api';
    },
    get storage_key() {
        return `token-${this.server}`;
    },
    auth: null,
    uid: null,
    me: null,
    // idk having all brackets bold + dimgray was kinda nice...
    // request(url, proc) - GET
    // request(url, proc, null) - POST
    // request(url, proc, data) - POST
    request(url, proc, data) {
        let method = 'GET';
        let body = data;
        if (data !== undefined) {
            method = 'POST';
            if (data != null)
                body = to_blob(data);
        }
        return new ApiRequest(url, method, body, proc);
    },
    chain(data) {
        return new ApiRequest('request', 'POST', to_blob(data), (resp) => Entity.do_listmap(resp.objects));
    },
    /////////////////////////
    //                     //
    /////////////////////////
    // log in using username/password
    get_auth(username, password, long) {
        const s = { username, password };
        if (long)
            s.expireSeconds = 1 * 60 * 60 * 24 * 29.53 * 3;
        return this.request('User/login', null, s);
    },
    // logs the user out and clears the cached token
    log_out() {
        localStorage.removeItem(this.storage_key);
        this.auth = null;
        Lp.stop();
        delete document.documentElement.dataset.login;
        sidebarTabSelect?.('user');
    },
    // try to load cached auth token from localstorage
    // (doesn't check if auth is expired though)
    // also doesn't DO anything else. (important, can be called at time 0)
    // return: Boolean
    try_load_auth() {
        try {
            this.auth = localStorage.getItem(this.storage_key);
            if (!this.auth)
                throw 'no auth token in localstorage';
            const data = JSON.parse(window.atob(this.auth.split('.')[1])); //yeah
            this.uid = +data.uid;
            if (!this.uid)
                throw "couldn't find uid";
            //let expire = data.exp
            //if (expire && Date.now()/1000>=expire) ;
            return true;
        }
        catch (e) {
            this.auth = this.uid = null;
            return false;
        }
    },
    save_auth(token) {
        localStorage.setItem(this.storage_key, token);
    },
    image_url(id, size, crop) {
        let url = `${this.server_url}/api/File/raw/${id}`;
        if (size) {
            url += `?size=${size}`;
            if (crop)
                url += `&crop=true`;
        }
        return url;
    },
    delete(type, id) {
        if (!TYPES[type])
            throw new TypeError('Tried to delete unknown entity type: ' + type);
        return new ApiRequest(`Delete/${type}/${id}`, 'POST', null, TYPES[type]);
    },
    write(obj) {
        const type = obj.Type;
        if (!TYPES[type])
            throw new TypeError('Tried to write unknown entity type: ' + type);
        return new ApiRequest(`Write/${type}`, 'POST', obj.Blob(), TYPES[type]);
    },
    set_watch(pid, state = true) {
        return this.request(`Shortcuts/watch/${state ? 'add' : 'delete'}/${pid}`, null, null);
    },
    // messages
    send_message(message) {
        return this.request('Write/message', null, message);
    },
    send_module_message(name, pid, content) {
        return this.request(`Module/${name}/${pid}`, null, content);
    },
    search_modules() {
        return new ApiRequest(`Module/search`, 'GET', null, null);
    },
    upload_file(file, params) {
        const form = new FormData();
        form.set('file', file);
        function set(name, value) {
            if (value === '')
                console.warn(`form[‘${name}’]: empty string will be treated as null`);
            form.set(name, value);
        }
        // formdata is totally fucked
        for (const name in params) {
            let value = params[name];
            if (name == 'values') {
                for (const key in value)
                    set(`values[${key}]`, value[key]);
            }
            else {
                if (name == 'globalPerms' && value === '')
                    value = '.';
                set(name, value);
            }
        }
        //console.log(form)
        // return
        return new ApiRequest('File', 'POST', form, (x) => TYPES.content(x));
    },
};
Object.seal(Req);
