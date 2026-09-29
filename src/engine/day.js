// The day model, formatting, and the decisions that the window, the
// announcer and the state file all need to agree on.
//
// Everything here is a pure function of a plain config object, so the same
// numbers appear everywhere they are shown, and node can test all of it
// without GNOME. The config object is built from GSettings by
// services/settings.js; nothing in this file knows where it came from.

import * as PrayerTimes from './prayer-times.js';
import * as Hijri from './hijri.js';
import * as Voices from './voices.js';

const N_ = globalThis.N_ ?? (s => s);

// The shape services/settings.js produces. Kept here so tests and defaults
// have one source of truth for it.
export function defaults() {
    return {
        location: null,
        method: 'mwl',
        madhab: 'standard',
        highLats: 'angle-based',
        tune: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
        adhan: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
        playAdhan: true,
        voice: Voices.DEFAULT,
        customFile: '',
        volume: 75,
        notifications: true,
        reminderMinutes: 10,
        hijriOffset: 0,
        hijriAutoOffset: 0,
        hijriSync: true,
        clockFormat: '24h',
        showSeconds: true,
        runInBackground: true,
    };
}

export function hasCoordinates(location) {
    return Boolean(location) &&
        Number.isFinite(Number(location.latitude)) &&
        Number.isFinite(Number(location.longitude)) &&
        location.latitude !== null && location.longitude !== null;
}

export function timesConfig(config) {
    const location = config.location;
    return {
        latitude: location ? Number(location.latitude) : 0,
        longitude: location ? Number(location.longitude) : 0,
        method: config.method,
        asr: config.madhab,
        highLats: config.highLats,
        tune: config.tune,
    };
}

// The chosen voice, falling back to the bundled recording for an id this
// version does not know, such as one removed from the catalogue.
export function voiceSelection(config) {
    const id = String(config.voice || '');
    return Voices.isKnown(id) ? id : Voices.FALLBACK;
}

// ------------------------------------------------------------------ formatting
export function pad(n) { return n < 10 ? `0${n}` : String(n); }

export function formatTime(date, clockFormat) {
    if (!date)
        return '--:--';
    const h = date.getHours();
    const m = date.getMinutes();
    if (clockFormat === '12h') {
        const suffix = h >= 12 ? 'PM' : 'AM';
        let h12 = h % 12;
        if (h12 === 0)
            h12 = 12;
        return `${h12}:${pad(m)} ${suffix}`;
    }
    return `${pad(h)}:${pad(m)}`;
}

// Countdown as H:MM:SS, dropping the hours once inside the last hour.
export function formatCountdown(ms, showSeconds) {
    if (!Number.isFinite(ms) || ms < 0)
        ms = 0;
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;

    if (!showSeconds) {
        // Round up so a label reading "1m" never sits there for a full minute
        // before the adhan; it reads 1m until the moment it reads now.
        const mins = Math.ceil(total / 60);
        if (mins >= 60)
            return `${Math.floor(mins / 60)}h ${mins % 60}m`;
        return `${mins}m`;
    }
    if (h > 0)
        return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
}

// Hours and minutes left, rounded to the minute, for the UI to phrase with
// its own plural forms. `now` is true inside the last half minute.
export function durationParts(ms) {
    if (!Number.isFinite(ms) || ms < 0)
        ms = 0;
    const total = Math.round(ms / 1000);
    let h = Math.floor(total / 3600);
    let m = Math.round((total % 3600) / 60);
    if (m === 60) {
        h += 1;
        m = 0;
    }
    return { hours: h, minutes: m, now: h === 0 && m === 0 };
}

// Long English phrasing for the state file and the command line.
export function formatDuration(ms) {
    const { hours: h, minutes: m, now } = durationParts(ms);
    if (now)
        return 'now';
    if (h > 0 && m > 0)
        return `${h} hr ${m} min`;
    if (h > 0)
        return `${h} hr`;
    return `${m} min`;
}

export function prayerLabel(key) {
    const entry = PrayerTimes.LABELS[key];
    return entry ? entry.en : key;
}

export function prayerLabelAr(key) {
    const entry = PrayerTimes.LABELS[key];
    return entry ? entry.ar : '';
}

export function totalHijriOffset(config) {
    return (Number(config.hijriOffset) || 0) + (Number(config.hijriAutoOffset) || 0);
}

export function hijriText(h) {
    return `${h.day} ${Hijri.monthName(h.month)} ${h.year} AH`;
}

// ------------------------------------------------------------------ the day
//
// One object with everything a surface needs to draw: today's table, where we
// are in it, and what comes next. Built fresh on each tick — it is a few
// dozen float operations, far cheaper than caching it correctly would be.
export function buildDay(now, config) {
    if (!hasCoordinates(config.location))
        return null;

    const cfg = timesConfig(config);
    const today = PrayerTimes.timesForDate(now, cfg);

    // One schedule, spanning yesterday through tomorrow, answers both "what
    // is next" and "what are we inside of" — and, for the announcer, "what
    // just became due". Building it once is what keeps a per-second tick
    // cheap.
    const schedule = PrayerTimes.buildSchedule(now, cfg);
    const next = PrayerTimes.findNext(schedule, now, true);
    const current = PrayerTimes.findCurrent(schedule, now, true);

    const rows = PrayerTimes.PRAYER_NAMES.map(key => {
        const date = today[key];
        return {
            key,
            label: prayerLabel(key),
            labelAr: prayerLabelAr(key),
            icon: PrayerTimes.iconName(key),
            date,
            isPrayer: key !== 'sunrise',
            isNext: next !== null && next.key === key && next.dayOffset === 0,
            isCurrent: current !== null && current.key === key && current.dayOffset === 0,
            isPast: date !== null && date.getTime() <= now.getTime(),
            adhan: key !== 'sunrise' && config.adhan[key] !== false,
        };
    });

    // Fraction of the way from the previous prayer to the next, for the
    // progress ring. Null before the first prayer of the very first day we
    // can see.
    let progress = null;
    if (current && next) {
        const span = next.date.getTime() - current.date.getTime();
        if (span > 0)
            progress = Math.max(0, Math.min(1, (now.getTime() - current.date.getTime()) / span));
    }

    const offset = totalHijriOffset(config);
    const hijri = Hijri.fromDate(now, offset);

    return {
        rows,
        times: today,
        // Announcing walks this rather than `rows`: an Isha that falls after
        // midnight belongs to the previous calendar day, so it is absent from
        // the new day's table and would otherwise never be announced at all.
        schedule,
        next,
        current,
        progress,
        remainingMs: next ? Math.max(0, next.date.getTime() - now.getTime()) : 0,
        hijri,
        hijriText: hijriText(hijri),
        hijriNote: Hijri.monthNote(hijri.month, hijri.day),
        period: periodFor(current),
    };
}

// Which part of the day we are in, named for the tint the hero card takes.
export function periodFor(current) {
    if (!current)
        return 'night';
    switch (current.key) {
    case 'fajr': return 'dawn';
    case 'sunrise': return 'morning';
    case 'dhuhr': return 'day';
    case 'asr': return 'afternoon';
    case 'maghrib': return 'dusk';
    default: return 'night';
    }
}

// ------------------------------------------------------------------ announcements
//
// One announcement is identified by the prayer's day, name and minute. The
// minute is deliberate: a prayer whose time moves — a tune, a new method, a
// new city — becomes a new announcement rather than one already made.
export function announceStamp(date, key) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `:${key}:${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Everything that has become due since the last tick, and what to do about
// it. `alreadyFired(stamp)` says what was handled before.
//
// The grace window is what makes suspend-and-resume sane: a prayer whose
// moment passed while the lid was shut is reported as `missed`, to be marked
// and skipped, instead of three adhans at once when the laptop wakes up.
export function pendingAnnouncements(schedule, now, { graceSeconds, reminderMinutes, alreadyFired }) {
    const out = [];
    for (const entry of schedule) {
        if (!entry.isPrayer || !entry.date)
            continue;

        const elapsed = (now.getTime() - entry.date.getTime()) / 1000;
        // Yesterday's prayers are in the schedule so the countdown can look
        // backwards; they are far outside the grace window and only exist
        // here to be marked, so skip them before they cost anything.
        if (elapsed > 86400)
            continue;

        const stamp = announceStamp(entry.date, entry.key);

        if (elapsed >= 0) {
            if (!alreadyFired(stamp))
                out.push({ kind: elapsed <= graceSeconds ? 'prayer' : 'missed', entry, stamp });
            continue;
        }

        if (reminderMinutes > 0) {
            const until = -elapsed;
            const reminderStamp = `${stamp}:pre`;
            if (until <= reminderMinutes * 60 && until > reminderMinutes * 60 - graceSeconds &&
                !alreadyFired(reminderStamp))
                out.push({ kind: 'reminder', entry, stamp: reminderStamp });
        }
    }
    return out;
}

export function parseAnnounced(text) {
    const out = { announced: [], hijriSyncDay: '' };
    try {
        const json = JSON.parse(String(text || ''));
        if (!json || typeof json !== 'object')
            return out;
        if (Array.isArray(json.announced))
            out.announced = json.announced.filter(s => typeof s === 'string');
        if (typeof json.hijriSyncDay === 'string')
            out.hijriSyncDay = json.hijriSyncDay;
    } catch {
        // Unreadable means the same as absent: nothing is known to be
        // announced.
    }
    return out;
}

export function serializeAnnounced(announced, hijriSyncDay) {
    return `${JSON.stringify({ announced, hijriSyncDay }, null, 2)}\n`;
}

// The two days of history the guard needs; trimming keeps the file from
// growing without bound.
export function trimAnnounced(list, keep = 24) {
    return list.length > keep ? list.slice(list.length - keep) : list;
}

export function dayKey(date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// ------------------------------------------------------------------ hijri sync
//
// Given the day-of-month an authority publishes for today, the correction
// that reproduces it, searched in a small window around the user's own
// offset. Anything larger than three days would be a parsing problem, not
// calendar drift, so null leaves the date alone.
export function hijriCorrection(authoritativeDay, now, config) {
    if (!Number.isFinite(authoritativeDay))
        return null;
    const own = Number(config.hijriOffset) || 0;
    for (let delta = -3; delta <= 3; delta++) {
        if (Hijri.fromDate(now, own + delta).day === authoritativeDay)
            return delta;
    }
    return null;
}

// The response of https://api.aladhan.com/v1/gToH/DD-MM-YYYY.
export function parseHijriResponse(text) {
    try {
        const json = JSON.parse(String(text || ''));
        const day = Number(json.data.hijri.day);
        return Number.isFinite(day) ? day : null;
    } catch {
        return null;
    }
}

// ------------------------------------------------------------------ lookups
export function clamp(value, lo, hi) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return lo;
    return Math.max(lo, Math.min(hi, n));
}

// Geocoding results from Open-Meteo, shaped for the location picker.
export function parseGeocodingResults(text) {
    try {
        const json = JSON.parse(String(text || ''));
        const results = json.results || [];
        return results.slice(0, 8).map(r => {
            const parts = [r.name];
            if (r.admin1 && r.admin1 !== r.name)
                parts.push(r.admin1);
            if (r.country)
                parts.push(r.country);
            return {
                name: r.name,
                label: parts.join(', '),
                detail: parts.slice(1).join(', '),
                latitude: r.latitude,
                longitude: r.longitude,
            };
        });
    } catch {
        return [];
    }
}

function numOrNull(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
}

export function parseIpLocation(text) {
    try {
        const json = JSON.parse(String(text || ''));
        const lat = numOrNull(json.latitude !== undefined ? json.latitude : json.lat);
        const lon = numOrNull(json.longitude !== undefined ? json.longitude : json.lon);
        if (lat === null || lon === null)
            return null;
        const parts = [json.city, json.country_name || json.country].filter(Boolean);
        return { name: parts.join(', '), latitude: lat, longitude: lon };
    } catch {
        return null;
    }
}

// What the window prints for a location: its name, or the coordinates when it
// came without one.
export function locationName(location) {
    if (!hasCoordinates(location))
        return '';
    if (String(location.name || '').trim().length > 0)
        return location.name;
    return `${Number(location.latitude).toFixed(2)}, ${Number(location.longitude).toFixed(2)}`;
}

// ------------------------------------------------------------------ state file
//
// A machine-readable copy of today's table, so scripts and `cat` can see
// what the app is showing without reimplementing the astronomy.
export function stateSnapshot(day, config, now = new Date()) {
    const times = {};
    for (const row of day.rows)
        times[row.key] = row.date ? row.date.toISOString() : null;
    return {
        updated: now.toISOString(),
        location: config.location,
        method: config.method,
        madhab: config.madhab,
        hijri: day.hijriText,
        next: day.next
            ? { name: prayerLabel(day.next.key), key: day.next.key, at: day.next.date.toISOString() }
            : null,
        times,
    };
}

export const DERIVED = [
    { key: 'imsak', label: N_('Imsak'), hint: N_('Stop eating before Fajr') },
    { key: 'duha', label: N_('Duha'), hint: N_('The forenoon prayer opens') },
    { key: 'sunset', label: N_('Sunset'), hint: N_('The day ends') },
    { key: 'midnight', label: N_('Midnight'), hint: N_('Islamic midnight') },
    { key: 'lastThird', label: N_('Last third'), hint: N_('The night prayer') },
];
