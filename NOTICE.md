# Third-party content

## data/adhan.ogg

The bundled call to prayer is **"Adhan"** by Wikimedia Commons user *Aishatu98*,
released under the **Creative Commons CC0 1.0 Universal Public Domain
Dedication**. No attribution is required; it is recorded here so the provenance
of the file stays checkable.

- Source: https://commons.wikimedia.org/wiki/File:Adhan.ogg
- Licence: https://creativecommons.org/publicdomain/zero/1.0/
- Duration: 42s · 338 KB · Ogg Vorbis

CC0 was chosen deliberately over the better-known CC BY-SA recordings on
Commons: a share-alike asset would put its own terms on anything that
redistributes this repository, which is not a thing an app should ask of the
people packaging it.

## Recordings offered for download

These are not distributed with the repository. When chosen under
**Preferences › Adhan › Voice** the app fetches them from Wikimedia Commons,
where each carries the licence below, and shows this credit under the
setting and in the About dialog.

| Voice | Recording | Licence |
| --- | --- | --- |
| Madinah, the Prophet's Mosque | by ejaz215 · [source](https://commons.wikimedia.org/wiki/File:33937_ejaz215_call-to-prayer-from-the-prophet-s-mo.ogg) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Makkah, Masjid al-Haram | by Seyfula Islam · [source](https://commons.wikimedia.org/wiki/File:Adhan,_Great_Mosque_of_Mecca_-_Jan_21,_2013.webm) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Aaqib Azeez | by Atcovi · [source](https://commons.wikimedia.org/wiki/File:The_Adhan_-_Muslim_Call_to_Prayer_-_Aaqib_Azeez.mp3) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Nigeria, mosque recording | by Isaacayodele32 · [source](https://commons.wikimedia.org/wiki/File:Call_to_prayer.ogg) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

## Icons

The application icon and the symbolic icons under `data/symbolic/` were drawn
for this project and are MIT licensed with the rest of the code. They follow
the GNOME icon guidelines and use the GNOME palette. Generic icons referenced
by name (`open-menu-symbolic`, `mark-location-symbolic`, and so on) come from
the user's icon theme and are not part of this repository.

## Prayer-time model

The astronomy in `src/engine/prayer-times.js` implements the published
PrayTimes model (https://praytimes.org), reimplemented from the formulae.

## Everything else

All code in this repository is MIT licensed — see `LICENSE`.
