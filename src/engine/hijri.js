// Hijri calendar conversion.
//
// Uses the arithmetic ("Kuwaiti") civil Islamic calendar: a fixed 30-year
// cycle of 11 leap years, which is what Microsoft's HijriCalendar and most
// libraries implement. It tracks the observed Umm al-Qura calendar to within a
// day or so.
//
// A day of slack is unavoidable rather than a defect: month starts depend on
// local moon sighting, so two mosques in the same city can disagree. The app
// exposes a -2..+2 day correction for exactly that reason, and anyone who
// needs their local authority's reckoning sets it once.

const N_ = globalThis.N_ ?? (s => s);

export const MONTHS = [
    N_('Muharram'), N_('Safar'), N_("Rabi' al-Awwal"), N_("Rabi' al-Thani"),
    N_('Jumada al-Ula'), N_('Jumada al-Akhirah'), N_('Rajab'), N_("Sha'ban"),
    N_('Ramadan'), N_('Shawwal'), N_("Dhu al-Qi'dah"), N_('Dhu al-Hijjah'),
];

export const MONTHS_AR = [
    'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر',
    'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
    'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
];

export const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function gregorianToJD(year, month, day) {
    if (month < 3) {
        year -= 1;
        month += 12;
    }
    const a = Math.floor(year / 100.0);
    const b = 2 - a + Math.floor(a / 4.0);
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524;
}

// Gregorian calendar date -> { year, month (1-12), day }.
export function fromGregorian(year, month, day, dayOffset) {
    const jd = gregorianToJD(year, month, day) + (Number(dayOffset) || 0);

    let l = jd - 1948440 + 10632;
    const n = Math.floor((l - 1) / 10631);
    l = l - 10631 * n + 354;
    const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
        Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
    l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
        Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;

    const hMonth = Math.floor((24 * l) / 709);
    const hDay = l - Math.floor((709 * hMonth) / 24);
    const hYear = 30 * n + j - 30;

    return { year: hYear, month: hMonth, day: hDay };
}

export function fromDate(date, dayOffset) {
    return fromGregorian(date.getFullYear(), date.getMonth() + 1, date.getDate(), dayOffset);
}

export function monthName(month) { return MONTHS[Math.max(0, Math.min(11, month - 1))]; }
export function monthNameAr(month) { return MONTHS_AR[Math.max(0, Math.min(11, month - 1))]; }

// Months and days that carry their own observances, so the window can say why
// today is not an ordinary day without hardcoding a calendar of events. The
// most specific match wins: Eid al-Adha over the days of Hajj it falls in.
export function monthNote(month, day) {
    if (month === 12 && day === 10) return N_('Eid al-Adha');
    if (month === 12 && day >= 8 && day <= 13) return N_('Days of Hajj');
    if (month === 10 && day === 1) return N_('Eid al-Fitr');
    if (month === 9 && day === 27) return N_('Ramadan — the 27th night');
    if (month === 9) return N_('Ramadan — month of fasting');
    if (month === 1 && day === 10) return N_('Day of Ashura');
    if (month === 7) return N_('Rajab — a sacred month');
    if (month === 8 && day === 15) return N_("Mid-Sha'ban");
    return '';
}
