# How it fits together

One source of truth, one part that acts, and surfaces that only draw. Keep
that shape and most changes stay small.

```
                GSettings  io.github.sifenfisaha.Salah
                    ▲ writes                 ▲ writes (hijri-auto-offset)
                    │                        │
   ┌────────────────┴──────┐   ┌─────────────┴──────────┐
   │ ui/                   │   │ services/announcer.js  │
   │ window, preferences,  │   │ the tick, the adhan,   │──► services/player.js     GStreamer
   │ location dialog       │   │ notifications, state   │──► services/notifier.js   GNotification
   │ draw + write settings │   │ files, hijri sync      │──► services/voice-store.js Commons downloads
   └───────────┬───────────┘   └────────────┬───────────┘
               │ reads day-changed          │ computes
               └────────────────────────────┤
                                            ▼
                        engine/  prayer-times.js · hijri.js · voices.js · day.js
```

## The pieces

**`engine/`** is pure ECMAScript with no GNOME imports. `prayer-times.js`
implements the PrayTimes solar model; `hijri.js` the arithmetic calendar;
`voices.js` the catalogue of recordings; `day.js` the config shape, the day
model the window draws from, every formatting rule, and the decision of what
is due. Because nothing here touches GI, `node --test` loads it directly, and
the Omarchy plugin can share it verbatim.

**`services/announcer.js`** is the only thing that *acts*. It ticks once a
second, rebuilds the day model from the settings, emits `day-changed`, and
compares wall-clock time against the schedule to decide what to announce. It
also owns the state files and the daily Hijri correction. The application
creates exactly one, at startup, before any window exists.

**`services/player.js`** wraps one GStreamer playbin and exposes a `playing`
property naming what is sounding. **`services/notifier.js`** builds the
`GNotification`s. **`services/voice-store.js`** knows which file to play and
fetches the ones that are not bundled. **`services/location.js`** does the
three lookups. **`services/background.js`** arranges autostart.

**`ui/`** draws. The window listens to `day-changed` and repaints; the
preferences bind rows straight to GSettings; the location dialog writes the
four location keys. None of them computes a time or plays a sound.

## GSettings is the only shared state

Every setting is a key in the schema, with its type, its range and its
default declared there. The announcer reads the whole schema into a plain
config object (`services/settings.js`, `readConfig`) and caches it until any
key changes; the UI binds to the same keys. That is what lets `gsettings
set`, dconf-editor, the preferences dialog and the bells in the window all
agree the moment a value changes, and why there is no apply button anywhere.

Enum keys are read as their nicks, which are the ids the engine uses, so
there is no mapping table to keep in step: `method` is `'mwl'` in the schema,
in the engine, and in `gsettings get`.

The location is four keys written together inside `delay()`/`apply()`, so a
watcher never sees a new name with the previous coordinates.

## Announcing

The announcer ticks against the clock rather than arming a long timer,
because a timer armed hours out does not survive suspend, a clock correction,
or a time-zone change on a travelling laptop. `Day.pendingAnnouncements` is
the pure decision: for each prayer in the three-day schedule it reports
`prayer` (due within the 90-second grace window), `missed` (due longer ago;
mark it and move on), or `reminder`.

Each prayer is identified by `Day.announceStamp`, which is the day, the
prayer and the minute. A prayer whose time moves through a tune, a new
method or a new city becomes a new announcement. Stamps are recorded in
`announced.json` in the state directory so that neither a restart nor a crash
announces a prayer twice, and a prayer whose moment passed while the app was
not running is marked and skipped rather than fired late.

Nothing fires until that file has been read once. On the very first run,
everything that passed in the last day is marked as missed, which is the
right answer to "the app was just installed".

The schedule is walked rather than today's table because at high latitudes
Isha can fall after midnight, which puts it on the previous calendar day's
table and off the new day's entirely.

## Playback and the recordings

One playbin for the life of the app. Video goes to a fakesink: the Makkah
recording on Commons is a video container, and without that a window would
pop up with the adhan. Volume is set live, so dragging the slider during a
test is audible.

The voice store resolves the chosen voice to a URI without ever waiting on
the network: a downloaded file if it is there and recording-sized, otherwise
the bundled recording. The bundled one is a GResource, copied out once to the
data directory so the player gets an ordinary `file://` URI. Downloads go to
a `.part` file and are only renamed into place when they are at least
recording-sized, so a half-fetched or error-page file never plays.

## Background

`Gio.Application.hold()` is the whole mechanism: while held, the application
stays alive with no window, and the announcer with it. The hold follows the
`run-in-background` setting. Autostart goes through the background portal
where one is implemented — on GNOME, KDE, and inside any Flatpak — and falls
back to writing `~/.config/autostart/io.github.sifenfisaha.Salah.desktop`
directly where none is, which is the case on most other compositors.

`--background` starts the app without a window. It is what the autostart
entry uses, and with the setting off it does nothing but say so.

## GJS and meson behaviours worth knowing

These have each cost a debugging session. Check them before assuming the code
is wrong.

- **`meson devenv` does not set `MESON_BUILD_ROOT` and `MESON_SOURCE_ROOT`**
  on its own, and those two are what gjs's package loader keys on to find the
  gresources and the compiled schema in the build tree. `meson.build` adds
  them with `meson.add_devenv()`. Without them the loader falls into its
  "running from source" branch and reports that `main.js` does not exist.
- **`configure_file` cannot mark its output executable**, so the launcher in
  the build tree gets a `chmod` at configure time. The installed copy uses
  `install_mode`.
- **Nothing may call `_()` at module level.** The engine and the UI modules
  are imported before `pkg.initGettext()` runs; the engine uses `N_()` with
  an identity fallback and the UI translates inside functions.
- **A custom widget used in a template must be registered before the
  template is parsed.** `window.js` calls `GObject.type_ensure(Ring.$gtype)`
  at import time.
- **GObject constructor parameters must be registered properties.** The
  window and the dialogs reach their services through the application
  (`this.application.announcer`) rather than taking them as constructor
  arguments.
- **Actions from the menu, the notifications and `gapplication` all go
  through the application**, and a notification can arrive after the window
  is gone, so actions never assume a window exists; `_ensureWindow()` creates
  one when needed and presents it, because a dialog opened on a window that
  is not shown is invisible too.
- **`Gio._promisify` must name the finish function** for the
  `_bytes`/`_finish` pairs whose names do not match, such as
  `replace_contents_bytes_async` and `replace_contents_finish`.
- **GNotification buttons need `app.` actions**, and the fallback
  freedesktop backend used outside GNOME delivers them the same way.
- **GSettings inside a Flatpak is the sandbox's own copy.** Reading
  `org.gnome.desktop.interface` there gives the schema default, never the
  host's value; the Settings portal is what reflects the desktop, and
  `services/settings.js` asks it when sandboxed.
- **The window ticks once a second while open.** Setting a label to the text
  it already has is a no-op in GTK, so repainting the whole day every second
  costs nothing measurable; do not add caching for it.
