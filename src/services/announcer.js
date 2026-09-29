// The part of the app that acts: the countdown everything else displays, the
// notifications, the adhan, the state file, and the daily Hijri correction.
//
// Firing is driven by a one-second tick comparing wall-clock time against the
// schedule, not by a long-armed timer. A timer armed five hours out does not
// survive suspend, a clock correction, or a time-zone change on a travelling
// laptop; re-deriving the answer every second always does, and costs nothing
// next to the desktop's own repaint.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Day from '../engine/day.js';
import { readConfig, watchSystemClockFormat } from './settings.js';
import { announcedFile, stateFile, readText, writeText } from './paths.js';
import { fetchText } from './network.js';
import { notifyPrayer, notifyReminder } from './notifier.js';

// A prayer whose moment passed longer ago than this while the app was asleep
// is marked and skipped, instead of three adhans at once on resume.
const GRACE_SECONDS = 90;

export const Announcer = GObject.registerClass({
    Signals: {
        // Emitted once a second with a fresh day model in `day`, and whenever
        // the configuration changes.
        'day-changed': {},
        // A short human message the window may show as a toast.
        'notice': { param_types: [GObject.TYPE_STRING] },
    },
}, class Announcer extends GObject.Object {
    constructor(app, settings, player, voices) {
        super();
        this._app = app;
        this._settings = settings;
        this._player = player;
        this._voices = voices;

        this._config = null;
        this.day = null;

        this._announced = [];
        this._hijriSyncDay = '';
        this._ready = false;
        this._tickSource = 0;
        this._minuteSource = 0;
        this._sleepSubscription = 0;
        this._hijriSyncing = false;

        this._settings.connect('changed', (_s, key) => this._onSettingChanged(key));
        watchSystemClockFormat(() => this._invalidate());
        this._player.connect('failed', (_p, message) => this.emit('notice', message));
    }

    get config() {
        this._config ??= readConfig(this._settings);
        return this._config;
    }

    // ------------------------------------------------------------ lifecycle
    start() {
        this._loadAnnounced().catch(logError);
        this._tickSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this.tick();
            return GLib.SOURCE_CONTINUE;
        });
        this._minuteSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            this._everyMinute().catch(logError);
            return GLib.SOURCE_CONTINUE;
        });
        this._watchSleep();
        this.tick();
    }

    stop() {
        if (this._tickSource)
            GLib.source_remove(this._tickSource);
        if (this._minuteSource)
            GLib.source_remove(this._minuteSource);
        this._tickSource = this._minuteSource = 0;
        if (this._sleepSubscription) {
            Gio.DBus.system.signal_unsubscribe(this._sleepSubscription);
            this._sleepSubscription = 0;
        }
        this._player.stop();
    }

    // ------------------------------------------------------------ the tick
    tick() {
        const now = new Date();
        const config = this.config;
        this.day = Day.buildDay(now, config);
        this.emit('day-changed');
        if (!this.day || !this._ready)
            return;

        const due = Day.pendingAnnouncements(this.day.schedule, now, {
            graceSeconds: GRACE_SECONDS,
            reminderMinutes: config.reminderMinutes,
            alreadyFired: stamp => this._announced.includes(stamp),
        });
        if (due.length === 0)
            return;

        for (const item of due) {
            this._announced.push(item.stamp);
            if (item.kind === 'prayer')
                this._announce(item.entry);
            else if (item.kind === 'reminder')
                this._remind(item.entry);
        }
        this._announced = Day.trimAnnounced(this._announced);
        this._saveAnnounced().catch(logError);
    }

    _announce(entry) {
        const config = this.config;
        const label = _(Day.prayerLabel(entry.key));
        const wantAdhan = config.playAdhan && config.adhan[entry.key] !== false;
        if (wantAdhan)
            this._play(entry.key).catch(logError);
        if (config.notifications)
            notifyPrayer(this._app, label, Day.formatTime(entry.date, config.clockFormat), wantAdhan);
    }

    _remind(entry) {
        const config = this.config;
        if (!config.notifications)
            return;
        notifyReminder(this._app, _(Day.prayerLabel(entry.key)), config.reminderMinutes,
            Day.formatTime(entry.date, config.clockFormat));
    }

    // ------------------------------------------------------------ playback
    async _play(key) {
        const uri = await this._voices.uriToPlay();
        this._player.play(uri, this.config.volume, key);
    }

    // The button in preferences. Deliberately ignores the adhan switch and the
    // per-prayer bells: pressed while the adhan is off, a silent button cannot
    // be told apart from a broken one.
    playTest() {
        this._play('test').catch(e => {
            logError(e);
            this.emit('notice', e.message);
        });
    }

    stopAdhan() {
        this._player.stop();
        this._app.withdraw_notification('prayer');
    }

    // ------------------------------------------------------------ settings
    _onSettingChanged(key) {
        const wasSyncing = this._config?.hijriSync;
        this._invalidate();
        if (key === 'volume')
            this._player.setVolume(this.config.volume);
        if (key === 'hijri-sync') {
            const on = this.config.hijriSync;
            if (on && !wasSyncing) {
                // Switching the correction back on should not wait for
                // tomorrow's check.
                this._hijriSyncDay = '';
                this.syncHijri().catch(logError);
            } else if (!on) {
                // Off means off: the learned correction goes too, so the shift
                // the user sets is the whole shift.
                if (this._settings.get_int('hijri-auto-offset') !== 0)
                    this._settings.set_int('hijri-auto-offset', 0);
            }
        }
    }

    _invalidate() {
        this._config = null;
        // Redraw straight away rather than on the next second, so a changed
        // setting is visible the moment it is made.
        if (this._tickSource)
            this.tick();
    }

    // ------------------------------------------------------------ announced
    //
    // Prayers already announced, as "YYYY-MM-DD:key:HH:MM". Kept on disk so
    // that neither a restart nor a crash announces the same prayer twice, and
    // so a prayer that passed while the app was not running is skipped rather
    // than sounded late. Nothing fires until this has been read once.
    async _loadAnnounced() {
        try {
            const parsed = Day.parseAnnounced(await readText(announcedFile()));
            this._announced = parsed.announced;
            this._hijriSyncDay = parsed.hijriSyncDay;
        } catch (e) {
            logError(e, 'Could not read the announcement record');
        }
        this._ready = true;
        this.tick();
        await this._everyMinute();
    }

    _saveAnnounced() {
        return writeText(announcedFile(), Day.serializeAnnounced(this._announced, this._hijriSyncDay));
    }

    // ------------------------------------------------------------ once a minute
    async _everyMinute() {
        await this.syncHijri();
        await this._writeState();
    }

    // A machine-readable copy of today's table, for scripts.
    async _writeState() {
        if (!this.day)
            return;
        const snapshot = Day.stateSnapshot(this.day, this.config);
        await writeText(stateFile(), `${JSON.stringify(snapshot, null, 2)}\n`);
    }

    // ------------------------------------------------------------ hijri sync
    //
    // The arithmetic calendar drifts a day against Umm al-Qura for stretches
    // of several months. Rather than make the user notice and correct it, ask
    // an authority once a day and remember the correction — which then keeps
    // working offline until the calendars slip again.
    async syncHijri(force = false) {
        if (!this._ready || !this.config.hijriSync || this._hijriSyncing)
            return;
        const today = Day.dayKey(new Date());
        if (!force && this._hijriSyncDay === today)
            return;
        this._hijriSyncing = true;
        try {
            const d = new Date();
            const ds = `${Day.pad(d.getDate())}-${Day.pad(d.getMonth() + 1)}-${d.getFullYear()}`;
            const authoritative = Day.parseHijriResponse(await fetchText(`https://api.aladhan.com/v1/gToH/${ds}`));
            const delta = Day.hijriCorrection(authoritative, d, this.config);
            if (delta === null)
                return;
            if (this._settings.get_int('hijri-auto-offset') !== delta)
                this._settings.set_int('hijri-auto-offset', delta);
            this._hijriSyncDay = today;
            await this._saveAnnounced();
        } catch (e) {
            // Offline or a changed response shape: the arithmetic calendar
            // still works, just without today's correction.
            log(`Hijri sync skipped: ${e.message}`);
        } finally {
            this._hijriSyncing = false;
        }
    }

    // ------------------------------------------------------------ suspend
    //
    // GLib timers do not fire while the machine sleeps; the first tick after
    // resume handles everything that came due, marking the stale ones as
    // missed. Listening for the resume makes that first tick immediate rather
    // than up to a second late, and keeps the countdown from showing a stale
    // number for that second. Inside a Flatpak the system bus is filtered
    // and the signal never arrives: the manifest does not ask for logind just
    // to save that second, and the tick covers it there.
    _watchSleep() {
        try {
            this._sleepSubscription = Gio.DBus.system.signal_subscribe(
                'org.freedesktop.login1', 'org.freedesktop.login1.Manager', 'PrepareForSleep',
                '/org/freedesktop/login1', null, Gio.DBusSignalFlags.NONE,
                (_conn, _sender, _path, _iface, _signal, params) => {
                    const [sleeping] = params.deepUnpack();
                    if (!sleeping)
                        this.tick();
                });
        } catch (e) {
            log(`Not watching for resume: ${e.message}`);
        }
    }
});
