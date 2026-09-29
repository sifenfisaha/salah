// GSettings, and the plain config object the engine reads.
//
// The engine never sees GSettings: `readConfig` turns the schema into the
// object `engine/day.js` documents, so the same code runs under node in the
// tests. Enum keys are read as their nicks, which are the ids the engine
// uses, so there is no mapping table to keep in step.

import Gio from 'gi://Gio';
import { APP_ID } from './paths.js';
import * as PrayerTimes from '../engine/prayer-times.js';

export const TUNE_KEYS = Object.fromEntries(PrayerTimes.PRAYER_NAMES.map(k => [k, `tune-${k}`]));
export const ADHAN_KEYS = Object.fromEntries(PrayerTimes.PRAYED_NAMES.map(k => [k, `adhan-${k}`]));

let settings = null;

export function getSettings() {
    settings ??= new Gio.Settings({ schema_id: APP_ID });
    return settings;
}

// The desktop's own clock preference, when the desktop has one. Outside
// GNOME the schema may not be installed, in which case 24-hour is assumed.
let interfaceSettings;

export function getInterfaceSettings() {
    if (interfaceSettings !== undefined)
        return interfaceSettings;
    const source = Gio.SettingsSchemaSource.get_default();
    const schema = source?.lookup('org.gnome.desktop.interface', true) ?? null;
    interfaceSettings = schema ? new Gio.Settings({ settings_schema: schema }) : null;
    return interfaceSettings;
}

export function resolvedClockFormat(s = getSettings()) {
    const own = s.get_string('clock-format');
    if (own !== 'system')
        return own;
    const iface = getInterfaceSettings();
    if (iface && iface.settings_schema.has_key('clock-format'))
        return iface.get_string('clock-format') === '12h' ? '12h' : '24h';
    return '24h';
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
