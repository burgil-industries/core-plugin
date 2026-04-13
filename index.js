// Copyright (c) 2026 COMPUTER. Provided "AS IS" without warranty. See LICENSE for full terms.
'use strict';
const EventEmitter = require('events');
const path         = require('path');

// Feature flags: safe defaults shipped with the app.
// Only written on first run (if the key is absent); user values are never overwritten.
const FEATURE_DEFAULTS = {
    'features.experimental'        : false,
    'features.unrestricted_exec'   : false,
    'features.unrestricted_network': false,
};

// -- EventBus ------------------------------------------------------------------
class EventBus extends EventEmitter {}

// -- Hooks (WordPress-style actions & filters) ---------------------------------
// Actions: fire-and-forget callbacks for side effects (e.g. log, notify).
// Filters: callbacks that transform a value through a chain (e.g. modify path).
//
// Built-in hook names:
//   'app:launch'              - fired when the app starts, after all plugins load
//   'app:file-open'           - fired when a .computer file is opened ({path, meta})
//   'app:protocol'            - fired on computer:// URI ({uri, host, path, query})
//   'app:before-install'      - fired before a plugin install ({pluginId, version})
//   'app:shutdown'            - fired before the app exits
//
class Hooks {
    constructor() {
        this._actions = {};   // hookName -> [{callback, priority, pluginId}]
        this._filters = {};   // hookName -> [{callback, priority, pluginId}]
    }

    addAction(hook, callback, priority = 10, pluginId = null) {
        if (!this._actions[hook]) this._actions[hook] = [];
        // Log when multiple plugins register on the same hook
        const existing = this._actions[hook].filter(h => h.pluginId && h.pluginId !== pluginId);
        if (pluginId && existing.length > 0) {
            const others = [...new Set(existing.map(h => h.pluginId))].join(', ');
            console.log(`[hooks] action "${hook}": "${pluginId}" joining [${others}]`);
        }
        this._actions[hook].push({ callback, priority, pluginId });
        this._actions[hook].sort((a, b) => a.priority - b.priority);
    }

    removeAction(hook, callback) {
        if (!this._actions[hook]) return;
        this._actions[hook] = this._actions[hook].filter(h => h.callback !== callback);
    }

    async doAction(hook, data = {}) {
        if (!this._actions[hook]) return;
        for (const { callback } of this._actions[hook]) {
            await callback(data);
        }
    }

    addFilter(hook, callback, priority = 10, pluginId = null) {
        if (!this._filters[hook]) this._filters[hook] = [];
        // Filters are chained, so multiple is expected - but warn when a
        // second plugin registers on an overridable built-in filter
        const existing = this._filters[hook].filter(h => h.pluginId && h.pluginId !== pluginId);
        if (pluginId && existing.length > 0) {
            const others = [...new Set(existing.map(h => h.pluginId))].join(', ');
            console.warn(`[hooks] filter "${hook}": "${pluginId}" added after [${others}] - filters chain in priority order, last writer wins`);
        }
        this._filters[hook].push({ callback, priority, pluginId });
        this._filters[hook].sort((a, b) => a.priority - b.priority);
    }

    removeFilter(hook, callback) {
        if (!this._filters[hook]) return;
        this._filters[hook] = this._filters[hook].filter(h => h.callback !== callback);
    }

    async applyFilters(hook, value, data = {}) {
        if (!this._filters[hook]) return value;
        for (const { callback } of this._filters[hook]) {
            value = await callback(value, data);
        }
        return value;
    }

    /**
     * Inspect all registered hooks. Returns an object mapping hook names to
     * arrays of { type, pluginId, priority } for the manager UI.
     */
    getRegistrations() {
        const result = {};
        for (const [hook, entries] of Object.entries(this._actions)) {
            if (!result[hook]) result[hook] = [];
            for (const e of entries) {
                result[hook].push({ type: 'action', pluginId: e.pluginId, priority: e.priority });
            }
        }
        for (const [hook, entries] of Object.entries(this._filters)) {
            if (!result[hook]) result[hook] = [];
            for (const e of entries) {
                result[hook].push({ type: 'filter', pluginId: e.pluginId, priority: e.priority });
            }
        }
        return result;
    }
}

// -- Config --------------------------------------------------------------------
class Config {
    constructor(ctx) {
        this._ctx  = ctx;
        this._file = path.join(ctx.dataDir, 'config.json');
        this._data = {};
        this._load();
    }

    _load() {
        try { this._data = JSON.parse(this._ctx.readFile(this._file)); }
        catch (_) { this._data = {}; }
    }

    get(key, def = undefined) {
        return key in this._data ? this._data[key] : def;
    }

    set(key, val) {
        this._data[key] = val;
        try { this._ctx.writeFile(this._file, JSON.stringify(this._data, null, 2)); }
        catch (e) { console.error(`[core] config write failed: ${e.message}`); }
    }

    all() { return Object.assign({}, this._data); }
}

// -- Logger --------------------------------------------------------------------
function makeLogger(events) {
    return function log(msg, level = 'INFO') {
        const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
        console.log(line);
        events.emit('core:log', { level, msg, line });
    };
}

// -- Plugin install ------------------------------------------------------------
module.exports = {
    install(ctx) {
        const bus    = new EventBus();
        const hooks  = new Hooks();
        const config = new Config(ctx);
        const log    = makeLogger(bus);

        ctx.provide('events', bus);
        ctx.provide('hooks',  hooks);
        ctx.provide('config', config);
        ctx.provide('log',    log);

        // Seed feature flags with safe defaults on first run
        for (const [key, def] of Object.entries(FEATURE_DEFAULTS)) {
            if (config.get(key) === undefined) config.set(key, def);
        }

        log(`core plugin loaded`);
    }
};
