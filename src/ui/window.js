// The window: the day, and where you are in it.
//
// It draws whatever the announcer last computed and never computes anything
// itself, so the window, the notifications and the state file can never
// disagree about a time.

import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Gettext from 'gettext';

import * as Day from '../engine/day.js';
import * as Hijri from '../engine/hijri.js';
import * as PrayerTimes from '../engine/prayer-times.js';
import { RESOURCE_BASE } from '../services/paths.js';
import { format } from '../services/util.js';
import { Ring } from './ring.js';
import { PrayerRow } from './prayer-row.js';

// Make sure the template can resolve the custom widget's type name.
GObject.type_ensure(Ring.$gtype);

const PERIODS = ['dawn', 'morning', 'day', 'afternoon', 'dusk', 'night'];

function phraseRemaining(ms) {
    const { hours, minutes, now } = Day.durationParts(ms);
    if (now)
        return _('It is time');
    const parts = [];
    if (hours > 0)
        parts.push(format(Gettext.ngettext('%d hour', '%d hours', hours), hours));
    if (minutes > 0)
        parts.push(format(Gettext.ngettext('%d minute', '%d minutes', minutes), minutes));
    // Translators: %s is a duration, e.g. "in 2 hours 5 minutes"
    return format(_('in %s'), parts.join(' '));
}

// With "Count Seconds" on, a clock that visibly moves: H:MM:SS, and M:SS
// inside the last hour, which is what the once-a-second tick is for.
function countdownRemaining(ms) {
    if (ms <= 0)
        return _('It is time');
    // Translators: %s is a countdown, e.g. "in 1:38:07"
    return format(_('in %s'), Day.formatCountdown(ms, true));
}

export const SalahWindow = GObject.registerClass({
    GTypeName: 'SalahWindow',
    Template: `resource://${RESOURCE_BASE}/ui/window.ui`,
    InternalChildren: [
        'toast_overlay', 'banner', 'stack', 'hero_card', 'ring', 'ring_icon',
        'next_caption', 'next_time', 'next_arabic', 'remaining',
        'hijri_label', 'hijri_note', 'prayer_list', 'derived_box',
        'location_label', 'method_label',
    ],
}, class SalahWindow extends Adw.ApplicationWindow {
    constructor(params) {
        super(params);

        const app = this.application;
        this._settings = app.settings;
        this._announcer = app.announcer;
        this._player = app.player;
        this._voices = app.voices;
        this._handlers = [];

        this._settings.bind('window-width', this, 'default-width', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('window-height', this, 'default-height', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('window-maximized', this, 'maximized', Gio.SettingsBindFlags.DEFAULT);

        this._buildRows();
        this._buildTiles();

        this._banner.connect('button-clicked', () => app.activate_action('stop', null));

        this._connect(this._announcer, 'day-changed', () => this._render());
        this._connect(this._announcer, 'notice', (_a, message) => this.toast(message));
        this._connect(this._player, 'notify::playing', () => this._renderPlaying());
        this._lastVoiceStatus = this._voices.status;
        this._connect(this._voices, 'notify::status', () => this._onVoiceStatus());

        this.connect('close-request', () => {
            for (const [object, id] of this._handlers)
                object.disconnect(id);
            this._handlers = [];
            return false;
        });

        this._render();
        this._renderPlaying();
    }

    _connect(object, signal, handler) {
        this._handlers.push([object, object.connect(signal, handler)]);
    }

    toast(title, { buttonLabel, actionName } = {}) {
        const toast = new Adw.Toast({ title });
        if (buttonLabel && actionName) {
            toast.button_label = buttonLabel;
            toast.action_name = actionName;
        }
        this._toast_overlay.add_toast(toast);
    }

    _buildRows() {
        this._rows = new Map();
        for (const key of PrayerTimes.PRAYER_NAMES) {
            const row = new PrayerRow(key, this._settings);
            this._prayer_list.append(row);
            this._rows.set(key, row);
        }
    }

    _buildTiles() {
        this._tiles = new Map();
        for (const derived of Day.DERIVED) {
            const tile = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 });
            tile.add_css_class('card');
            tile.add_css_class('tile');
            tile.tooltip_text = _(derived.hint);
            const name = new Gtk.Label({ label: _(derived.label), xalign: 0 });
            name.add_css_class('caption');
            name.add_css_class('dim-label');
            const time = new Gtk.Label({ label: '--:--', xalign: 0 });
            time.add_css_class('tile-time');
            time.add_css_class('numeric');
            tile.append(name);
            tile.append(time);
            this._derived_box.append(tile);
            this._tiles.set(derived.key, time);
        }
        // FlowBox children take focus by default, which puts a focus ring on
        // a tile that does nothing when clicked.
        let child = this._derived_box.get_first_child();
        while (child) {
            child.focusable = false;
            child = child.get_next_sibling();
        }
    }

    // ---------------------------------------------------------------- drawing
    _render() {
        const day = this._announcer.day;
        const config = this._announcer.config;

        if (!day) {
            this._stack.visible_child_name = 'empty';
            return;
        }
        this._stack.visible_child_name = 'day';

        const next = day.next;
        this._ring.progress = day.progress ?? 0;
        this._ring_icon.icon_name = next ? PrayerTimes.iconName(next.key) : PrayerTimes.MOSQUE_ICON;
        this._next_caption.label = next
            // Translators: %s is the prayer, shown in capitals, e.g. "NEXT · FAJR"
            ? format(_('Next · %s'), _(Day.prayerLabel(next.key))).toUpperCase()
            : '';
        this._next_time.label = Day.formatTime(next?.date, config.clockFormat);
        this._next_arabic.label = next ? Day.prayerLabelAr(next.key) : '';
        this._remaining.label = config.showSeconds
            ? countdownRemaining(day.remainingMs)
            : phraseRemaining(day.remainingMs);
        // Tabular figures, so the running clock does not wobble as digits change.
        if (config.showSeconds)
            this._remaining.add_css_class('numeric');
        else
            this._remaining.remove_css_class('numeric');

        for (const period of PERIODS)
            this._hero_card.remove_css_class(`period-${period}`);
        this._hero_card.add_css_class(`period-${day.period}`);

        const h = day.hijri;
        // Translators: the Hijri date: day, month name, year, e.g. "16 Rabi' al-Thani 1448 AH"
        this._hijri_label.label = format(_('%d %s %d AH'), h.day, _(Hijri.monthName(h.month)), h.year);
        this._hijri_note.label = day.hijriNote ? _(day.hijriNote) : '';
        this._hijri_note.visible = day.hijriNote !== '';

        for (const row of day.rows)
            this._rows.get(row.key)?.update(row, config.clockFormat);

        for (const [key, label] of this._tiles)
            label.label = Day.formatTime(day.times[key], config.clockFormat);

        this._location_label.label = Day.locationName(config.location);
        const madhab = PrayerTimes.MADHABS[config.madhab];
        this._method_label.label = `${_(PrayerTimes.methodName(config.method))} · ${madhab ? _(madhab.name) : ''}`;
    }

    _renderPlaying() {
        const key = this._player.playing;
        this._banner.revealed = key !== '';
        if (key === '' || key === 'test')
            this._banner.title = _('The adhan is playing');
        else
            this._banner.title = format(_('The adhan for %s is playing'), _(Day.prayerLabel(key)));
    }

    _onVoiceStatus() {
        const status = this._voices.status;
        const previous = this._lastVoiceStatus;
        this._lastVoiceStatus = status;
        const label = _(this._voices.voice.label);
        if (status === 'failed') {
            this.toast(format(_('Could not download the %s recording'), label),
                { buttonLabel: _('Try Again'), actionName: 'app.fetch-voice' });
        } else if (status === 'ready' && previous === 'downloading') {
            this.toast(format(_('The %s recording is ready'), label));
        }
    }
});
