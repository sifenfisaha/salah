// GSettings, and the plain config object the engine reads.
//
// The engine never sees GSettings: `readConfig` turns the schema into the
// object `engine/day.js` documents, so the same code runs under node in the
// tests. Enum keys are read as their nicks, which are the ids the engine
// uses, so there is no mapping table to keep in step.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { APP_ID, inFlatpak } from './paths.js';
import * as PrayerTimes from '../engine/prayer-times.js';

Gio._promisify(Gio.DBusConnection.prototype, 'call', 'call_finish');

export const TUNE_KEYS = Object.fromEntries(PrayerTimes.PRAYER_NAMES.map(k => [k, `tune-${k}`]));
export const ADHAN_KEYS = Object.fromEntries(PrayerTimes.PRAYED_NAMES.map(k => [k, `adhan-${k}`]));

let settings = null;

export function getSettings() {
    settings ??= new Gio.Settings({ schema_id: APP_ID });
    return settings;
}

// ------------------------------------------------------------ the desktop's clock
//
// Outside a sandbox the desktop's own clock preference is the
// org.gnome.desktop.interface schema, when it is installed; elsewhere
// 24-hour is assumed. Inside a Flatpak that schema exists too, but it is
// the sandbox's private copy and never reflects the host, so the Settings
// portal is asked instead. It answers from the host and reports changes;
// the answer is cached, and `watchSystemClockFormat` says when it moves.

const PORTAL_NAME = 'org.freedesktop.portal.Desktop';
const PORTAL_PATH = '/org/freedesktop/portal/desktop';
const PORTAL_SETTINGS = 'org.freedesktop.portal.Settings';
const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';

let interfaceSettings;
let portalFormat = null;
let portalAsked = false;
const portalWatchers = new Set();

export function getInterfaceSettings() {
    if (interfaceSettings !== undefined)
        return interfaceSettings;
    const source = Gio.SettingsSchemaSource.get_default();
    const schema = source?.lookup(INTERFACE_SCHEMA, true) ?? null;
    interfaceSettings = schema ? new Gio.Settings({ settings_schema: schema }) : null;
    return interfaceSettings;
}

// The portal wraps a value in a variant, and its older Read call in two.
function unwrapVariant(value) {
    while (value instanceof GLib.Variant && value.get_type_string() === 'v')
        value = value.get_variant();
    return value;
}

function acceptPortalFormat(value) {
    const format = unwrapVariant(value).get_string()[0] === '12h' ? '12h' : '24h';
    if (format === portalFormat)
        return;
    portalFormat = format;
    for (const callback of portalWatchers)
        callback();
}

async function askPortal() {
    portalAsked = true;
    const bus = Gio.DBus.session;
    bus.signal_subscribe(PORTAL_NAME, PORTAL_SETTINGS, 'SettingChanged', PORTAL_PATH, null,
        Gio.DBusSignalFlags.NONE, (_c, _s, _p, _i, _signal, params) => {
            try {
                const namespace = params.get_child_value(0).get_string()[0];
                const key = params.get_child_value(1).get_string()[0];
                if (namespace === INTERFACE_SCHEMA && key === 'clock-format')
                    acceptPortalFormat(params.get_child_value(2));
            } catch (e) {
                logError(e, 'Unexpected clock-format change from the portal');
            }
        });
    // ReadOne is the current call; Read is what portals before 1.17 offer.
    for (const method of ['ReadOne', 'Read']) {
        try {
            const result = await bus.call(PORTAL_NAME, PORTAL_PATH, PORTAL_SETTINGS, method,
                new GLib.Variant('(ss)', [INTERFACE_SCHEMA, 'clock-format']),
                new GLib.VariantType('(v)'), Gio.DBusCallFlags.NONE, 2000, null);
            acceptPortalFormat(result.get_child_value(0));
            return;
        } catch (e) {
            if (method === 'Read')
                log(`The desktop's clock format is not available from the portal: ${e.message}`);
        }
    }
}

export function systemClockFormat() {
    if (inFlatpak()) {
        if (!portalAsked)
            askPortal().catch(logError);
        return portalFormat ?? '24h';
    }
    const iface = getInterfaceSettings();
    if (iface && iface.settings_schema.has_key('clock-format'))
        return iface.get_string('clock-format') === '12h' ? '12h' : '24h';
    return '24h';
}

// Calls back when the desktop's clock preference changes.
export function watchSystemClockFormat(callback) {
    if (inFlatpak()) {
        portalWatchers.add(callback);
        if (!portalAsked)
            askPortal().catch(logError);
        return;
    }
    getInterfaceSettings()?.connect('changed::clock-format', () => callback());
}

export function resolvedClockFormat(s = getSettings()) {
    const own = s.get_string('clock-format');
    return own === 'system' ? systemClockFormat() : own;
}

export function readLocation(s = getSettings()) {
    if (!s.get_boolean('has-location'))
        return null;
    return {
        name: s.get_string('location-name'),
        latitude: s.get_double('latitude'),
        longitude: s.get_double('longitude'),
    };
}

// The four keys change together, so other watchers never see a name with
// the previous coordinates.
export function writeLocation(s, { name, latitude, longitude }) {
    s.delay();
    s.set_string('location-name', String(name ?? ''));
    s.set_double('latitude', Number(latitude));
    s.set_double('longitude', Number(longitude));
    s.set_boolean('has-location', true);
    s.apply();
}

export function readConfig(s = getSettings()) {
    const tune = {};
    for (const [key, name] of Object.entries(TUNE_KEYS))
        tune[key] = s.get_int(name);
    const adhan = {};
    for (const [key, name] of Object.entries(ADHAN_KEYS))
        adhan[key] = s.get_boolean(name);

    return {
        location: readLocation(s),
        method: s.get_string('method'),
        madhab: s.get_string('madhab'),
        highLats: s.get_string('high-latitudes'),
        tune,
        adhan,
        playAdhan: s.get_boolean('play-adhan'),
        voice: s.get_string('voice'),
        customFile: s.get_string('custom-adhan-file'),
        volume: s.get_int('volume'),
        notifications: s.get_boolean('notifications'),
        reminderMinutes: s.get_int('reminder-minutes'),
        hijriOffset: s.get_int('hijri-offset'),
        hijriAutoOffset: s.get_int('hijri-auto-offset'),
        hijriSync: s.get_boolean('hijri-sync'),
        clockFormat: resolvedClockFormat(s),
        showSeconds: s.get_boolean('show-seconds'),
        runInBackground: s.get_boolean('run-in-background'),
    };
}
