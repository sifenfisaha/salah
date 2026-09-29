# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The Flatpak no longer asks to talk to logind on the system bus. It was
  only used to notice a resume from suspend a second sooner, which the
  once-a-second tick covers.

## [1.0.1] - 2026-09-29

### Fixed

- Preferences, Location, Keyboard Shortcuts and About opened on a window
  nobody could see while the app was running in the background, whether from
  the desktop entry's actions or from `gapplication action`. The window is
  shown first now.
- *Count Seconds* did nothing. With it on, the time to the next prayer now
  counts down as a running clock; with it off, it reads as before.
- *Use System Location* is left out of the location dialog when libportal is
  not installed, instead of being offered and failing.

### Changed

- The Flatpak is built on the GNOME 51 runtime.
- The README lists what a build actually needs: the development packages
  meson checks for, and the introspection data on Debian and Ubuntu.

## [1.0.0] - 2026-09-29

The first release, a port of the
[Omarchy plugin](https://github.com/sifenfisaha/omarchy-salah-reminder) to a
GTK 4 and libadwaita application.

### Added

- The day view: the next prayer with a live countdown and a progress ring,
  every prayer with its Arabic name and a bell, the Hijri date with its
  observances, and the derived times: Imsak, Duha, sunset, Islamic midnight
  and the last third of the night. The hero card takes a faint tint for the
  part of the day.
- A notification and the adhan at each prayer, a heads-up reminder, and a
  bell per prayer. Playback through GStreamer; a banner with a Stop button
  while it sounds.
- A choice of recordings — Madinah, Makkah, a studio recitation, a Nigerian
  mosque, the bundled CC0 recording — fetched on request from Wikimedia
  Commons, or a file of your own.
- Sixteen calculation methods, both Asr conventions, four high-latitude
  rules and per-prayer fine tuning, computed locally.
- Location from a city search, the system location service through the
  portal, or an IP lookup — each an explicit choice.
- A daily Hijri correction against Umm al-Qura, with a manual shift.
- Runs in the background with the window closed and asks to start at login,
  through the background portal or an autostart entry.
- Every setting is a GSettings key; every action is reachable with
  `gapplication action`; today's table is written to `state.json`.
- An adaptive layout down to 360 px, keyboard shortcuts, and a translation
  template.
