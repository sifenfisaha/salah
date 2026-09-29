// The voices offered under Preferences › Adhan › Voice, in the order the list
// shows them.
//
// The default is the Madinah recording, fetched from Wikimedia Commons the
// first time the app runs; only `bundled` ships with the app, and it is what
// plays until a download has arrived. Every Commons file carries a reviewed
// free licence, and the attribution its licence asks for is shown under the
// setting and in the About dialog. Recordings by the muezzins people ask for
// by name are copyrighted and cannot be redistributed by a free app; `custom`
// points the app at a file of your own instead.
//
// Special:FilePath is a stable redirect to the current upload, so a file that
// is re-uploaded on Commons keeps working here. Sizes are approximate and only
// shown to the user before a download.

const N_ = globalThis.N_ ?? (s => s);

const COMMONS = 'https://commons.wikimedia.org/wiki/';

export const DEFAULT = 'madinah';

// What plays until a download arrives, and for an id this version no longer
// knows. Never something that needs the network.
export const FALLBACK = 'bundled';

export const VOICES = [
    {
        id: 'madinah',
        label: N_("Madinah, the Prophet's Mosque"),
        detail: N_('Live recording from Masjid an-Nabawi'),
        author: 'ejaz215',
        licence: 'CC BY 3.0',
        licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
        page: `${COMMONS}File:33937_ejaz215_call-to-prayer-from-the-prophet-s-mo.ogg`,
        url: `${COMMONS}Special:FilePath/33937_ejaz215_call-to-prayer-from-the-prophet-s-mo.ogg`,
        ext: 'ogg',
        bytes: 2973696,
        seconds: 187,
    },
    {
        id: 'makkah',
        label: N_('Makkah, Masjid al-Haram'),
        detail: N_('Live recording from the Grand Mosque, January 2013'),
        author: 'Seyfula Islam',
        licence: 'CC BY 3.0',
        licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
        page: `${COMMONS}File:Adhan,_Great_Mosque_of_Mecca_-_Jan_21,_2013.webm`,
        url: `${COMMONS}Special:FilePath/Adhan,_Great_Mosque_of_Mecca_-_Jan_21,_2013.webm`,
        ext: 'webm',
        bytes: 9359360,
        seconds: 197,
    },
    {
        id: 'aaqib-azeez',
        label: N_('Aaqib Azeez'),
        detail: N_('Studio recitation'),
        author: 'Atcovi',
        licence: 'CC BY-SA 4.0',
        licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        page: `${COMMONS}File:The_Adhan_-_Muslim_Call_to_Prayer_-_Aaqib_Azeez.mp3`,
        url: `${COMMONS}Special:FilePath/The_Adhan_-_Muslim_Call_to_Prayer_-_Aaqib_Azeez.mp3`,
        ext: 'mp3',
        bytes: 1447936,
        seconds: 87,
    },
    {
        id: 'nigeria',
        label: N_('Nigeria, mosque recording'),
        detail: N_('Live recording, Wiki Loves Africa 2026'),
        author: 'Isaacayodele32',
        licence: 'CC BY-SA 4.0',
        licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        page: `${COMMONS}File:Call_to_prayer.ogg`,
        url: `${COMMONS}Special:FilePath/Call_to_prayer.ogg`,
        ext: 'ogg',
        bytes: 624640,
        seconds: 65,
    },
    {
        id: 'bundled',
        label: N_('Bundled recording'),
        detail: N_('Ships with the app'),
        author: 'Aishatu98',
        licence: 'CC0 1.0',
        licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        page: `${COMMONS}File:Adhan.ogg`,
        url: '',
        ext: 'ogg',
        bytes: 338741,
        seconds: 42,
    },
    {
        id: 'custom',
        label: N_('A file of your own'),
        detail: N_('Anything GStreamer can play'),
        author: '',
        licence: '',
        licenceUrl: '',
        page: '',
        url: '',
        ext: '',
        bytes: 0,
        seconds: 0,
    },
];

export function find(id) {
    return VOICES.find(v => v.id === id) ?? null;
}

export function voice(id) {
    return find(id) ?? find(FALLBACK);
}

export function isKnown(id) {
    return find(id) !== null;
}

// Fetched rather than shipped or supplied: everything with a source URL.
export function isDownloadable(v) {
    return Boolean(v && v.url);
}

// The credit a licence asks for, in one line. Translated by the caller with
// the author and licence substituted in.
export function attribution(v) {
    if (!v || !v.author)
        return '';
    return `${v.author}, ${v.licence}`;
}

export function sizeText(bytes) {
    if (bytes >= 1048576)
        return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
}

export function durationText(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}
