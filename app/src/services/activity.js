import { CODES, Entity, TYPES } from '../data/entity';
import { Events } from './events';
import { Lp } from './socket';
import { Nav } from './nav';
import { content_label } from './draw-dom';
import { avatar_url, time_ago_string } from './draw';
// activity.js:3-7. Ordering key: seconds *before* 2015-01-01T00:00:00Z (1420070400000ms),
// truncated (`|0`). Newer dates → smaller (more negative) → sort FIRST via CSS flex `order`.
// A non-Date sorts last (100).
export function date_order(date) {
    if (date instanceof Date)
        return ((1420070400000 - date.getTime()) / 1000) | 0;
    return 100;
}
// numeric coercion helper reproducing the original `date > this.date` object-vs-number `>`
// (Date coerces to `getTime()`, `-Infinity` stays `-Infinity`).
function ms(date) {
    return typeof date === 'number' ? date : date.getTime();
}
// draw.js:62-77 — the "avatar link" used only by activity rows. Inlined (not exported by draw-dom).
function link_avatar(user) {
    const a = document.createElement('a');
    a.setAttribute('tabindex', '-1');
    a.setAttribute('role', 'gridcell');
    a.href = Nav.entity_link(user);
    a.title = user.username;
    const img = document.createElement('img');
    img.className = 'item avatar';
    img.setAttribute('width', '50');
    img.setAttribute('height', '50');
    img.setAttribute('alt', user.username);
    img.src = avatar_url(user);
    a.append(img);
    return a;
}
// activity.js:9-73. One rendered row (a page): a page label, a relative time, and (for the normal
// container) a row of user avatars.
class ActivityItem {
    constructor(content, parent) {
        // template-built refs (assigned in build(), invoked from the constructor)
        Object.defineProperty(this, "$root", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "$page", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "$time", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "$user", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "parent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "content", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "users", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "action_users", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "date", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        if (parent.hide_user)
            this.build(true);
        else
            this.build(false);
        this.parent = parent;
        this.content = content;
        this.users = Object.create(null);
        this.action_users = Object.create(null);
        this.date = -Infinity;
        if (this.content) {
            this.$root.dataset.pid = String(this.content.id);
            this.$root.href = Nav.entity_link(this.content);
            this.redraw_page();
        }
        this.parent.$container.append(this.$root);
    }
    // reproduces ActivityItem.template (full) / template_simple (watch) — same tags/classes/attrs,
    // no whitespace text nodes (see file header note).
    build(simple) {
        const root = document.createElement('a');
        root.className = simple ? 'activity-page activity-watch' : 'activity-page';
        root.setAttribute('role', 'row');
        root.setAttribute('tabindex', '-1');
        const page = document.createElement('div');
        page.className = 'bar rem1-5 ellipsis';
        root.append(page);
        const bottom = document.createElement('div');
        bottom.className = 'bar rem1-5 activity-page-bottom ROW';
        root.append(bottom);
        const time = document.createElement('time');
        time.className = 'time-ago ellipsis';
        bottom.append(time);
        this.$root = root;
        this.$page = page;
        this.$time = time;
        if (!simple) {
            const user = document.createElement('div');
            user.className = 'activity-users';
            user.setAttribute('aria-orientation', 'horizontal');
            user.setAttribute('data-ordered', '');
            bottom.append(user);
            this.$user = user;
        }
    }
    redraw_page() {
        this.$page.replaceChildren(content_label(this.content));
    }
    redraw_time() {
        if (this.date != -Infinity)
            this.$time.textContent = time_ago_string(this.date);
    }
    update_date(date) {
        if (ms(date) > ms(this.date)) {
            this.date = date;
            this.$time.title = this.date.toString();
            // toISOString exists only on Date; the sentinel number path never reaches here at runtime
            // (see below) but if it ever did the original would throw identically.
            this.$time.setAttribute('datetime', this.date.toISOString());
            this.redraw_time();
            this.$root.style.order = String(date_order(this.date));
        }
    }
    update_content(content) {
        // lastRevisionId is a transport field not modeled on the Content interface.
        const nrev = content.lastRevisionId;
        const orev = this.content.lastRevisionId;
        if (!this.content || nrev > orev) {
            this.content = content;
            this.redraw_page();
        }
    }
    update_user(uid, user, date, action = null) {
        if (!user || this.parent.hide_user)
            return;
        const umap = action ? this.action_users : this.users;
        let u = umap[uid];
        if (!u) {
            const elem = link_avatar(user);
            if (action)
                elem.classList.add('action-user');
            u = umap[uid] = { user, date: -Infinity, elem };
            this.$user.append(u.elem);
        }
        if (ms(date) > ms(u.date)) {
            u.date = date;
            u.elem.style.order = String(date_order(u.date));
        }
    }
}
// activity.js:88-162. A scroll container of ActivityItems, keyed by page id, ordered purely via CSS.
export class ActivityContainer {
    constructor(hide_user = false) {
        Object.defineProperty(this, "$container", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "$elem", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "interval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "items", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "hide_user", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.$container = document.createElement('scroll-inner');
        this.$container.dataset.ordered = '';
        this.$container.tabIndex = 0;
        this.$elem = null;
        this.interval = null;
        this.items = Object.create(null);
        this.hide_user = hide_user;
    }
    init(element) {
        this.$elem = element;
        element.replaceChildren(this.$container);
        this.refresh_time_interval();
    }
    refresh_time_interval() {
        if (this.interval)
            window.clearInterval(this.interval);
        this.interval = window.setInterval(() => {
            for (const item of Object.values(this.items))
                item.redraw_time();
        }, 1000 * 30);
    }
    // get/create the ActivityItem for a given page, updating its page + date info.
    update_content(pid, page, date) {
        const item = this.items[pid] || (this.items[pid] = new ActivityItem(page, this));
        item.update_content(page);
        item.update_date(date);
        return item;
    }
    update({ content, user }, pid, date, uid = null, action = null) {
        let page = content[~pid];
        if (!page)
            page = TYPES.content({ id: pid || 0 });
        // ignore activity on files, and deletions
        if (action && (page.contentType == CODES.InternalContentType.file || action == CODES.UserAction.delete))
            return;
        const item = this.update_content(pid, page, date);
        if (uid)
            item.update_user(uid, user[~uid], date, action);
    }
    watch(watch, objects) {
        const pid = watch.contentId;
        const msg = watch.Message; // in case page has 0 messages:
        const date = msg.id ? msg.Author.date : -Infinity;
        this.update(objects, pid, date);
    }
    message_aggregate(agg, objects) {
        this.update(objects, agg.contentId, agg.maxCreateDate2, agg.createUserId);
    }
    message(msg, objects) {
        if (msg.deleted || msg.edited)
            return;
        this.update(objects, msg.contentId, msg.Author.date, msg.createUserId);
    }
    activity(act, objects) {
        const d = act.date2;
        if (d && d.getTime() >= 1658491594041 && d.getTime() <= 1658638103040)
            return;
        this.update(objects, act.contentId, d, act.userId, act.action ?? null);
    }
}
// ---- caller-injected targets (replace the old global $sidebar* / Sidebar.display_messages) ----
let categoriesTarget = null;
let messageSink = null;
// L6 Sidebar registers the category-tree container (was `$sidebarCategories`).
export function setCategoriesTarget(el) {
    categoriesTarget = el;
}
// L6 Sidebar registers the initial-message sink (was `Sidebar.display_messages`).
export function setActivityMessageSink(fn) {
    messageSink = fn;
}
// activity.js:164-258.
const normal = new ActivityContainer(false);
const watch = new ActivityContainer(true);
export const Act = {
    normal,
    watch,
    pull_recent() {
        const start = new Date();
        start.setDate(start.getDate() - 1);
        const data = {
            values: {
                yesterday: start,
            },
            requests: [
                // recent messages to show in sidebar
                { type: 'message', fields: '*', query: '!notdeleted()', order: 'id_desc', limit: 50 },
                // message aggregate
                {
                    type: 'message_aggregate',
                    fields: 'contentId,createUserId,maxCreateDate,maxId',
                    query: 'createDate > @yesterday',
                },
                // activity
                {
                    type: 'activity',
                    fields: 'id,contentId,userId,action,date',
                    query: 'date > @yesterday AND !basichistory()',
                    order: 'id',
                },
                // watches
                { type: 'watch', fields: '*' },
                {
                    name: 'Cwatch',
                    type: 'content',
                    fields: 'name,id,permissions,contentType,lastRevisionId,lastCommentId,hash,values',
                    query: '!notdeleted() AND id IN @watch.contentId',
                    order: 'lastCommentId_desc',
                },
                {
                    name: 'Mwatch',
                    type: 'message',
                    fields: '*',
                    query: 'id in @Cwatch.lastCommentId',
                    order: 'id_desc',
                },
                // shared
                {
                    type: 'user',
                    fields: '*',
                    query: 'id IN @message_aggregate.createUserId OR id IN @message.createUserId OR id IN @watch.userId OR id IN @activity.userId',
                },
                {
                    type: 'content',
                    fields: 'name,id,permissions,contentType,lastRevisionId,hash,literalType,values',
                    query: 'id IN @message_aggregate.contentId OR id IN @message.contentId OR id IN @activity.contentId',
                },
                // category
                {
                    name: 'Ccat',
                    type: 'content',
                    fields: 'name,id,permissions,contentType,literalType,parentId,hash,values',
                    query: '!onlyparents() OR literalType={{category}}',
                },
            ],
        };
        Lp.chain(data, (objects) => {
            console.log('🌄 got initial activity');
            /// process data ///
            Entity.link_comments({ message: objects.Mwatch, user: objects.user, content: objects.content });
            Entity.ascending(objects.message, 'id');
            /// sidebar messages ///
            // TODO: ensure that these are displayed BEFORE any websocket new messages (caller-owned)
            messageSink?.(objects.message, true);
            /// activity tab ///
            for (const act of objects.activity)
                normal.activity(act, objects);
            for (const agg of objects.message_aggregate)
                normal.message_aggregate(agg, objects);
            // watch
            Entity.link_watch({ message: objects.Mwatch, watch: objects.watch, content: objects.Cwatch });
            for (const x of objects.watch)
                watch.watch(x, { content: objects.Cwatch });
            // cats
            const tree = { content: null, branches: [] };
            const map = { '0': tree };
            for (const cat of objects.Ccat) {
                map[cat.id] = { content: cat, branches: [] };
            }
            for (const cat of objects.Ccat) {
                const parent = map[cat.parentId];
                if (parent)
                    parent.branches.push(map[cat.id]);
            }
            function draw_tree(root, depth = 0, last = false) {
                const cat = root.content;
                if (cat) {
                    if (cat.id == 23)
                        return; //sowwy
                    const bar = document.createElement('a');
                    bar.append(content_label(cat));
                    bar.setAttribute('role', 'listitem');
                    bar.className += ' bar rem1-5 search-page ellipsis';
                    // bar.href = Nav.entity_link(cat)
                    // workaround
                    bar.href = '#category/' + cat.id;
                    bar.prepend('│ '.repeat(depth - 1) + '├└'[last ? 1 : 0]);
                    categoriesTarget?.append(bar);
                }
                root.branches.forEach((x, i, a) => draw_tree(x, depth + 1, i == a.length - 1));
            }
            draw_tree(tree);
        });
    },
    handle_messages(comments, maplist) {
        for (const msg of comments) {
            if (!msg.deleted) {
                const pid = msg.contentId;
                const date = msg.Author.date;
                normal.update(maplist, pid, date, msg.createUserId);
                if (watch.items[pid])
                    watch.update(maplist, pid, date);
            }
        }
    },
};
// activity.js:261 — Act is a permanent Events.messages listener (this = Act via the bus).
Events.messages.listen(Act, Act.handle_messages);
