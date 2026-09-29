// Prayer-time astronomy.
//
// Implements the solar-position model used by PrayTimes.org: mean anomaly and
// mean longitude give the ecliptic longitude, which yields the equation of time
// and the sun's declination for a given Julian day. Every prayer is then either
// a fixed hour angle away from solar noon (Fajr/Isha/sunrise/sunset) or a
// shadow-ratio time (Asr).
//
// Times are computed iteratively: each prayer's declination depends on the
// moment it occurs, which is what we are solving for, so we seed with rough
// hours and refine. Two passes converge to well under a second.
//
// All trigonometry here is in degrees, matching how the source formulae and
// every published method table are written. Wrapping Math.* once at the top
// keeps the formulae below readable against the references.
//
// This module imports nothing from GNOME, so node can run the tests against it
// directly. Keep it that way. N_ marks strings for translation without
// translating them here; the UI translates when it shows them.

const N_ = globalThis.N_ ?? (s => s);

// ------------------------------------------------------------------ trig
function dtr(d) { return (d * Math.PI) / 180.0; }
function rtd(r) { return (r * 180.0) / Math.PI; }

function sin(d) { return Math.sin(dtr(d)); }
function cos(d) { return Math.cos(dtr(d)); }
function tan(d) { return Math.tan(dtr(d)); }

function arcsin(x) { return rtd(Math.asin(x)); }
function arccos(x) { return rtd(Math.acos(x)); }
function arccot(x) { return rtd(Math.atan(1.0 / x)); }
function arctan2(y, x) { return rtd(Math.atan2(y, x)); }

function fix(a, b) {
    a = a - b * Math.floor(a / b);
    return a < 0 ? a + b : a;
}
function fixAngle(a) { return fix(a, 360.0); }
function fixHour(a) { return fix(a, 24.0); }

// ------------------------------------------------------------------ methods
//
// Fajr/Isha are twilight depression angles in degrees unless given as a string
// like "90 min", which means "this many minutes after Maghrib" — Umm al-Qura
// and the Gulf authorities publish Isha that way rather than as an angle.
//
// Ids are the nicks of the GSettings enum in the schema. `region` is the hint
// shown under each name so the list is choosable without already knowing the
// answer.
export const METHODS = {
    'mwl': {
        name: N_('Muslim World League'),
        region: N_('Europe, Far East, global default'),
        params: { fajr: 18, isha: 17 },
    },
    'egypt': {
        name: N_('Egyptian General Authority'),
        region: N_('Egypt, Horn of Africa, Syria, Iraq'),
        params: { fajr: 19.5, isha: 17.5 },
    },
    'makkah': {
        name: N_('Umm al-Qura, Makkah'),
        region: N_('Saudi Arabia'),
        params: { fajr: 18.5, isha: '90 min' },
    },
    'karachi': {
        name: N_('University of Islamic Sciences, Karachi'),
        region: N_('Pakistan, Bangladesh, India, Afghanistan'),
        params: { fajr: 18, isha: 18 },
    },
    'isna': {
        name: N_('Islamic Society of North America'),
        region: N_('North America'),
        params: { fajr: 15, isha: 15 },
    },
    'moonsighting': {
        name: N_('Moonsighting Committee'),
        region: N_('North America, UK — seasonal twilight'),
        params: { fajr: 18, isha: 18, shafaq: 'general' },
    },
    'turkey': {
        name: N_('Diyanet İşleri Başkanlığı'),
        region: N_('Turkey'),
        params: { fajr: 18, isha: 17 },
        // Diyanet publishes its timetable with these fixed corrections applied
        // on top of the angle solution, so the angles alone reproduce times
        // that are several minutes off what every mosque in Turkey prints.
        // Both Aladhan and adhan-js carry the same table.
        adjust: { sunrise: -7, dhuhr: 5, asr: 4, maghrib: 7 },
    },
    'singapore': {
        name: N_('Majlis Ugama Islam Singapura'),
        region: N_('Singapore, Malaysia, Indonesia'),
        params: { fajr: 20, isha: 18 },
    },
    'gulf': {
        name: N_('Gulf Region'),
        region: N_('UAE, Kuwait, Bahrain'),
        params: { fajr: 19.5, isha: '90 min' },
    },
    'dubai': {
        name: N_('Dubai'),
        region: N_('United Arab Emirates'),
        params: { fajr: 18.2, isha: 18.2 },
    },
    'kuwait': {
        name: N_('Kuwait'),
        region: N_('Kuwait'),
        params: { fajr: 18, isha: 17.5 },
    },
    'qatar': {
        name: N_('Qatar'),
        region: N_('Qatar'),
        params: { fajr: 18, isha: '90 min' },
    },
    'france': {
        name: N_('Union des Organisations Islamiques de France'),
        region: N_('France'),
        params: { fajr: 12, isha: 12 },
    },
    'russia': {
        name: N_('Spiritual Administration of Muslims of Russia'),
        region: N_('Russia'),
        params: { fajr: 16, isha: 15 },
    },
    'tehran': {
        name: N_('Institute of Geophysics, Tehran'),
        region: N_('Iran, Shia communities'),
        params: { fajr: 17.7, isha: 14, maghrib: 4.5, midnight: 'jafari' },
    },
    'jafari': {
        name: N_('Shia Ithna-Ashari, Leva Institute'),
        region: N_('Shia Ithna-Ashari'),
        params: { fajr: 16, isha: 14, maghrib: 4, midnight: 'jafari' },
    },
};

// The order the settings list them in: the widely used ones first.
export const METHOD_ORDER = [
    'mwl', 'egypt', 'makkah', 'karachi', 'isna', 'moonsighting', 'turkey',
    'singapore', 'gulf', 'dubai', 'kuwait', 'qatar', 'france', 'russia',
    'tehran', 'jafari',
];

export const MADHABS = {
    'standard': { name: N_('Standard'), detail: N_("Shafi'i, Maliki, Hanbali") },
    'hanafi': { name: N_('Hanafi'), detail: N_('Asr when a shadow is twice the object') },
};
export const MADHAB_ORDER = ['standard', 'hanafi'];

export const HIGH_LATITUDE_RULES = {
    'angle-based': { name: N_('Angle based') },
    'night-middle': { name: N_('Middle of the night') },
    'one-seventh': { name: N_('One seventh of the night') },
    'none': { name: N_('None') },
};
export const HIGH_LATITUDE_ORDER = ['angle-based', 'night-middle', 'one-seventh', 'none'];

const DEFAULT_PARAMS = {
    imsak: '10 min',
    dhuhr: '0 min',
    asr: 'standard',
    maghrib: '0 min',
    highLats: 'angle-based',
    midnight: 'standard',
};

// The six daily anchors plus the derived ones the window shows. `sunrise` is
// not a prayer, but it closes the Fajr window and so belongs in the ordering.
export const TIME_NAMES = ['imsak', 'fajr', 'sunrise', 'dhuhr', 'asr', 'sunset', 'maghrib', 'isha', 'midnight'];

// Only these are announced and counted down to.
export const PRAYER_NAMES = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

// The five that are prayed, for the per-prayer settings.
export const PRAYED_NAMES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const LABELS = {
    imsak: { en: N_('Imsak'), ar: 'إمساك', icon: 'salah-fajr-symbolic' },
    fajr: { en: N_('Fajr'), ar: 'الفجر', icon: 'salah-fajr-symbolic' },
    sunrise: { en: N_('Sunrise'), ar: 'الشروق', icon: 'salah-sunrise-symbolic' },
    dhuhr: { en: N_('Dhuhr'), ar: 'الظهر', icon: 'salah-dhuhr-symbolic' },
    asr: { en: N_('Asr'), ar: 'العصر', icon: 'salah-asr-symbolic' },
    sunset: { en: N_('Sunset'), ar: 'الغروب', icon: 'salah-maghrib-symbolic' },
    maghrib: { en: N_('Maghrib'), ar: 'المغرب', icon: 'salah-maghrib-symbolic' },
    isha: { en: N_('Isha'), ar: 'العشاء', icon: 'salah-isha-symbolic' },
    midnight: { en: N_('Midnight'), ar: 'منتصف الليل', icon: 'salah-isha-symbolic' },
    lastThird: { en: N_('Last third'), ar: 'الثلث الأخير', icon: 'salah-isha-symbolic' },
    duha: { en: N_('Duha'), ar: 'الضحى', icon: 'salah-dhuhr-symbolic' },
};

export const MOSQUE_ICON = 'salah-mosque-symbolic';

export function iconName(key) {
    const entry = LABELS[key];
    return entry ? entry.icon : MOSQUE_ICON;
}

export function methodKeys() { return METHOD_ORDER.slice(); }

export function methodInfo(key) {
    return METHODS[key] || METHODS.mwl;
}

export function methodName(key) {
    return methodInfo(key).name;
}

// ------------------------------------------------------------------ calendar
export function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function julian(year, month, day) {
    if (month <= 2) {
        year -= 1;
        month += 12;
    }
    const a = Math.floor(year / 100);
    const b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
}

export function dayOfYear(year, month, day) {
    const cumulative = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let doy = cumulative[month - 1] + day;
    if (month > 2 && isLeapYear(year))
        doy += 1;
    return doy;
}

// ------------------------------------------------------------------ sun
export function sunPosition(jd) {
    const d = jd - 2451545.0;
    const g = fixAngle(357.529 + 0.98560028 * d);
    const q = fixAngle(280.459 + 0.98564736 * d);
    const l = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
    const e = 23.439 - 0.00000036 * d;
    const ra = arctan2(cos(e) * sin(l), cos(l)) / 15.0;
    return {
        declination: arcsin(sin(e) * sin(l)),
        equation: q / 15.0 - fixHour(ra),
    };
}

// ------------------------------------------------------------------ engine
//
// `ctx` carries everything a single day's computation needs so the helpers
// stay pure: no module-level mutable state, so two callers computing different
// days can never tread on each other.
function makeContext(opts) {
    const params = { ...DEFAULT_PARAMS };
    const method = methodInfo(opts.method);
    Object.assign(params, method.params);
    if (opts.asr)
        params.asr = opts.asr;
    if (opts.highLats)
        params.highLats = opts.highLats;

    return {
        methodKey: METHODS[opts.method] ? opts.method : 'mwl',
        params,
        adjust: method.adjust || {},
        lat: Number(opts.latitude) || 0,
        lng: Number(opts.longitude) || 0,
        elv: Number(opts.elevation) || 0,
        // Hours east of UTC for the target date, including DST. Callers pass
        // this measured from a real Date so we never re-derive a zone from
        // longitude.
        timezone: Number(opts.timezone) || 0,
        tune: opts.tune || {},
        year: opts.year,
        month: opts.month,
        day: opts.day,
        jd: julian(opts.year, opts.month, opts.day) - (Number(opts.longitude) || 0) / (15.0 * 24.0),
    };
}

// Minutes value like "90 min" -> 90; anything else -> null.
function minutesValue(value) {
    if (typeof value !== 'string')
        return null;
    const match = value.match(/^\s*(-?[\d.]+)\s*min/i);
    return match ? parseFloat(match[1]) : null;
}

function evaluate(value) {
    const mins = minutesValue(value);
    return mins === null ? (Number(value) || 0) : mins;
}

// Hour angle, in hours, between solar noon and the moment the sun sits `angle`
// degrees below the horizon. Returns NaN inside a polar day/night, where no
// such moment exists — the high-latitude rules below are what rescue that.
function sunAngleTime(ctx, angle, t, direction) {
    const decl = sunPosition(ctx.jd + t).declination;
    const noon = midDay(ctx, t);
    const numerator = -sin(angle) - sin(decl) * sin(ctx.lat);
    const denominator = cos(decl) * cos(ctx.lat);
    const ratio = numerator / denominator;
    if (ratio > 1 || ratio < -1)
        return NaN;
    const span = arccos(ratio) / 15.0;
    return noon + (direction === 'ccw' ? -span : span);
}

function midDay(ctx, t) {
    const eqt = sunPosition(ctx.jd + t).equation;
    return fixHour(12 - eqt);
}

// Asr is when an object's shadow equals its noon shadow plus `factor` times
// the object's height: 1 for Shafi'i/Maliki/Hanbali, 2 for Hanafi.
function asrTime(ctx, factor, t) {
    const decl = sunPosition(ctx.jd + t).declination;
    const angle = -arccot(factor + tan(Math.abs(ctx.lat - decl)));
    return sunAngleTime(ctx, angle, t, 'cw');
}

function asrFactor(asrParam) {
    return String(asrParam).toLowerCase() === 'hanafi' ? 2 : 1;
}

// Atmospheric refraction at the horizon plus the dip from observer elevation.
function riseSetAngle(elevation) {
    return 0.833 + 0.0347 * Math.sqrt(Math.max(0, elevation));
}

// Rough starting hours for the iterative refinement. Any value within a few
// hours of the truth converges; these are the conventional seeds.
function seedTimes() {
    return {
        imsak: 5, fajr: 5, sunrise: 6, dhuhr: 12,
        asr: 13, sunset: 18, maghrib: 18, isha: 18,
    };
}

function computeRaw(ctx, times) {
    const t = {};
    for (const key in times)
        t[key] = times[key] / 24.0;

    return {
        imsak: sunAngleTime(ctx, evaluate(ctx.params.imsak), t.imsak, 'ccw'),
        fajr: sunAngleTime(ctx, evaluate(ctx.params.fajr), t.fajr, 'ccw'),
        sunrise: sunAngleTime(ctx, riseSetAngle(ctx.elv), t.sunrise, 'ccw'),
        dhuhr: midDay(ctx, t.dhuhr),
        asr: asrTime(ctx, asrFactor(ctx.params.asr), t.asr),
        sunset: sunAngleTime(ctx, riseSetAngle(ctx.elv), t.sunset, 'cw'),
        maghrib: sunAngleTime(ctx, evaluate(ctx.params.maghrib), t.maghrib, 'cw'),
        isha: sunAngleTime(ctx, evaluate(ctx.params.isha), t.isha, 'cw'),
    };
}

// ------------------------------------------------------------------ high latitudes
//
// Above roughly 48° the sun can fail to reach the Fajr/Isha depression angle
// at all, leaving those times undefined for part of the year. Each rule caps
// the twilight portion of the night at some fraction instead.
function nightPortion(ctx, angle, night) {
    const rule = ctx.params.highLats;
    let portion = 1 / 2;
    if (rule === 'angle-based')
        portion = (1 / 60) * angle;
    else if (rule === 'one-seventh')
        portion = 1 / 7;
    return portion * night;
}

function timeDiff(a, b) { return fixHour(b - a); }

function adjustHighLats(ctx, times) {
    if (ctx.params.highLats === 'none')
        return times;

    const nightTime = timeDiff(times.sunset, times.sunrise);

    times.imsak = refineHighLat(ctx, times.imsak, times.sunrise, evaluate(ctx.params.imsak), nightTime, 'ccw');
    times.fajr = refineHighLat(ctx, times.fajr, times.sunrise, evaluate(ctx.params.fajr), nightTime, 'ccw');
    times.isha = refineHighLat(ctx, times.isha, times.sunset, evaluate(ctx.params.isha), nightTime, 'cw');
    times.maghrib = refineHighLat(ctx, times.maghrib, times.sunset, evaluate(ctx.params.maghrib), nightTime, 'cw');
    return times;
}

function refineHighLat(ctx, time, base, angle, night, direction) {
    const portion = nightPortion(ctx, angle, night);
    const diff = direction === 'ccw' ? timeDiff(time, base) : timeDiff(base, time);
    if (isNaN(time) || diff > portion)
        return direction === 'ccw' ? base - portion : base + portion;
    return time;
}

// ------------------------------------------------------------------ moonsighting
//
// The Moonsighting Committee does not use a fixed depression angle. It shifts
// Fajr and Isha by a seasonal offset from sunrise/sunset that widens with
// latitude, fitted to observation rather than derived from geometry.
function daysSinceSolstice(doy, year, latitude) {
    const leap = isLeapYear(year);
    const daysInYear = leap ? 366 : 365;
    let days;
    if (latitude >= 0) {
        days = doy + 10;
        if (days >= daysInYear)
            days -= daysInYear;
    } else {
        days = doy - (leap ? 173 : 172);
        if (days < 0)
            days += daysInYear;
    }
    return days;
}

function seasonalInterpolate(a, b, c, d, dyy) {
    if (dyy < 91) return a + ((b - a) / 91.0) * dyy;
    if (dyy < 137) return b + ((c - b) / 46.0) * (dyy - 91);
    if (dyy < 183) return c + ((d - c) / 46.0) * (dyy - 137);
    if (dyy < 229) return d + ((c - d) / 46.0) * (dyy - 183);
    if (dyy < 275) return c + ((b - c) / 46.0) * (dyy - 229);
    return b + ((a - b) / 91.0) * (dyy - 275);
}

function moonsightingFajr(ctx, sunrise, dyy) {
    const lat = Math.abs(ctx.lat);
    const a = 75 + (28.65 / 55.0) * lat;
    const b = 75 + (19.44 / 55.0) * lat;
    const c = 75 + (32.74 / 55.0) * lat;
    const d = 75 + (48.10 / 55.0) * lat;
    return sunrise - Math.round(seasonalInterpolate(a, b, c, d, dyy)) / 60.0;
}

function moonsightingIsha(ctx, sunset, dyy, shafaq) {
    const lat = Math.abs(ctx.lat);
    let a, b, c, d;
    if (shafaq === 'ahmer') {
        a = 62 + (17.40 / 55.0) * lat;
        b = 62 - (7.160 / 55.0) * lat;
        c = 62 + (5.120 / 55.0) * lat;
        d = 62 + (19.44 / 55.0) * lat;
    } else if (shafaq === 'abyad') {
        a = 75 + (25.60 / 55.0) * lat;
        b = 75 + (7.160 / 55.0) * lat;
        c = 75 + (36.84 / 55.0) * lat;
        d = 75 + (81.84 / 55.0) * lat;
    } else {
        a = 75 + (25.60 / 55.0) * lat;
        b = 75 + (2.050 / 55.0) * lat;
        c = 75 - (9.210 / 55.0) * lat;
        d = 75 + (6.140 / 55.0) * lat;
    }
    return sunset + Math.round(seasonalInterpolate(a, b, c, d, dyy)) / 60.0;
}

// ------------------------------------------------------------------ public API
//
// Returns each name mapped to hours-past-local-midnight as a float, so callers
// can format, diff, and compare without parsing strings back apart. A value
// may exceed 24 (Isha after midnight) or go negative; `toDate` normalises
// that onto the right calendar day.
export function computeTimes(opts) {
    const ctx = makeContext(opts);
    let times = seedTimes();

    // computeRaw takes hours and returns hours, so each pass feeds the next.
    for (let i = 0; i < 3; i++)
        times = computeRaw(ctx, times);

    times = adjustHighLats(ctx, times);

    if (ctx.methodKey === 'moonsighting') {
        const dyy = daysSinceSolstice(dayOfYear(ctx.year, ctx.month, ctx.day), ctx.year, ctx.lat);
        times.fajr = moonsightingFajr(ctx, times.sunrise, dyy);
        times.isha = moonsightingIsha(ctx, times.sunset, dyy, ctx.params.shafaq || 'general');
        // Imsak stays anchored to Fajr rather than its own angle, which no
        // longer has a meaning once Fajr is observational.
        times.imsak = times.fajr - 10 / 60.0;
    }

    // Minute-offset parameters, applied after the angle solution.
    const imsakMin = minutesValue(ctx.params.imsak);
    if (imsakMin !== null)
        times.imsak = times.fajr - imsakMin / 60.0;

    const maghribMin = minutesValue(ctx.params.maghrib);
    if (maghribMin !== null)
        times.maghrib = times.sunset + maghribMin / 60.0;

    const ishaMin = minutesValue(ctx.params.isha);
    if (ishaMin !== null)
        times.isha = times.maghrib + ishaMin / 60.0;

    times.dhuhr = times.dhuhr + evaluate(ctx.params.dhuhr) / 60.0;

    // Fixed per-method corrections, applied before the derived times below so
    // the whole table stays internally consistent — a Diyanet sunrise shown at
    // 06:07 should be the same sunrise Duha is measured from.
    for (const adjName in ctx.adjust) {
        if (times[adjName] !== undefined)
            times[adjName] += Number(ctx.adjust[adjName]) / 60.0;
    }

    // Islamic midnight: the middle of the night. Jafari measures it to Fajr
    // rather than to sunrise, which lands it earlier.
    const nightEnd = ctx.params.midnight === 'jafari' ? times.fajr : times.sunrise;
    times.midnight = times.sunset + timeDiff(times.sunset, nightEnd) / 2.0;

    // The last third of the night, when tahajjud is prayed.
    times.lastThird = times.sunset + (timeDiff(times.sunset, nightEnd) * 2.0) / 3.0;

    // Duha begins once the sun has fully risen, conventionally ~15 minutes
    // after sunrise, and runs until just before Dhuhr.
    times.duha = times.sunrise + 15 / 60.0;

    // Shift from mean solar time at this longitude to the local civil clock.
    const offset = ctx.timezone - ctx.lng / 15.0;
    for (const name in times) {
        if (typeof times[name] === 'number')
            times[name] = times[name] + offset;
    }

    // Per-prayer user corrections, in minutes.
    for (const tuneName in ctx.tune) {
        const delta = Number(ctx.tune[tuneName]);
        if (times[tuneName] !== undefined && isFinite(delta))
            times[tuneName] = times[tuneName] + delta / 60.0;
    }

    return times;
}

// Turn hours-past-midnight into a real Date on the given calendar day. Hours
// outside [0,24) roll the date, which is what makes an Isha at 24.3 land at
// 00:18 the next morning instead of being clamped.
//
// Rounded to the whole minute, the convention every published timetable
// uses. It also keeps the adhan honest: the notification fires at exactly the
// minute the window prints, instead of up to 59 seconds after it.
export function toDate(year, month, day, hours) {
    if (!isFinite(hours))
        return null;
    const base = new Date(year, month - 1, day, 0, 0, 0, 0);
    return new Date(base.getTime() + Math.round(hours * 60) * 60000);
}

// Local UTC offset in hours for a specific date, DST included.
export function timezoneFor(date) {
    return -date.getTimezoneOffset() / 60.0;
}

export function timesForDate(date, config) {
    const times = computeTimes({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        latitude: config.latitude,
        longitude: config.longitude,
        elevation: config.elevation || 0,
        timezone: timezoneFor(date),
        method: config.method,
        asr: config.asr,
        highLats: config.highLats,
        tune: config.tune,
    });

    const out = {};
    for (const name in times)
        out[name] = toDate(date.getFullYear(), date.getMonth() + 1, date.getDate(), times[name]);
    return out;
}

// ------------------------------------------------------------------ schedule
//
// Flattens yesterday's, today's and tomorrow's tables into one forward-ordered
// list of announceable prayers, so "what's next" is a scan rather than a pile
// of midnight special cases. Yesterday is included because Isha frequently
// belongs to the previous calendar day once it crosses midnight.
export function buildSchedule(now, config) {
    const entries = [];
    const offsets = [-1, 0, 1];

    for (const offset of offsets) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
        const times = timesForDate(date, config);
        for (const key of PRAYER_NAMES) {
            if (!times[key])
                continue;
            entries.push({
                key,
                date: times[key],
                // Sunrise closes Fajr but is not itself prayed; the UI and the
                // adhan scheduler both need to tell those apart.
                isPrayer: key !== 'sunrise',
                dayOffset: offset,
            });
        }
    }

    entries.sort((a, b) => a.date.getTime() - b.date.getTime());
    return entries;
}

// The scan halves take a prebuilt schedule: callers that want both answers —
// which is every caller — would otherwise pay for six days of astronomy to
// get two lookups out of the same three.
export function findNext(schedule, now, includeSunrise) {
    for (const entry of schedule) {
        if (!includeSunrise && !entry.isPrayer)
            continue;
        if (entry.date.getTime() > now.getTime())
            return entry;
    }
    return null;
}

export function findCurrent(schedule, now, includeSunrise) {
    let found = null;
    for (const entry of schedule) {
        if (!includeSunrise && !entry.isPrayer)
            continue;
        if (entry.date.getTime() <= now.getTime())
            found = entry;
        else
            break;
    }
    return found;
}

export function nextPrayer(now, config, includeSunrise) {
    return findNext(buildSchedule(now, config), now, includeSunrise);
}

export function currentPrayer(now, config, includeSunrise) {
    return findCurrent(buildSchedule(now, config), now, includeSunrise);
}
