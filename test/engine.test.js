// Golden-value regression tests for the engine.
//
// The expectations were cross-checked against api.aladhan.com, which
// implements the same PrayTimes model, and independently against adhan-js.
// Where the two references disagreed the value here sits between them; where
// they agreed it matches both exactly.
//
//   node --test test/
//
// No network and no dependencies beyond node itself: the point of the file
// is to catch a change to the astronomy that nobody meant to make.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Expected values are local wall-clock times in Addis Ababa, so the tests fix
// their own zone rather than depending on the machine they run on. Node
// re-reads TZ on assignment, and the engine constructs no Date at import
// time, so setting it here is early enough.
process.env.TZ = 'Africa/Addis_Ababa';

import * as PT from '../src/engine/prayer-times.js';
import * as H from '../src/engine/hijri.js';
import * as V from '../src/engine/voices.js';
import * as D from '../src/engine/day.js';

const hhmm = d => d
    ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : '--:--';

function times(y, m, d, cfg) {
    return PT.timesForDate(new Date(y, m - 1, d), cfg);
}

// --- Addis Ababa, the reference city ---------------------------------------
const ADDIS = { latitude: 9.0192, longitude: 38.7525 };

test('Addis Ababa, Muslim World League, 27 September 2026', () => {
    const t = times(2026, 9, 27, { ...ADDIS, method: 'mwl', asr: 'standard' });
    assert.equal(hhmm(t.fajr), '05:04');
    assert.equal(hhmm(t.sunrise), '06:14');
    assert.equal(hhmm(t.dhuhr), '12:16');
    assert.equal(hhmm(t.asr), '15:32');
    assert.equal(hhmm(t.maghrib), '18:18');
    assert.equal(hhmm(t.isha), '19:24');
});

test('Hanafi Asr is later', () => {
    const t = times(2026, 9, 27, { ...ADDIS, method: 'mwl', asr: 'hanafi' });
    assert.equal(hhmm(t.asr), '16:35');
});

test('Egyptian General Authority angles', () => {
    const t = times(2026, 9, 27, { ...ADDIS, method: 'egypt', asr: 'standard' });
    assert.equal(hhmm(t.fajr), '04:58');
    assert.equal(hhmm(t.isha), '19:26');
});

// Diyanet publishes fixed corrections on top of the angles; without them the
// method silently returns times no mosque in Turkey would recognise.
test('Diyanet fixed adjustments', () => {
    const t = times(2026, 9, 27, { ...ADDIS, method: 'turkey', asr: 'standard' });
    assert.equal(hhmm(t.sunrise), '06:07');
    assert.equal(hhmm(t.dhuhr), '12:21');
    assert.equal(hhmm(t.asr), '15:36');
    assert.equal(hhmm(t.maghrib), '18:25');
});

// Umm al-Qura defines Isha as a fixed interval after Maghrib, not an angle.
test('Umm al-Qura Isha is Maghrib plus 90 minutes', () => {
    const t = times(2026, 9, 27, { ...ADDIS, method: 'makkah', asr: 'standard' });
    assert.equal(Math.round((t.isha - t.maghrib) / 60000), 90);
});

test('Derived times', () => {
    const t = times(2026, 9, 27, { ...ADDIS, method: 'mwl', asr: 'standard' });
    assert.equal(Math.round((t.duha - t.sunrise) / 60000), 15);
    assert.ok(t.lastThird > t.midnight, 'the last third begins after the midpoint');
    assert.equal(Math.round((t.fajr - t.imsak) / 60000), 10);
});

test('Per-prayer tune moves only that prayer', () => {
    const base = times(2026, 9, 27, { ...ADDIS, method: 'mwl', asr: 'standard' });
    const tuned = times(2026, 9, 27, { ...ADDIS, method: 'mwl', asr: 'standard', tune: { asr: 7 } });
    assert.equal(Math.round((tuned.asr - base.asr) / 60000), 7);
    assert.equal(tuned.fajr.getTime(), base.fajr.getTime());
});

// --- Ordering invariants, swept across a whole year --------------------------
// Ordering is the property a user notices instantly when it breaks, and the
// one most likely to break quietly at an odd latitude or season.
for (const place of [
    { n: 'Addis Ababa', latitude: 9.0192, longitude: 38.7525 },
    { n: 'Jakarta', latitude: -6.2088, longitude: 106.8456 },
    { n: 'London', latitude: 51.5074, longitude: -0.1278 },
    { n: 'Oslo', latitude: 59.9139, longitude: 10.7522 },
]) {
    test(`${place.n}: every prayer is defined and in order all year`, () => {
        for (let doy = 1; doy <= 365; doy += 7) {
            const d = new Date(2026, 0, doy);
            const t = times(d.getFullYear(), d.getMonth() + 1, d.getDate(),
                { ...place, method: 'mwl', asr: 'standard', highLats: 'angle-based' });
            for (const k of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'])
                assert.ok(t[k] && !isNaN(t[k].getTime()), `${k} on day ${doy}`);
            assert.ok(t.fajr < t.sunrise && t.sunrise < t.dhuhr && t.dhuhr < t.asr &&
                t.asr < t.maghrib && t.maghrib < t.isha, `order on day ${doy}`);
        }
    });
}

test('Every method and rule computes a full table in London at midsummer', () => {
    for (const method of PT.METHOD_ORDER) {
        for (const highLats of PT.HIGH_LATITUDE_ORDER) {
            const t = times(2026, 6, 21, { latitude: 51.5, longitude: -0.1, method, asr: 'standard', highLats });
            for (const k of PT.PRAYER_NAMES) {
                // "None" is the one rule that is allowed to give up: on a
                // midsummer night at 51° the sun never reaches 18° below the
                // horizon, so there is no true Fajr or Isha to report.
                if (highLats === 'none' && (k === 'fajr' || k === 'isha'))
                    continue;
                assert.ok(t[k] instanceof Date, `${method}/${highLats}/${k}`);
            }
        }
    }
});

test('The "none" rule reports an undefined twilight rather than inventing one', () => {
    const t = times(2026, 6, 21, { latitude: 51.5, longitude: -0.1, method: 'mwl', asr: 'standard', highLats: 'none' });
    assert.equal(t.fajr, null);
    assert.equal(D.formatTime(t.fajr, '24h'), '--:--');
    const sched = PT.buildSchedule(new Date(2026, 5, 21, 12), { latitude: 51.5, longitude: -0.1, method: 'mwl', asr: 'standard', highLats: 'none' });
    assert.ok(sched.every(e => e.date instanceof Date), 'undefined times are left out of the schedule');
});

// --- Schedule spans midnight ------------------------------------------------
// At high latitudes Isha can land after midnight, which puts it on the
// previous calendar day's table and off the next day's. The announcer walks
// the schedule rather than one day's table precisely so that prayer still
// fires; this pins that the schedule really does carry it.
test('Oslo in June: an Isha after midnight is still reachable', () => {
    const oslo = { latitude: 59.9139, longitude: 10.7522, method: 'mwl', asr: 'standard', highLats: 'angle-based' };
    const table = PT.timesForDate(new Date(2026, 5, 21), oslo);
    assert.equal(table.isha.getDate(), 22, 'Isha on 21 June belongs to the small hours of the 22nd');

    const justBefore = new Date(table.isha.getTime() - 60 * 1000);
    const sched = PT.buildSchedule(justBefore, oslo);
    const next = PT.findNext(sched, justBefore, false);
    assert.equal(next && next.key, 'isha');
    assert.equal(next.date.getTime(), table.isha.getTime());
});

// --- Hijri ------------------------------------------------------------------
test('Hijri anchors a reader would notice being wrong', () => {
    const r = H.fromGregorian(2026, 2, 19, 0);
    assert.equal(`${r.day}/${r.month}`, '2/9', 'Ramadan 1447 begins 18 February 2026');
    const e = H.fromGregorian(2026, 3, 20, 0);
    assert.equal(`${e.day}/${e.month}`, '1/10', 'Eid al-Fitr 1447 on 20 March 2026');
    assert.equal(H.fromGregorian(2026, 9, 27, 2).day - H.fromGregorian(2026, 9, 27, 0).day, 2, 'the offset shifts the day');
});

test('Month notes prefer the specific day', () => {
    assert.equal(H.monthNote(12, 10), 'Eid al-Adha');
    assert.equal(H.monthNote(12, 9), 'Days of Hajj');
    assert.equal(H.monthNote(9, 3), 'Ramadan — month of fasting');
    assert.equal(H.monthNote(3, 3), '');
});

// --- Formatting -------------------------------------------------------------
test('Time formats', () => {
    const d = new Date(2026, 8, 27, 19, 4);
    assert.equal(D.formatTime(d, '24h'), '19:04');
    assert.equal(D.formatTime(d, '12h'), '7:04 PM');
    assert.equal(D.formatTime(new Date(2026, 8, 27, 0, 30), '12h'), '12:30 AM');
    assert.equal(D.formatTime(null, '24h'), '--:--');
});

test('Countdown formats', () => {
    assert.equal(D.formatCountdown(3 * 3600000 + 5 * 60000 + 9000, true), '3:05:09');
    assert.equal(D.formatCountdown(5 * 60000 + 9000, true), '5:09');
    assert.equal(D.formatCountdown(61000, false), '2m', 'rounds up so "1m" never lingers');
    assert.equal(D.formatCountdown(3 * 3600000 + 30 * 60000, false), '3h 30m');
    assert.equal(D.formatCountdown(-5, true), '0:00');
});

test('Duration phrasing', () => {
    assert.equal(D.formatDuration(8 * 3600000 + 7 * 60000), '8 hr 7 min');
    assert.equal(D.formatDuration(2 * 3600000), '2 hr');
    assert.equal(D.formatDuration(59.6 * 60000), '1 hr', 'rounds 59.6 minutes up into the hour');
    assert.equal(D.formatDuration(10000), 'now');
    assert.deepEqual(D.durationParts(90 * 60000), { hours: 1, minutes: 30, now: false });
});

// --- The day model ----------------------------------------------------------
test('buildDay marks next, current and past rows and reports progress', () => {
    const config = { ...D.defaults(), location: { name: 'Addis Ababa', ...ADDIS } };
    const now = new Date(2026, 8, 27, 14, 0);
    const day = D.buildDay(now, config);
    assert.equal(day.next.key, 'asr');
    assert.equal(day.current.key, 'dhuhr');
    assert.equal(day.rows.find(r => r.key === 'asr').isNext, true);
    assert.equal(day.rows.find(r => r.key === 'dhuhr').isCurrent, true);
    assert.equal(day.rows.find(r => r.key === 'fajr').isPast, true);
    assert.equal(day.rows.find(r => r.key === 'isha').isPast, false);
    assert.ok(day.progress > 0.5 && day.progress < 0.6, `progress ${day.progress} lies in the Dhuhr window`);
    assert.equal(day.period, 'day');
    assert.equal(day.hijriText, '14 Rabi\' al-Thani 1448 AH', 'the arithmetic calendar, before any correction');
    assert.equal(day.rows.find(r => r.key === 'sunrise').adhan, false, 'sunrise has no adhan');
});

test('buildDay is null without a location', () => {
    assert.equal(D.buildDay(new Date(), D.defaults()), null);
});

test('Periods follow the current window', () => {
    assert.equal(D.periodFor({ key: 'fajr' }), 'dawn');
    assert.equal(D.periodFor({ key: 'maghrib' }), 'dusk');
    assert.equal(D.periodFor(null), 'night');
});

// --- Announcements ----------------------------------------------------------
// A prayer whose time moves is a new announcement; the same time is not.
test('Announcement stamps carry day, prayer and minute', () => {
    const isha = new Date(2026, 8, 27, 19, 24);
    assert.equal(D.announceStamp(isha, 'isha'), '2026-09-27:isha:19:24');
    assert.notEqual(D.announceStamp(new Date(2026, 8, 27, 19, 3), 'isha'), D.announceStamp(isha, 'isha'));
});

test('Announced record round-trips and tolerates garbage', () => {
    const round = D.parseAnnounced(D.serializeAnnounced(['2026-09-27:isha:19:24'], '2026-9-27'));
    assert.deepEqual(round.announced, ['2026-09-27:isha:19:24']);
    assert.equal(round.hijriSyncDay, '2026-9-27');
    assert.equal(D.parseAnnounced('nope').announced.length, 0);
    assert.equal(D.trimAnnounced(Array.from({ length: 30 }, (_, i) => String(i))).length, 24);
});

test('Pending announcements: due, missed, and the reminder', () => {
    const cfg = { ...ADDIS, method: 'mwl', asr: 'standard', highLats: 'angle-based' };
    const asr = new Date(2026, 8, 27, 15, 32);
    const opts = { graceSeconds: 90, reminderMinutes: 10, alreadyFired: () => false };
    // The schedule also carries yesterday's Asr, which reads as missed; the
    // assertions below are about today's.
    const today = p => p.entry.key === 'asr' && p.entry.dayOffset === 0;

    // Thirty seconds after Asr: announce it.
    let due = D.pendingAnnouncements(PT.buildSchedule(asr, cfg), new Date(asr.getTime() + 30000), opts);
    let hit = due.find(today);
    assert.equal(hit.kind, 'prayer');
    assert.equal(hit.stamp, '2026-09-27:asr:15:32');

    // Ten minutes after: the laptop was asleep. Mark it, do not sound it.
    due = D.pendingAnnouncements(PT.buildSchedule(asr, cfg), new Date(asr.getTime() + 600000), opts);
    assert.equal(due.find(today).kind, 'missed');

    // Ten minutes before: the reminder, once.
    due = D.pendingAnnouncements(PT.buildSchedule(asr, cfg), new Date(asr.getTime() - 600000 + 5000), opts);
    hit = due.find(today);
    assert.equal(hit.kind, 'reminder');
    assert.equal(hit.stamp, '2026-09-27:asr:15:32:pre');

    // Already handled: nothing.
    due = D.pendingAnnouncements(PT.buildSchedule(asr, cfg), new Date(asr.getTime() + 30000),
        { ...opts, alreadyFired: () => true });
    assert.equal(due.length, 0);

    // On a first run, everything that passed in the last day is marked as
    // missed so it is never announced late.
    due = D.pendingAnnouncements(PT.buildSchedule(asr, cfg), new Date(asr.getTime() + 30000), opts);
    assert.ok(due.some(p => p.entry.dayOffset === -1 && p.kind === 'missed'));

    // Sunrise is never announced.
    const sunrise = new Date(2026, 8, 27, 6, 14);
    due = D.pendingAnnouncements(PT.buildSchedule(sunrise, cfg), new Date(sunrise.getTime() + 10000), opts);
    assert.equal(due.find(p => p.entry.key === 'sunrise'), undefined);
});

// --- Hijri sync -------------------------------------------------------------
test('Hijri correction finds the delta that reproduces the published day', () => {
    const now = new Date(2026, 8, 27);
    const config = D.defaults();
    const arithmetic = H.fromDate(now, 0).day;
    assert.equal(D.hijriCorrection(arithmetic, now, config), 0);
    assert.equal(D.hijriCorrection(arithmetic - 1, now, config), -1);
    assert.equal(D.hijriCorrection(arithmetic + 1, now, config), 1);
    assert.equal(D.hijriCorrection(NaN, now, config), null);
    assert.equal(D.parseHijriResponse('{"data":{"hijri":{"day":"16"}}}'), 16);
    assert.equal(D.parseHijriResponse('<html>'), null);
});

// --- Voices -----------------------------------------------------------------
// The catalogue is data the app acts on blindly, so every entry must be
// complete.
test('Voice catalogue is complete', () => {
    const ids = V.VOICES.map(v => v.id);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique');
    assert.equal(V.DEFAULT, 'madinah');
    assert.equal(ids[0], V.DEFAULT, 'the default is listed first');
    assert.equal(V.isDownloadable(V.voice(V.FALLBACK)), false, 'the fallback never needs the network');
    assert.equal(D.defaults().voice, V.DEFAULT);
    assert.equal(ids[ids.length - 1], 'custom', 'a custom file is offered last');
    for (const v of V.VOICES) {
        if (!V.isDownloadable(v))
            continue;
        assert.match(v.url, /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//);
        assert.ok(v.author && v.licence && v.licenceUrl && v.page && v.ext && v.bytes > 0 && v.seconds > 0, v.id);
    }
    assert.equal(V.voice('nope').id, 'bundled', 'an unknown id falls back to the bundled recording');
    assert.equal(D.voiceSelection({ voice: 'gone' }), 'bundled');
    assert.equal(`${V.sizeText(2973696)} ${V.sizeText(624640)}`, '2.8 MB 610 KB');
    assert.equal(V.durationText(187), '3:07');
});

// --- Lookups ----------------------------------------------------------------
test('Geocoding results are shaped for the picker', () => {
    const text = JSON.stringify({ results: [
        { name: 'Addis Ababa', admin1: 'Addis Ababa', country: 'Ethiopia', latitude: 9.02, longitude: 38.75 },
        { name: 'Oslo', admin1: 'Oslo County', country: 'Norway', latitude: 59.9, longitude: 10.7 },
    ] });
    const out = D.parseGeocodingResults(text);
    assert.equal(out.length, 2);
    assert.equal(out[0].label, 'Addis Ababa, Ethiopia', 'a region equal to the name is not repeated');
    assert.equal(out[1].label, 'Oslo, Oslo County, Norway');
    assert.equal(out[1].detail, 'Oslo County, Norway');
    assert.deepEqual(D.parseGeocodingResults('garbage'), []);
});

test('IP lookups accept both field spellings', () => {
    assert.deepEqual(D.parseIpLocation('{"city":"Addis Ababa","country_name":"Ethiopia","latitude":9.02,"longitude":38.75}'),
        { name: 'Addis Ababa, Ethiopia', latitude: 9.02, longitude: 38.75 });
    assert.deepEqual(D.parseIpLocation('{"lat":"1.5","lon":"2.5"}'), { name: '', latitude: 1.5, longitude: 2.5 });
    assert.equal(D.parseIpLocation('{"city":"x"}'), null);
});

test('Location names fall back to coordinates', () => {
    assert.equal(D.locationName({ name: 'Oslo', latitude: 59.9, longitude: 10.7 }), 'Oslo');
    assert.equal(D.locationName({ name: '', latitude: 59.9139, longitude: 10.7522 }), '59.91, 10.75');
    assert.equal(D.locationName(null), '');
});

test('State snapshot is ISO timestamps', () => {
    const config = { ...D.defaults(), location: { name: 'Addis Ababa', ...ADDIS } };
    const now = new Date(2026, 8, 27, 14, 0);
    const snap = D.stateSnapshot(D.buildDay(now, config), config, now);
    assert.equal(snap.next.key, 'asr');
    assert.match(snap.times.fajr, /^2026-09-27T02:04:00/);
    assert.equal(snap.method, 'mwl');
});
