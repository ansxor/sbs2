// HTML RENDERING
let Draw = Object.create(null)
with(Draw)((window)=>{"use strict";Object.assign(Draw,{
	
	avatar_url(user, params) {
		if (!user || !user.avatar)
			return "resource/avatar.png"
		return Req.file_url(user.avatar, params)
	},
	
	// icon + name
	icon_title(entity, reverse) {
		let elem = F()
		if (reverse)
			elem.append(title(entity), icon(entity))
		else
			elem.append(icon(entity), title(entity))
		return elem
	},
	
	entity_link(entity) {
		let path = Nav.entityPath(entity)
		let element = path ? Nav.link(path) : E`span`
		return element
	},
	
	// page (or category) wiht user
	page_bar(page) {
		let bar = entity_title_link(page)
		if (page.createUser) {
			let usr = entity_title_link(page.createUser, true)
			usr.className += ' rightAlign'
			bar.append(usr)
		}
		return bar
	},
	
	entity_title_link(entity, reverse) {
		let element = entity_link(entity)
		let icon = icon_title(entity, reverse)
		element.append(icon)
		return element
	},
	
	title(entity) {
		let element = EC('span', 'textItem pre entity-title')
		element.textContent = entity ? entity.name : "MISSINGNO." // todo: this should be like, "user 14" (we should always know the uid)
		return element
	},
	
	text_item(text) {
		let element = EC('span', 'textItem pre')
		element.textContent = text
		return element
	},
	
	sidebar_debug(text) {
		let x = EC('div', 'debugMessage pre')
		x.textContent = text
		return x
	},
	
	link_avatar(user) {
		let a = entity_link(user)
		a.append(avatar(user))
		a.title = user.name
		return a
	},
	
	avatar(user) {
		let element = EC('img', 'item avatar')
		element.src = avatar_url(user, "size=100&crop=true")
		element.width = element.height = 100
		element.alt = ""
		return element
	},
	
	file_thumbnail(file, onclick) {
		let div = EC('div', 'fileThumbnail item')
		div.dataset.id = file.id
		let img = div.child('img')
		img.src = Req.file_url(file.id, "size=50")
		img.alt = file.name
		img.title = file.name
		if (onclick)
			div.onclick = (e)=>{ onclick(file, e) }
		return div
	},
	
	bg_icon(url) {
		let element = EC('span', 'item icon iconBg')
		element.setAttribute('role', 'img')
		element.style.backgroundImage = 'url("'+url+'")'
		element.alt = "" // todo
		return element
	},
	
	icon(entity) {
		let element
		let type = entity && entity.Type
		if (type == 'user') {
			element = EC('img', 'item icon avatar')
			element.src = avatar_url(entity, "size=100&crop=true")
			element.width = element.height = 100
		} else if (type=='content') {
			let hidden = !Entity.has_perm(entity.permissions, 0, 'r')
			if (hidden) {
				element = bg_icon('resource/hiddenpage.png')
			} else { //TODO: make this better!
				let pageType = entity.type
				if (['chat','documentation','program','resource','tutorial','userpage'].includes(pageType))
					element = bg_icon('resource/page-'+pageType+'.png')
				else
					element = bg_icon('resource/unknownpage.png')
			}
		} else if (type=='category') {
			element = bg_icon('resource/category.png')
		} else {
			element = bg_icon('resource/unknownpage.png')
		}
		return element
	},
	
	markup(page) {
		let lang = page.values ? page.values.markupLang : null
		return Parse.parseLang(page.content, lang, true)
	},
	
	title_path(path) {
		let element = F()
		if (!path)
			return element
		path.forEach((item, i, path)=>{
			if (item) { //todo: use entities here instead
				let link = Nav.link(item[0])
				link.textContent = item[1]
				link.className += ' textItem pre entity-title'
				element.append(link)
			}
			if (i < path.length-1) {
				let slash = element.child('span', 'pathSeparator textItem')
				slash.textContent = "/"
			}
		})
		return element
	},
	
	chat_pane(page) {
		// outer box element
		let box = EC('chat-pane', 'resize-box')
		// page element
		let page1 = box.child('div', 'sized page-container')
		let info = page_info(page)
		page1.append(info)
		let page2 = page1.child('div', 'markup-root pageContents')
		// resize handle
		let resize = box.child('resize-handle')
		let height = null
		if (page.type == 'resource')
			height = 1000 //whatever
		else if (page.type == 'chat')
			height = 0
		View.attach_resize(page1, resize, false, 1, 'setting--divider-pos-'+page.id, null, height) // todo: save?
		// 
		let [list1, list2, button] = userlist()
		box.append(list1)
		// 
		let outer = box.child('scroll-outer', 'grow')
		let inner = outer.child('scroll-inner', 'chatScroller')
		//
		return [box, page1, page2, outer, inner, list2, button]
	},
	
	userlist() {
		let outer = EC('div', 'bar rem2-3 userlist')
		let inner = outer.child('span')
		inner.textContent = "..."
		let [b0,b1] = button()
		b1.textContent = "Hide"
		b0.className += " rightAlign item loggedIn"
		outer.append(b0)
		return [outer, inner, b1]
	},
	
	userlist_avatar(status) {
		let a = link_avatar(status.user)
		if (status.status == "idle")
			a.className += ' status-idle'
		return a
	},
	
	message_block(comment) {
		let user = comment.createUser
		let date = comment.createDate
		
		let div = E`message-block`
		// avatar
		if (user.bigAvatar) {
			let d = div.child('div', 'bigAvatar')
			d.style.backgroundImage = "url("+Req.file_url(user.bigAvatar, "size=500")+")"
		} else {
			div.append(avatar(user))
		}
		// username
		let label = div.child('message-header')
		
		let name = label.child('span')
		
		let n = name.child('span', 'pre username')
		// if nickname is set, render as "nickname (realname):"
		if (user.nickname !== undefined) { // why !== here?
			n.textContent = user.nickname
			name.append(":")
			let ns = name.child('span', 'real-name-label')
			ns.append(" (")
			let real = ns.child('span', 'pre')
			real.textContent = user.realname
			ns.append(")")
		} else {
			// otherwise render as "name:"
			n.textContent = user.name
			name.append(":")
		}
		
		// time
		let timeStamp = label.child('time')
		timeStamp.setAttribute("datetime", date+"")
		timeStamp.textContent = timeString(date)
		
		// contents
		let contentBox = div.child('message-contents')
		div.dataset.uid = comment.createUserId
		div.dataset.merge = Entity.comment_merge_hash(comment)
		return [div, contentBox]
	},
	// comment: Comment
	// return: Element
	message_part(comment) {
		let element = EC('message-part', 'markup-root')
		element.setAttribute('tabindex', "0")
		
		if (comment.createDate.getTime() != comment.editDate.getTime())
			element.className += " edited"
		
		// this is a hack.
		// we set as few properties as possible for what is needed
		// don't want to set too many to avoid memory usage
		
		// the real issue here is, we use too many methods of referring to displayed messages
		// sometimes id, indexed in message_parts, sometimes the comment data, sometimes the element, etc.
		// need to be more consistent.
		element.x_data = {
			createUserId: comment.createUserId,
			editUserId: comment.editUserId,
			id: comment.id,
			parentId: comment.parentId,
			content: comment.content,
			meta: comment.meta,
		}
		
		element.dataset.id = comment.id
		element.dataset.time = comment.createDate.getTime()
		element.append(Parse.parseLang(comment.content, comment.meta.m, false))
		return element
	},
	// date: Date
	// return: String
	timeString(date) {
		// time string as something like: (depends on locale)
		// today: "10:37 AM"
		// older: "December 25, 2021, 4:09 PM"
		let options
		if (Date.now()-date.getTime() > 1000*60*60*12)
			options = {year:'numeric',month:'long',day:'numeric',hour:'numeric', minute:'2-digit'}
		else
			options = {hour:'numeric', minute:'2-digit'}
		return date.toLocaleString([], options)
	},
	// block: Element
	// comment: Comment
	// time: Date
	can_merge_comment(block, comment, time) {
		if (block) {
			let hash = block.dataset.merge
			return hash && hash==Entity.comment_merge_hash(comment) && (!time || comment.createDate-time <= 1000*60*5)
		}
		return false
	},
	// elem: Element - container to insert message blocks into
	// part: Element - new message part
	// comment: Comment - data used to generate `part`
	// time: Date - date of last message
	// backwards: Boolean - whether to insert at beginning
	insert_comment_merge(elem, part, comment, time, backwards) { // too many args
		// todo: get the time from the block itself
		let block = elem[backwards?'firstChild':'lastChild']
		let contents
		if (can_merge_comment(block, comment, time))
			contents = block.getElementsByTagName('message-contents')[0]// not great...
		if (!contents) {
			let block
			([block, contents] = message_block(comment))
			elem[backwards?'prepend':'append'](block)
		}
		contents[backwards?'prepend':'append'](part)
	},
	// this needs to be improved
	search_comment(comment) {
		let outer = EC('div', 'bottomBorder')
		let pg = entity_title_link(comment.parent)
		pg.className += " bar rem1-5 linkBar"
		outer.append(pg)
		
		let firstId = comment.id
		let lastId = comment.id
		let firstElem
		let lastElem
		
		{
			let b = button()
			b[1].textContent = "Load Older"
			outer.append(b[0])
			b[1].onclick = ()=>{
				Req.get_older_comments(comment.parentId, firstId, 10, (comments)=>{
					if (!comments) return
					comments.forEach((c)=>{
						firstId = c.id
						let d = message_block(c)
						d[1].append(message_part(c))
						outer.insertBefore(d[0], firstElem)
						firstElem = d[0]
					})
				})
			}
		}
		
		let d = message_block(comment)
		d[1].append(message_part(comment))
		outer.append(d[0])
		firstElem = lastElem = d[0]
		
		{
			let b = button()
			b[1].textContent = "Load Newer"
			outer.append(b[0])
			b[1].onclick = ()=>{
				Req.get_newer_comments(comment.parentId, lastId, 10, (comments)=>{
					if (!comments) return
					comments.forEach((c)=>{
						lastId = c.id
						let d = message_block(c)
						d[1].append(message_part(c))
						outer.insertBefore(d[0], b[0]) // yes
					})
				})
			}
		}
		
		return outer
	},
	
	button() {
		let container = EC('button-container')
		let button = container.child('button')
		return [container, button]
	}, // BAD ↕
	// unused also
	linkButton() {
		let container = EC('button-container')
		let a = container.child('a')
		let button = a.child('button')
		return [container, button]
	},
	
	page_info(page) {
		let e = EC('div', 'pageInfoPane rem2-3 bar')
		e.append(author_box(page), vote_box(page))
		return e
	},
	sidebar_tabs(list, callback) {
		let btns = []
		let frag = F();
		let x = {
			elem: frag,
			select: (i)=>{
				list.forEach((item, i2)=>{
					btns[i2].setAttribute('aria-selected', i==i2)
					item.elem.classList.toggle('shown', i==i2)
				})
			},
		}
		list.forEach((item, i)=>{
			item.elem.setAttribute('role', "tabpanel")
			item.elem.setAttribute('aria-labelledby', "sidebar-tab-"+i)
			
			let btn = frag.child('button')
			btn.setAttribute('role', "tab")
			btn.setAttribute('aria-selected', "false")
			btn.id = "sidebar-tab-"+i
			btn.setAttribute('aria-controls', "sidebar-panel-"+i)
			btns[i] = btn
			btn.onclick = ()=>{
				x.select(i)
			}
			btn.append(item.label)
		})
		return x
	},
	
	activity_item(item) {
		let outer = entity_link(item.content)
		outer.className += " activity-page"
		
		let bar = outer.child('div', 'bar rem1-5 ellipsis')
		bar.append(icon_title(item.content))
		
		let bar2 = outer.child('div', 'bar rem1-5')
		
		let userContainer = bar2.child('activity-users', 'rightAlign')
		
		let time = time_ago(item.lastDate)
		time.className += " textItem"
		userContainer.append(time, " ")
		
		for (let u of item.users) {
			if (u && u.user) {
				let l = entity_link(u.user)
				l.append(icon(u.user))
				userContainer.append(l)
			}
		}
		
		return outer
	},
	// todo: create a special system for pagination
	nav_buttons(callback) {
		let prev = button()
		prev[0].className += " item"
		prev[1].textContent = "<"
		let next = button()
		next[0].className += " item"
		next[1].textContent = ">"
		let page = text_item()
		page.textContent = 1
		let e = F()
		e.append(prev[0], next[0], page)
		let x = {
			value: 1,
			element: e,
			onchange: ()=>{},
			set: (p)=>{
				x.value = p
				page.textContent = p
			}
		}
		let change = (d)=>{
			if (x.value+d < 1)
				return
			x.value += d
			x.onchange(x.value)
		}
		prev[1].onclick = ()=>{change(-1)}
		next[1].onclick = ()=>{change(1)}
		return x
	},
	
	author_box(page) {
		let elem = F()
		if (!page)
			return elem
		elem.append(
			page_edited_time("Author:", page.createDate), " ",
			entity_title_link(page.createUser, true))
		if (page.editUserId != page.createUserId) {
			elem.append(
				" ", page_edited_time("Edited by:", page.editDate),
				" ", entity_title_link(page.editUser, true))
		} else if (page.createDate != page.editDate) { //edited by same user
			elem.append(" ", page_edited_time("Edited", page.editDate))
		}
		return elem
	},
	
	page_edited_time(label, time) {
		let b = EC('span', 'item')
		
		let a = b.child('div', 'half half-label')
		a.textContent = label
		
		a = time_ago(time)
		b.append(a)
		a.className += " half"
		return b
	},
	
	time_ago(time) {
		let t = EC('time', 'time-ago')
		t.setAttribute('datetime', time.toISOString())
		t.textContent = time_ago_string(time)
		t.title = time.toString()
		return t
	},
	
	time_ago_string(date) {
		let seconds = (Date.now() - date.getTime()) / 1000
		let desc = [
			[31536000, 1, "year", "years"],
			[2592000, 1, "month", "months"],
			[86400, 1, "day", "days"],
			[3600, 0, "hour", "hours"],
			[60, 0, "min", "min"],
		].find(desc => seconds > desc[0]*0.96)
		if (!desc)
			return "Just now"
		let round = (seconds/desc[0]).toFixed(desc[1]).replace(/\.0$/,"") // only works with 0 or 1 digit of precision oops
		let units = +round==1 ? desc[2] : desc[3]
		return `${round} ${units} ago`
		/*if (seconds <= -0.5)
		  return " IN THE FUTURE?"
		  return Math.round(seconds) + " seconds ago"*/
	},
	
	permission_row(user, perms) {
		let id = user.id
		let row = E`tr`
		let name
		if (!id) {
			name = text_item("Default")
		} else
			name = entity_title_link(user, true)
		name.className += " bar rem1-5"
		if (id) {
			let b = button()
			b[1].textContent = "remove"
			b[1].onclick = ()=>{ row.remove() }
			row.child('td').append(b[0])
		} else
			row.child('td')
		row.child('th').append(name)
		
		for (let p of ['r','c','u','d']) {
			let inp = row.child('td').child('input')
			inp.type = 'checkbox'
			inp.checked = perms.indexOf(p)>=0
			inp.value = p
		}
		
		row.dataset.id = id
		return row
	},
	
	user_selector() {
		let elem = EC('user-select', 'bar rem1-5')
		let input = elem.child('input', 'item')
		input.placeholder = "Search Username"
		let dropdown = elem.child('select', 'item')
		let placeholder = E`option`
		placeholder.textContent = "select user..."
		placeholder.disabled = true
		placeholder.hidden = true
		
		let placeholder2 = E`option`
		placeholder2.textContent = "loading..."
		placeholder2.disabled = true
		placeholder2.hidden = true
		
		let submit = elem.child('button', 'item')
		submit.textContent = "select"
		submit.disabled = true
		
		let results = null
		
		let x = {
			elem: elem,
			searchText: null,
		}
		input.oninput = ()=>{
			reset()
		}
		View.bind_enter(input, ()=>{
			dropdown.focus()
		})
		View.bind_enter(dropdown, ()=>{
			if (dropdown.value)
				submit.click()
		})
		dropdown.onfocus = ()=>{
			if (input.value == x.searchText)
				return
			x.searchText = input.value
			dropdown.fill(placeholder2)
			placeholder2.selected = true
			results = true
			Req.searchUsers(x.searchText, (user_map)=>{
				dropdown.fill()
				if (!user_map) {
					x.searchText = null //error
					return
				}
				results = user_map
				submit.disabled = false
				let found = false
				for (let [id, user] of user_map) {
					let option = dropdown.child('option')
					option.value = user.id
					option.textContent = user.name
					found = true
				}
				if (!found) {
					let option = dropdown.child('option')
					option.value = "0"
					option.textContent = "(no results)"
					option.disabled = true
					dropdown.value = "0"
					input.focus()
				}
			})
		}
		let reset = ()=>{
			if (results) {
				submit.disabled = true
				dropdown.fill(placeholder)
				placeholder.selected = true
				results = null
				x.searchText = null
			}
		}
		submit.onclick = ()=>{
			let uid = +dropdown.value
			if (uid) {
				x.onchange(results[uid])
				input.focus()
				input.value = ""
				reset()
			}
		}
		results = true
		reset()
		return x
	},
	
	message_controls(info, edit) {
		let elem = E`message-controls`
		let x = {
			elem: elem
		}
		let btn = elem.child('button')
		btn.onclick = info
		btn.setAttribute('tabindex', "-1")
		btn.textContent = "⚙"
		
		btn = elem.child('button')
		btn.onclick = edit
		btn.setAttribute('tabindex', "-1")
		btn.textContent = "✏"
		return x
	},
	
	// todo: replace this
	settings(settings, onchange) {
		let get = {}
		let set = {}
		let change = (name)=>{
			var value = get[name]()
			Store.set("setting-"+name, JSON.stringify(value))
			onchange(name, value)
		}
		let x = {
			elem: F(),
			get() {
				let ret = {}
				Object.for(get,(func, key)=>{ret[key] = func()})
				return ret
			},
			set(data) {
				Object.for(set,(func, key)=>{func(data[key])})
			},
			saveAll() {
				Object.for(get,(func, key)=>{change(key)})
			}
		}
		Object.for(settings, (data, name)=>{
			let type = data.type
			let label = x.elem.child('label')
			label.textContent = data.name+": "
			let elem
			if (type=='select') {
				elem = E`select`
				for (let option of data.options) {
					let opt = elem.child('option')
					opt.value = option
					opt.textContent = option
				}
			} else if (type=='textarea') {
				elem = E`textarea`
			} else {
				console.error("settings field '"+name+"' has invalid selection type '"+type+"'", data)
				return // invalid setting field type
			}
			get[name] = ()=>{
				return elem.value
			}
			set[name] = (value)=>{
				elem.value = value
			}
			
			let value = Store.get("setting-"+name)
			if (value != null) {
				value = JSON.safe_parse(value)
				set[name](value)
				onchange(name, value)
			}
			if (data.autosave != false) {
				elem.onchange = ()=>{
					change(name);
				}
			}
			
			elem && x.elem.append(elem)
			x.elem.child('br')
		})
		return x
	},
	
	gallery_label(entity) {
		let element = entity_link(entity)
		element.className += " bar rem1-5"
		
		let icon = icon_title(entity)
		element.append(icon)
		
		return element
	},
	
	sidebar_comment(comment) {
		let d = EC('div', 'bar rem1-5 sidebarComment ellipsis')
		if (comment.editUserId != comment.createUserId) {
			d.append(
				entity_title_link(comment.editUser),
				" edited ",
			)
		}
		d.append(
			entity_title_link(comment.createUser),
			": ",
			comment.content.replace(/\n/g, "  "),
		)
		d.dataset.id = comment.id
		d.title = comment.createUser.name+" in "+comment.parentId+":\n"+comment.content
		return d
	},
	
	//todo:
	sidebarPageLabel(content) {
		
	},
	
	// FIXME: There is no live updating of the vote count. It only adds
	// the user's count to the user vote when the user votes,
	// which is clearly an awful way of doing things. I don't
	// understand how listener is implemented 	in this, so I don't
	// feel like touching it.
	
	// @@ who wrote this comment??
	vote_button(disptext, state, page) {
		let b = button()
		b[0].className += ' item'
		b[1].className += ' voteButton'
		if (page.about.myVote == state)
			b[1].dataset.selected = ""
		b[1].dataset.vote = state
		
		let label = b[1].child('div')
		label.textContent = disptext
		
		let count = b[1].child('div', 'voteCount')
		count.dataset.vote = state
		count.textContent = page.about.votes[state].count
		
		return b[0]
	},
	
	vote_box(page) {
		let element = EC('div', 'item rightAlign')
		
		if (!page)
			return element
		
		let buttonStates = [['-', 'b'], ['~', 'o'], ['+', 'g']]
		let buttons = buttonStates.map(x => vote_button(x[0], x[1], page))
		
		for (let x of buttons) {
			element.append(x)
			x.onclick = (e)=>{
				if (!Req.auth)
					return
				
				let button = e.currentTarget.querySelector('button')
				let state = button.dataset.vote
				let vote = state
				let oldButton = element.querySelector('button[data-selected]')
				// disable button so that it won't increment multiple times while
				// query is happening
				button.disabled = true
				// check if vote was already toggled
				if (oldButton &&
					 oldButton.hasAttribute('data-selected') &&
					 button.hasAttribute('data-selected'))
					vote = undefined
				Req.setVote(page.id, vote, (e, resp)=>{
					// in case the vote fails when user is blocked from voting
					if (!e) {
						// if the vote was already toggled, then remove highlight
						let replaceVote = (q, x)=>{
							let c = element.querySelector(q)
							c.textContent = String(Number(c.textContent) + x)
						}
						if (!vote) {
							delete button.dataset.selected
							replaceVote('.voteCount[data-vote="' + state + '"]', -1)
						} else {
							// otherwise, we want to remove the highlight from the
							// button that was already pressed before and highlight
							// the new button
							if (oldButton) {
								delete oldButton.dataset.selected
								replaceVote('.voteCount[data-vote="' + oldButton.dataset.vote + '"]', -1)
							}
							button.dataset.selected = ""
							replaceVote('.voteCount[data-vote="' + state + '"]', 1)
						}
					}
					button.disabled = false
				})
			}
		}
		return element
	},
	
	update_timestamps(element) {
		for (let e of element.querySelectorAll("time.time-ago"))
			e.textContent = time_ago_string(new Date(e.getAttribute('datetime')))
	},
	
	nav_category(cat) {
		let elem = E`div`
		let label = entity_title_link(cat)
		label.className += " bar rem1-5 linkBar"
		elem.append(label)
		let elem2 = elem.child('div', 'category-childs')
		cat.children && elem2.fill(
			cat.children.map((c) => nav_category(c))
		)
		return elem
	}
	
})<!-- PRIVATE })
Object.seal(Draw)

let F = document.createDocumentFragment.bind(document)
function E(name) {
	return document.createElement(name[0])
}
function EC(name, classes) {
	let elem = document.createElement(name)
	elem.className = classes
	return elem
}

0<!-- Draw ({
})(window)
