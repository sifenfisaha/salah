# Contributing

Thanks for taking an interest. This is a small app with a clear job, and the
bar for a change is simply that it makes the app better for the people who
run it every day. Bug reports, fixes, new calculation methods, translations,
and better wording are all welcome.

## Before you start

- Bugs and ideas go in [issues](../../issues). For a bug, say what you did,
  what you expected, and what happened instead, and paste anything the log
  says about the app (see [Reading the log](#reading-the-log)).
- For anything larger than a fix, open an issue first so the shape can be
  agreed before the work is done.
- By contributing you agree that your work is released under the
  [MIT licence](LICENSE), and that you will follow the
  [code of conduct](CODE_OF_CONDUCT.md).

## Running your own copy

Salah is GJS, so there is no compile step for the code itself; meson bundles
the resources and compiles the schema, and `meson devenv` runs the app from
the build tree with both in place:

```bash
git clone https://github.com/sifenfisaha/salah.git && cd salah
meson setup _build
meson compile -C _build
meson devenv -C _build io.github.sifenfisaha.Salah
```

Recompile after editing anything under `src/` or `data/` — the JavaScript
and the templates are read from the gresource, not from the source tree — and
start the app again. It logs to the terminal it was started from.

Running from the build tree uses your real settings, state and downloaded
recordings, the same as an installed copy. A separate configuration for
experiments is one environment variable away:

```bash
XDG_CONFIG_HOME=/tmp/salah-cfg XDG_DATA_HOME=/tmp/salah-data XDG_STATE_HOME=/tmp/salah-state \
  meson devenv -C _build io.github.sifenfisaha.Salah
```

Useful while iterating:

```bash
gapplication action io.github.sifenfisaha.Salah preferences-page "'adhan'"   # straight to a page
gapplication action io.github.sifenfisaha.Salah play                         # the adhan; `stop` stops it
gsettings set io.github.sifenfisaha.Salah tune-asr 30                        # move a prayer to test the announcement
cat ~/.local/state/io.github.sifenfisaha.Salah/state.json                    # what the app thinks today looks like
```

To test the whole announcement path for real, tune the next prayer to a
minute from now and wait: the notification, the adhan and the banner should
all appear, and `announced.json` should gain the new stamp. Put the tune back
afterwards.

## Checks to run

```bash
meson test -C _build     # the schema, the desktop file, the AppStream data, and the engine tests
npm test                 # the engine tests on their own, no build needed
npm install && npm run lint   # eslint over src/ and test/
```

The engine tests are golden-value checks against published timetables plus
the invariants a user notices instantly when they break, such as prayers
staying in order all year at high latitudes. If you touch `src/engine/`, add
a check for what you changed; the file is plain `node:test` with no
framework.

Then try it for real: run the app, change the setting you touched, and
confirm the window follows and `gsettings get` shows the new value.

## Reading the log

The app prints to the terminal it was started from. When it was started by
the desktop, the messages go to the journal:

```bash
journalctl --user -f | grep -i salah
```

Inside Flatpak, `flatpak run io.github.sifenfisaha.Salah` shows the same
output on the terminal.

## Where things live

| Path | What it is |
| --- | --- |
| `meson.build`, `data/meson.build`, `src/meson.build`, `po/meson.build` | The build |
| `data/io.github.sifenfisaha.Salah.gschema.xml` | Every setting, with its type, range and default |
| `data/ui/*.ui` | The window, the preferences, the location dialog and the shortcuts, as GTK templates |
| `data/style.css` | The few styles the templates need beyond libadwaita's own |
| `data/symbolic/` | The app's own symbolic icons, bundled so they look the same everywhere |
| `src/engine/` | Pure JavaScript: the astronomy, the Hijri calendar, the voice catalogue, the day model. No GNOME imports, so node can test it |
| `src/services/` | The parts that *act*: the announcer, playback, notifications, downloads, lookups, autostart |
| `src/ui/` | The window and the dialogs; they draw and write settings, nothing more |
| `test/` | The regression tests |
| `docs/` | Screenshots and [ARCHITECTURE.md](docs/ARCHITECTURE.md), which explains how the pieces fit |

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing how the
pieces share state; it also lists the GJS and meson behaviours that have
bitten this code before.

## Style

- Four-space indentation, semicolons, single quotes, LF line endings — the
  GJS conventions, enforced by `eslint.config.js`. Two spaces in XML, JSON
  and meson files. `.editorconfig` carries the basics.
- Comments explain *why*, not what. Every non-obvious decision in this code
  has a sentence next to it saying what would go wrong otherwise; keep that up.
- Prefer libadwaita's widgets and style classes over anything hand-rolled,
  so the app follows the user's theme and accent colour.
- Side effects belong in `src/services/`. The window and the dialogs read
  and write settings and draw what the announcer computed.
- `src/engine/` stays free of GNOME imports and of anything node cannot load.
  Strings there are marked with `N_()` and translated by the UI with `_()`.
- Never call `_()` at module level: gettext is initialised after the modules
  are imported.
- Keep the README honest: if behaviour or a setting changes, change the README
  and the schema description in the same commit, and add a line under
  *Unreleased* in `CHANGELOG.md`.

## Translations

Strings are marked in the code and the templates; `po/POTFILES` lists the
files gettext scans. To start a translation:

```bash
meson compile -C _build io.github.sifenfisaha.Salah-pot
cp po/io.github.sifenfisaha.Salah.pot po/xx.po      # your language code
echo xx >> po/LINGUAS
```

Then translate `po/xx.po` and open a pull request.

## Commits and pull requests

- One logical change per commit, with a subject like
  `Window: each view opens at its top`: the area, a colon, then what the
  change does. The body says why.
- Fill in the pull request template, in particular how you checked the change
  in the running app.
- Small, focused pull requests are reviewed sooner than large ones.
