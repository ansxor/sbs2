import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// FilePanel (upload.js FileUploader → ARCHITECTURE §10, §12, L6g). The sidebar image-upload panel:
// pick / paste / drag-drop / fetch-by-url an image, preview it, fill an upload form, POST it, then
// insert its markup into the focused editor. Ported near-verbatim from FileUploader, kept faithful
// to its documented quirks:
//   - document-level paste / dragover / drop listeners (drop ignored over a <textarea>),
//   - object-URL revoke timing: create → assign to <img> → revoke on the next task (setTimeout),
//   - `$file_image.src` reset to '' before each new src so the old image isn't shown while loading,
//   - `data.bucket != null` ⇒ private upload (globalPerms=''; request.ts maps '' → '.'),
//   - file size shown as `type + " " + (size/1000) + " kB"`.
// The three-phase visibility (0 inputs / 1 selected / 2 uploaded) drives `hidden` on the controls.
// The upload form is reproduced inline (this package does not depend on the Form island) with the
// exact per-field read/write semantics (text ""→null, select index→value, output value).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Req } from '../services/request';
import { Nav } from '../services/nav';
import { Settings } from '../services/settings';
// quantize <select>: option index → value (upload.js file_upload_form field).
const QUANTIZE_OPTIONS = [null, 2, 4, 8, 16, 32, 64, 256];
const QUANTIZE_LABELS = ['no', '2', '4', '8', '16', '32', '64', '256'];
let controller = null;
export function showInSidebar(content) {
    controller?.show_content(content);
}
export function FilePanel({ selectTab, closeFullscreen }) {
    // phase: 0 = inputs, 1 = file selected, 2 = uploaded (show_parts).
    const [phase, setPhase] = useState(0);
    // Latest prop callbacks (read from stable handlers without re-subscribing document listeners).
    const selectTabRef = useRef(selectTab);
    selectTabRef.current = selectTab;
    const closeFullscreenRef = useRef(closeFullscreen);
    closeFullscreenRef.current = closeFullscreen;
    // DOM refs (the old $file_* globals).
    const imgRef = useRef(null);
    const urlDisplayRef = useRef(null); // $file_url (readonly result url)
    const urlInputRef = useRef(null); // $file_url_input (CORS url to fetch)
    const urlFormRef = useRef(null); // $file_url_form
    const uploadPageRef = useRef(null); // $file_upload_page
    // form field refs
    const sizeRef = useRef(null);
    const nameRef = useRef(null);
    const keywordsRef = useRef(null);
    const hashRef = useRef(null);
    const bucketRef = useRef(null);
    const quantizeRef = useRef(null);
    // imperative (non-render) state
    const fileRef = useRef(null); // this.file (set only while uploading)
    const lastFileRef = useRef(null); // this.last_file
    // input.js `_value` model, so got_file's write() reproduces the persist-then-restore behavior.
    const valuesRef = useRef({
        size: null,
        name: null,
        keywords: null,
        hash: null,
        bucket: null,
        quantize: null,
    });
    // ---- form helpers (input.js Form for the specific fields used) --------------------------------
    const textRead = (el) => {
        let v = el.value;
        if (v === '')
            v = null;
        return v;
    };
    const formWrite = useCallback(() => {
        const v = valuesRef.current;
        sizeRef.current.value = v.size || '';
        nameRef.current.value = v.name || '';
        keywordsRef.current.value = v.keywords || '';
        hashRef.current.value = v.hash || '';
        bucketRef.current.value = v.bucket || '';
        const i = QUANTIZE_OPTIONS.indexOf((v.quantize ?? null));
        if (i >= 0)
            quantizeRef.current.value = String(i);
    }, []);
    const formRead = useCallback(() => {
        const v = valuesRef.current;
        v.size = sizeRef.current.value || null;
        v.name = textRead(nameRef.current);
        v.keywords = textRead(keywordsRef.current);
        v.hash = textRead(hashRef.current);
        v.bucket = textRead(bucketRef.current);
        const raw = quantizeRef.current.value;
        const idx = Number(raw) | 0;
        if (idx >= 0 && idx < QUANTIZE_OPTIONS.length)
            v.quantize = QUANTIZE_OPTIONS[idx];
        else
            v.quantize = undefined;
    }, []);
    const formGet = useCallback(() => ({ ...valuesRef.current }), []);
    const formSetSome = useCallback((data) => {
        const v = valuesRef.current;
        for (const key in data) {
            const value = data[key];
            if (value !== undefined)
                v[key] = value;
        }
    }, []);
    // ---- upload.js show_parts ---------------------------------------------------------------------
    const showParts = useCallback((next, url, file) => {
        setPhase(next);
        const img = imgRef.current;
        // we set to "" first, so the old image isnt visible whilst the new one is loading
        img.src = '';
        if (url) {
            img.src = url;
            img.onload = () => {
                img.title = img.naturalWidth + ' x ' + img.naturalHeight;
            };
            const disp = urlDisplayRef.current;
            disp.value = url;
            disp.scrollLeft = 999;
        }
        else {
            urlDisplayRef.current.value = '';
        }
        fileRef.current = file || null;
    }, []);
    const fileCancel = useCallback(() => {
        showParts(0, null, null);
    }, [showParts]);
    // upload.js got_file
    const gotFile = useCallback((file) => {
        const url = URL.createObjectURL(file);
        showParts(1, url, file);
        const name = String(file.name);
        window.setTimeout(() => URL.revokeObjectURL(url));
        formSetSome({ size: file.type + ' ' + file.size / 1000 + ' kB', name, hash: null });
        formWrite();
        selectTabRef.current?.('file');
    }, [showParts, formSetSome, formWrite]);
    // upload.js show_content
    const showContent = useCallback((content) => {
        // image_url is typed `(id: number)` but the original passes content HASH strings; cast.
        const url = Req.image_url(content.hash);
        showParts(2, url, null);
        uploadPageRef.current.href = '#page/' + content.hash;
        lastFileRef.current = content;
    }, [showParts]);
    // ---- document listeners + showInSidebar registration -----------------------------------------
    useEffect(() => {
        controller = { show_content: showContent };
        const onPaste = (ev) => {
            const data = ev.clipboardData;
            if (data && data.files) {
                const file = data.files[0];
                if (file && /^image\//.test(file.type))
                    gotFile(file);
            }
        };
        const onDragover = (ev) => {
            if (ev.dataTransfer.types.includes('Files')) {
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'copy';
            }
        };
        const onDrop = (ev) => {
            if (ev.target instanceof HTMLTextAreaElement)
                return;
            const file = ev.dataTransfer.files[0];
            if (file) {
                ev.preventDefault();
                if (/^image\//.test(file.type))
                    gotFile(file);
            }
        };
        document.addEventListener('paste', onPaste);
        document.addEventListener('dragover', onDragover);
        document.addEventListener('drop', onDrop);
        return () => {
            document.removeEventListener('paste', onPaste);
            document.removeEventListener('dragover', onDragover);
            document.removeEventListener('drop', onDrop);
            if (controller && controller.show_content === showContent)
                controller = null;
        };
    }, [gotFile, showContent]);
    // ---- JSX event handlers ----------------------------------------------------------------------
    const onBrowseChange = (e) => {
        const el = e.currentTarget;
        const file = el.files?.[0];
        try {
            if (file)
                gotFile(file);
        }
        finally {
            el.value = '';
        }
    };
    const onUrlSubmit = async (ev) => {
        ev.preventDefault();
        const form = urlFormRef.current;
        if (form.hasAttribute('data-disabled'))
            return;
        try {
            form.setAttribute('data-disabled', '');
            const url = urlInputRef.current.value;
            if (!url)
                return;
            print('requesting image (might fail)...');
            const resp = await fetch(new Request(url));
            const blob = await resp.blob();
            blob.name = url;
            gotFile(blob);
            urlInputRef.current.value = '';
        }
        catch (e) {
            print('failed:', e);
        }
        finally {
            form.removeAttribute('data-disabled');
        }
    };
    const onInsert = () => {
        const file = lastFileRef.current;
        if (!file)
            return;
        const curr = Nav.view();
        if (!curr || !curr.Insert_Text)
            return;
        let url = Req.image_url(file.hash);
        const meta = JSON.parse(file.meta);
        const markup = Settings.values.chat_markup;
        if (markup === '12y') {
            url = '!' + url;
            if (meta.width && meta.height)
                url += '#' + meta.width + 'x' + meta.height;
        }
        else if (markup === '12y2') {
            url = '!' + url;
            if (meta.width && meta.height)
                url += '[' + meta.width + 'x' + meta.height + ']';
        }
        closeFullscreenRef.current?.();
        curr.Insert_Text(url);
    };
    // upload.js $file_upload.onclick = Draw.event_lock(done=>{…})
    const onUpload = (ev) => {
        const elem = ev.currentTarget;
        if (elem.disabled)
            return;
        elem.disabled = true;
        const done = () => {
            elem.disabled = false;
        };
        if (!fileRef.current)
            return void done();
        formRead();
        const data = formGet();
        const params = {
            tryresize: true,
            name: data.name || '',
            values: {},
        };
        let priv = false;
        if (data.bucket != null) {
            ;
            params.values.bucket = data.bucket || '';
            priv = true;
        }
        // ok this is silly. why even bother with the Form thing
        if (data.quantize)
            params.quantize = data.quantize;
        if (data.hash)
            params.hash = data.hash;
        if (data.keywords)
            params.keywords = data.keywords;
        if (priv)
            params.globalPerms = '';
        print(`uploading ${priv ? 'private' : 'public'} file...`);
        // The `do` completion is typed cb(resp: ListMap, err?); the upload proc returns TYPES.content,
        // so the resp is really a Content — cast for the permissions/id reads (as the original assumed).
        Req.upload_file(fileRef.current, params).do = (resp, err) => {
            done();
            if (err)
                return;
            const file = resp;
            if (priv && file.permissions[0])
                alert('file permissions not set correctly!\nid:' + file.id);
            showContent(file);
        };
    };
    const onUrlFocus = () => {
        window.setTimeout(() => {
            urlDisplayRef.current?.select();
        });
    };
    return (_jsxs("div", { id: "$sidebarFilePanel", className: "COL", children: [_jsxs("div", { className: "rem1-5 ROW", style: { justifyContent: 'space-between' }, children: [_jsxs("div", { className: "FILL COL", id: "$file_inputs", hidden: phase !== 0, children: [_jsx("input", { type: "file", accept: "image/png,image/jpeg,image/gif,image/bmp,image/webp,.png,.jpg,.jpeg,.gif,.bmp", id: "$file_browse", className: "item", onChange: onBrowseChange }), _jsxs("form", { className: "ROW", id: "$file_url_form", method: "dialog", ref: urlFormRef, onSubmit: onUrlSubmit, children: [_jsx("input", { type: "text", id: "$file_url_input", className: "FILL item", placeholder: "url (CORS only)", ref: urlInputRef }), _jsx("button", { className: "item", children: "GET" })] })] }), _jsx("button", { id: "$file_cancel", className: "item", hidden: phase !== 1, onClick: fileCancel, children: "Cancel" }), _jsx("button", { id: "$file_upload", className: "item", hidden: phase !== 1, onClick: onUpload, children: "Upload Image" }), _jsx("button", { id: "$file_url_insert", className: "item", hidden: phase !== 2, onClick: onInsert, children: "Insert" }), _jsx("input", { readOnly: true, className: "FILL item", id: "$file_url", hidden: phase !== 2, ref: urlDisplayRef, onFocus: onUrlFocus }), _jsx("a", { id: "$file_upload_page", ref: uploadPageRef, hidden: phase !== 2, children: "[Page]" }), _jsx("button", { id: "$file_done", className: "item", hidden: phase !== 2, onClick: fileCancel, children: "Done" })] }), _jsxs("form-table", { hidden: phase !== 1, children: [_jsx("div", { className: "label", children: _jsx("label", { htmlFor: "$fp_size", children: "Info:" }) }), _jsx("output", { id: "$fp_size", className: "field", ref: sizeRef }), _jsx("div", { className: "label", children: _jsx("label", { htmlFor: "$fp_name", children: "Name:" }) }), _jsx("input", { id: "$fp_name", className: "field", placeholder: "text", ref: nameRef }), _jsx("div", { className: "label", children: _jsx("label", { htmlFor: "$fp_keywords", children: "Tags:" }) }), _jsx("input", { id: "$fp_keywords", className: "field", placeholder: "text", ref: keywordsRef }), _jsx("div", { className: "label", children: _jsx("label", { htmlFor: "$fp_hash", children: "Hash:" }) }), _jsx("input", { id: "$fp_hash", className: "field", placeholder: "text", ref: hashRef }), _jsx("div", { className: "label", children: _jsx("label", { htmlFor: "$fp_bucket", children: "Bucket:" }) }), _jsx("input", { id: "$fp_bucket", className: "field", placeholder: "text", ref: bucketRef }), _jsx("div", { className: "label", children: _jsx("label", { htmlFor: "$fp_quantize", children: "Quantize:" }) }), _jsx("select", { id: "$fp_quantize", className: "field", ref: quantizeRef, defaultValue: 0, children: QUANTIZE_LABELS.map((label, i) => (_jsx("option", { value: i, children: label }, i))) })] }), _jsx("div", { className: "FILL image-box", style: { minHeight: '3rem' }, children: _jsx("img", { id: "$file_image", ref: imgRef }) }), _jsx("a", { href: "#images", children: "View Images" })] }));
}
