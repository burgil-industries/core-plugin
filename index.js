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
        const config = new Config(ctx);
        const log    = makeLogger(bus);

        ctx.provide('events', bus);
        ctx.provide('config', config);
        ctx.provide('log',    log);

        // Seed feature flags with safe defaults on first run
        for (const [key, def] of Object.entries(FEATURE_DEFAULTS)) {
            if (config.get(key) === undefined) config.set(key, def);
        }

        log(`core plugin loaded`);
    }
};
