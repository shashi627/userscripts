// ==UserScript==
// @name         Bing Auto Searcher
// @namespace    https://tampermonkey.net/
// @version      1.0
// @description  Automates searching on Bing using random Wikipedia article titles.
// @author       Assistant
// @match        *://*.bing.com/*
// @updateURL    https://scriptive.pages.dev/auto-search.user.js
// @downloadURL  https://scriptive.pages.dev/auto-search.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    if (window.self !== window.top) return;

    const Storage = {
        get: (k, d) => {
            try {
                if (typeof GM_getValue === 'function') {
                    const val = GM_getValue(k);
                    if (val !== undefined && val !== null) return val;
                }
            } catch (_) {}
            try {
                const item = localStorage.getItem(`__bas_${k}`);
                if (item !== null) return JSON.parse(item);
            } catch (_) {}
            return d;
        },
        set: (k, v) => {
            try {
                if (typeof GM_setValue === 'function') GM_setValue(k, v);
            } catch (_) {}
            try {
                localStorage.setItem(`__bas_${k}`, JSON.stringify(v));
            } catch (_) {}
        },
        getSession: (k, d) => {
            try {
                const item = sessionStorage.getItem(`__bas_${k}`);
                return item !== null ? JSON.parse(item) : d;
            } catch (_) {
                return d;
            }
        },
        setSession: (k, v) => {
            try {
                sessionStorage.setItem(`__bas_${k}`, JSON.stringify(v));
            } catch (_) {}
        }
    };

    const cfg = {
        max: Storage.get('max', 25),
        count: Storage.getSession('count', 0),
        running: Storage.getSession('running', false),
        autoStart: Storage.get('autoStart', true),
        minimized: Storage.get('minimized', false),
        minDelay: Storage.get('minDelay', 10),
        maxDelay: Storage.get('maxDelay', 20),
        minType: Storage.get('minType', 200),
        maxType: Storage.get('maxType', 400),
        pos: Storage.get('pos', null)
    };

    let timer = null;
    let wakeLock = null;

    async function acquireWakeLock() {
        try {
            if ('wakeLock' in navigator && !wakeLock) {
                wakeLock = await navigator.wakeLock.request('screen');
                wakeLock.addEventListener('release', () => {
                    wakeLock = null;
                });
            }
        } catch (_) {}
    }

    function releaseWakeLock() {
        if (wakeLock) {
            try {
                wakeLock.release();
            } catch (_) {}
            wakeLock = null;
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && cfg.running) {
            acquireWakeLock();
        }
    });

    const css = `
        #bas-hud {
            position: fixed !important;
            z-index: 2147483647 !important;
            width: 240px !important;
            height: auto !important;
            min-height: unset !important;
            max-height: unset !important;
            background: #11141a !important;
            border: 1px solid rgba(255, 255, 255, 0.12) !important;
            border-radius: 10px !important;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6) !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            font-variant-numeric: tabular-nums !important;
            color: #e5e7eb !important;
            font-size: 11.5px !important;
            line-height: 1.4 !important;
            box-sizing: border-box !important;
            user-select: none !important;
            touch-action: none !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        #bas-hud.min #bas-body {
            display: none !important;
        }
        .bas-hd {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 8px 10px !important;
            background: #1a1f29 !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
            cursor: grab !important;
            font-weight: 600 !important;
            color: #ffffff !important;
            height: auto !important;
            box-sizing: border-box !important;
        }
        #bas-hud.min .bas-hd {
            border-bottom: none !important;
        }
        .bas-btn-min {
            background: transparent !important;
            border: none !important;
            color: #9ca3af !important;
            cursor: pointer !important;
            font-size: 12px !important;
            padding: 0 4px !important;
            line-height: 1 !important;
        }
        #bas-body {
            padding: 10px !important;
            height: auto !important;
            box-sizing: border-box !important;
        }
        .bas-row {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            margin-bottom: 6px !important;
        }
        .bas-tag {
            font-size: 9.5px !important;
            font-weight: 700 !important;
            padding: 2px 5px !important;
            border-radius: 4px !important;
            letter-spacing: 0.3px !important;
            text-transform: uppercase !important;
        }
        .st-id { background: #374151; color: #9ca3af; }
        .st-on { background: #065f46; color: #34d399; }
        .st-end { background: #581c87; color: #c084fc; }
        .bas-bar {
            width: 100% !important;
            height: 4px !important;
            background: #1f2937 !important;
            border-radius: 2px !important;
            overflow: hidden !important;
            margin-bottom: 8px !important;
        }
        .bas-fill {
            height: 100% !important;
            width: 0%;
            background: #2563eb !important;
            transition: width 0.25s ease !important;
        }
        .bas-grid-btn {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 6px !important;
            margin-bottom: 6px !important;
        }
        .bas-btn {
            border: none !important;
            border-radius: 5px !important;
            padding: 7px !important;
            font-weight: 600 !important;
            font-size: 11px !important;
            cursor: pointer !important;
            font-family: inherit !important;
        }
        .btn-go { background: #2563eb !important; color: #ffffff !important; }
        .btn-stop { background: #991b1b !important; color: #fecaca !important; }
        .bas-btn:disabled { opacity: 0.35 !important; pointer-events: none !important; }
        details.bas-cfg {
            border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
            padding-top: 6px !important;
            margin-top: 4px !important;
            height: auto !important;
        }
        details.bas-cfg summary {
            cursor: pointer !important;
            font-size: 10px !important;
            font-weight: 600 !important;
            color: #9ca3af !important;
            list-style: none !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
        }
        details.bas-cfg summary::-webkit-details-marker { display: none !important; }
        .bas-inps {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 5px !important;
            margin: 6px 0 !important;
        }
        .bas-inp {
            display: flex !important;
            flex-direction: column !important;
            gap: 2px !important;
        }
        .bas-inp label {
            font-size: 8.5px !important;
            color: #9ca3af !important;
            text-transform: uppercase !important;
        }
        .bas-inp input {
            background: #090b0e !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            border-radius: 4px !important;
            color: #ffffff !important;
            padding: 4px !important;
            font-size: 10.5px !important;
            font-family: inherit !important;
            width: 100% !important;
            box-sizing: border-box !important;
            outline: none !important;
        }
        .bas-chk-row {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            grid-column: span 2 !important;
            cursor: pointer !important;
            margin-top: 2px !important;
            margin-bottom: 2px !important;
        }
        .bas-chk-row input {
            cursor: pointer !important;
            width: auto !important;
            margin: 0 !important;
        }
        .bas-chk-row span {
            font-size: 9.5px !important;
            color: #9ca3af !important;
        }
        .bas-sub-btn {
            width: 100% !important;
            background: #1a1f29 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            color: #d1d5db !important;
            padding: 5px !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            font-size: 10px !important;
            font-family: inherit !important;
            margin-top: 3px !important;
        }
    `;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const hud = document.createElement('div');
    hud.id = 'bas-hud';
    if (cfg.minimized) hud.classList.add('min');

    hud.innerHTML = `
        <div class="bas-hd" id="bas-drag">
            <span>Bing Engine</span>
            <button id="bas-min-btn" class="bas-btn-min">${cfg.minimized ? '▲' : '—'}</button>
        </div>
        <div id="bas-body">
            <div class="bas-row">
                <span id="bas-cnt" style="font-weight:600;color:#ffffff;">${cfg.count} / ${cfg.max}</span>
                <span id="bas-tm" style="color:#9ca3af;">READY</span>
                <span id="bas-st" class="bas-tag st-id">IDLE</span>
            </div>
            <div class="bas-bar"><div id="bas-fill" class="bas-fill"></div></div>
            <div class="bas-grid-btn">
                <button id="bas-start" class="bas-btn btn-go">START</button>
                <button id="bas-stop" class="bas-btn btn-stop" disabled>STOP</button>
            </div>
            <details class="bas-cfg">
                <summary>CONFIG <span>⚙</span></summary>
                <div class="bas-inps">
                    <div class="bas-inp" style="grid-column: span 2;"><label>Search Limit</label><input type="number" id="in-max" value="${cfg.max}"></div>
                    <div class="bas-inp"><label>Min Type (ms)</label><input type="number" id="in-min-t" value="${cfg.minType}"></div>
                    <div class="bas-inp"><label>Max Type (ms)</label><input type="number" id="in-max-t" value="${cfg.maxType}"></div>
                    <div class="bas-inp"><label>Min Delay (s)</label><input type="number" id="in-min-d" value="${cfg.minDelay}"></div>
                    <div class="bas-inp"><label>Max Delay (s)</label><input type="number" id="in-max-d" value="${cfg.maxDelay}"></div>
                    <label class="bas-chk-row">
                        <input type="checkbox" id="in-auto" ${cfg.autoStart ? 'checked' : ''}>
                        <span>Auto-Start Searches</span>
                    </label>
                </div>
                <button id="in-save" class="bas-sub-btn" style="background:#065f46;color:#ffffff;border-color:#059669;">SAVE</button>
                <button id="in-rst" class="bas-sub-btn">RESET COUNTER</button>
            </details>
        </div>
    `;

    document.body.appendChild(hud);

    function clamp() {
        const r = hud.getBoundingClientRect();
        const pad = 10;
        const x = Math.min(Math.max(pad, r.left), window.innerWidth - r.width - pad);
        const y = Math.min(Math.max(pad, r.top), window.innerHeight - r.height - pad);

        hud.style.left = `${Math.round(x)}px`;
        hud.style.top = `${Math.round(y)}px`;
        hud.style.right = 'auto';
        hud.style.bottom = 'auto';

        Storage.set('pos', { x: Math.round(x), y: Math.round(y) });
    }

    if (cfg.pos && typeof cfg.pos.x === 'number' && typeof cfg.pos.y === 'number') {
        hud.style.left = `${cfg.pos.x}px`;
        hud.style.top = `${cfg.pos.y}px`;
        hud.style.right = 'auto';
        hud.style.bottom = 'auto';
        setTimeout(clamp, 20);
    } else {
        hud.style.left = `${Math.max(10, window.innerWidth - 250)}px`;
        hud.style.top = `${Math.max(10, window.innerHeight - 150)}px`;
        hud.style.right = 'auto';
        hud.style.bottom = 'auto';
        setTimeout(clamp, 20);
    }

    window.addEventListener('resize', clamp);

    const UI = {
        hud,
        drag: document.getElementById('bas-drag'),
        st: document.getElementById('bas-st'),
        cnt: document.getElementById('bas-cnt'),
        tm: document.getElementById('bas-tm'),
        fill: document.getElementById('bas-fill'),
        start: document.getElementById('bas-start'),
        stop: document.getElementById('bas-stop'),
        min: document.getElementById('bas-min-btn'),
        inMax: document.getElementById('in-max'),
        inMinT: document.getElementById('in-min-t'),
        inMaxT: document.getElementById('in-max-t'),
        inMinD: document.getElementById('in-min-d'),
        inMaxD: document.getElementById('in-max-d'),
        inAuto: document.getElementById('in-auto'),
        inSave: document.getElementById('in-save'),
        inRst: document.getElementById('in-rst')
    };

    function sync() {
        UI.cnt.textContent = `${cfg.count} / ${cfg.max}`;
        UI.fill.style.width = `${Math.min(100, Math.round((cfg.count / cfg.max) * 100))}%`;
    }

    sync();

    function setupDrag(el, handle) {
        let isDragging = false, startX, startY, initX, initY;

        function onStart(e) {
            if (e.target.closest('button') || e.target.closest('input')) return;
            const evt = e.touches ? e.touches[0] : e;
            isDragging = true;
            startX = evt.clientX;
            startY = evt.clientY;
            const rect = el.getBoundingClientRect();
            initX = rect.left;
            initY = rect.top;
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        }

        function onMove(e) {
            if (!isDragging) return;
            e.preventDefault();
            const evt = e.touches ? e.touches[0] : e;
            el.style.left = `${initX + (evt.clientX - startX)}px`;
            el.style.top = `${initY + (evt.clientY - startY)}px`;
        }

        function onEnd() {
            if (!isDragging) return;
            isDragging = false;
            clamp();
        }

        handle.addEventListener('mousedown', onStart);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        handle.addEventListener('touchstart', onStart, { passive: true });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
    }

    setupDrag(UI.hud, UI.drag);

    const wait = (ms) => new Promise((res) => setTimeout(res, ms));

    async function fetchQuery() {
        const res = await fetch('https://en.wikipedia.org/api/rest_v1/page/random/summary');
        const data = await res.json();
        return data.title.replace(/_/g, ' ').trim();
    }

    async function runSearch(query) {
        UI.st.textContent = 'TYPING';
        UI.st.className = 'bas-tag st-on';
        UI.tm.textContent = 'TYPE';

        const input = document.querySelector('#sb_form_q') || document.querySelector('textarea[name="q"]') || document.querySelector('input[name="q"]');
        if (input) {
            input.focus();
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));

            const minT = Math.min(cfg.minType, cfg.maxType);
            const maxT = Math.max(cfg.minType, cfg.maxType);

            for (let i = 0; i < query.length; i++) {
                if (!cfg.running) return;
                const char = query[i];
                input.value += char;
                input.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
                const delay = Math.floor(Math.random() * (maxT - minT + 1)) + minT;
                await wait(delay);
            }
        }

        await wait(200);
        UI.st.textContent = 'SEARCH';

        cfg.count++;
        Storage.setSession('count', cfg.count);
        sync();

        const form = input?.form || document.querySelector('#sb_form');
        const btn = document.querySelector('#sb_form_go') || document.querySelector('.b_searchboxSubmit');

        try {
            if (input) {
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            }
        } catch (_) {}

        if (btn) {
            btn.click();
        } else if (form && typeof form.requestSubmit === 'function') {
            try { form.requestSubmit(); } catch (_) { form.submit(); }
        }

        setTimeout(() => {
            if (cfg.running) {
                window.location.href = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
            }
        }, 800);
    }

    async function step() {
        try {
            const query = await fetchQuery();
            if (cfg.running) await runSearch(query);
        } catch (_) {
            if (cfg.running) setTimeout(schedule, 2000);
        }
    }

    function schedule() {
        if (!cfg.running) return;

        if (cfg.count >= cfg.max) {
            stop(false);
            UI.st.textContent = 'DONE';
            UI.st.className = 'bas-tag st-end';
            UI.tm.textContent = 'END';
            return;
        }

        const min = Math.min(cfg.minDelay, cfg.maxDelay);
        const max = Math.max(cfg.minDelay, cfg.maxDelay);
        let sec = Math.floor(Math.random() * (max - min + 1)) + min;

        UI.st.textContent = 'RUN';
        UI.st.className = 'bas-tag st-on';

        if (timer) clearInterval(timer);
        timer = setInterval(() => {
            if (!cfg.running) {
                clearInterval(timer);
                return;
            }
            sec--;
            UI.tm.textContent = `${sec}s`;
            if (sec <= 0) {
                clearInterval(timer);
                UI.tm.textContent = 'RUN';
                step();
            }
        }, 1000);
    }

    function start() {
        if (cfg.count >= cfg.max) {
            cfg.count = 0;
            Storage.setSession('count', 0);
            sync();
        }
        cfg.running = true;
        Storage.setSession('running', true);
        UI.start.disabled = true;
        UI.stop.disabled = false;
        acquireWakeLock();
        schedule();
    }

    function stop(manual = true) {
        cfg.running = false;
        Storage.setSession('running', false);
        if (timer) clearInterval(timer);
        releaseWakeLock();
        UI.start.disabled = false;
        UI.stop.disabled = true;
        UI.tm.textContent = 'PAUSED';
        if (manual) {
            UI.st.textContent = 'IDLE';
            UI.st.className = 'bas-tag st-id';
        }
    }

    function bind(el, fn) {
        if (!el) return;
        el.addEventListener('click', (e) => {
            e.preventDefault();
            fn();
        });
    }

    bind(UI.min, () => {
        const isMin = UI.hud.classList.toggle('min');
        cfg.minimized = isMin;
        Storage.set('minimized', isMin);
        UI.min.textContent = isMin ? '▲' : '—';
        clamp();
    });

    bind(UI.start, start);
    bind(UI.stop, () => stop(true));

    bind(UI.inSave, () => {
        cfg.max = parseInt(UI.inMax.value, 10) || 25;
        cfg.minType = parseInt(UI.inMinT.value, 10) || 200;
        cfg.maxType = parseInt(UI.inMaxT.value, 10) || 400;
        cfg.minDelay = parseInt(UI.inMinD.value, 10) || 10;
        cfg.maxDelay = parseInt(UI.inMaxD.value, 10) || 20;
        cfg.autoStart = UI.inAuto.checked;

        Storage.set('max', cfg.max);
        Storage.set('minType', cfg.minType);
        Storage.set('maxType', cfg.maxType);
        Storage.set('minDelay', cfg.minDelay);
        Storage.set('maxDelay', cfg.maxDelay);
        Storage.set('autoStart', cfg.autoStart);
        sync();
    });

    bind(UI.inRst, () => {
        cfg.count = 0;
        Storage.setSession('count', 0);
        sync();
    });

    if (cfg.running) {
        if (cfg.count >= cfg.max) {
            stop(false);
            UI.st.textContent = 'DONE';
            UI.st.className = 'bas-tag st-end';
        } else {
            UI.start.disabled = true;
            UI.stop.disabled = false;
            acquireWakeLock();
            schedule();
        }
    } else if (cfg.autoStart && cfg.count < cfg.max) {
        start();
    } else {
        stop(false);
    }
})();