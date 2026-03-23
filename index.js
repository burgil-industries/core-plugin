'use strict';
const EventEmitter = require('events');
const path         = require('path');

// ── EventBus ──────────────────────────────────────────────────────────────────
class EventBus extends EventEmitter {}

// ── Config ────────────────────────────────────────────────────────────────────
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

// ── Logger ────────────────────────────────────────────────────────────────────
function makeLogger(events) {
    return function log(msg, level = 'INFO') {
        const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
        console.log(line);
        events.emit('core:log', { level, msg, line });
    };
}

// ── Plugin install ────────────────────────────────────────────────────────────
module.exports = {
    install(ctx) {
        const bus    = new EventBus();
        const config = new Config(ctx);
        const log    = makeLogger(bus);

        ctx.provide('events', bus);
        ctx.provide('config', config);
        ctx.provide('log',    log);

        log(`core plugin loaded`);
    }
};
