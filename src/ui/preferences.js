// Preferences. Every row is bound straight to GSettings, so a change made
// here, in dconf-editor, or with `gsettings set` shows up everywhere at
// once, and there is no apply step to forget.

import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';

import * as Day from '../engine/day.js';
import * as PrayerTimes from '../engine/prayer-times.js';
import * as Voices from '../engine/voices.js';
import { RESOURCE_BASE } from '../services/paths.js';
import { readLocation, TUNE_KEYS, ADHAN_KEYS } from '../services/settings.js';
import { format } from '../services/util.js';
import { LocationDialog } from './location-dialog.js';

const CLOCK_FORMATS = ['system', '24h', '12h'];

export const SalahPreferences = GObject.registerClass({
    GTypeName: 'SalahPreferences',
    Template: `resource://${RESOURCE_BASE}/ui/preferences.ui`,
    InternalChildren: [
        'location_row', 'method_row', 'madhab_row', 'high_lat_row',
        'tune_fajr', 'tune_sunrise', 'tune_dhuhr', 'tune_asr', 'tune_maghrib', 'tune_isha',
        'notify_row', 'reminder_row', 'play_row', 'voice_row', 'download_row',
        'download_spinner', 'retry_button', 'custom_row', 'volume_row', 'volume_scale',
        'volume_adjustment', 'volume_label', 'test_row',
        'adhan_fajr', 'adhan_dhuhr', 'adhan_asr', 'adhan_maghrib', 'adhan_isha',
        'hijri_sync_row', 'hijri_offset_row', 'clock_row', 'seconds_row', 'background_row',
    ],
}, class SalahPreferences extends Adw.PreferencesDialog {
    constructor(app) {
        super();
        this._app = app;
        this._settings = app.settings;
        this._voices = app.voices;
        this._player = app.player;
        this._handlers = [];

        this._bindLocation();
        this._bindCalculation();
        this._bindAdhan();
        this._bindGeneral();

        this.connect('closed', () => {
            for (const [object, id] of this._handlers)
                object.disconnect(id);
            this._handlers = [];
        });
    }

    _connect(object, signal, handler) {
        this._handlers.push([object, object.connect(signal, handler)]);
    }

    _bindSwitch(key, row) {
        this._settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    }

    _bindSpin(key, row) {
        this._settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    }

    // A combo row over an enum key: the list shows `labels`, the setting
    // stores the nick at the same index.
    _bindEnum(key, row, nicks, labels) {
        row.model = Gtk.StringList.new(labels);
        const sync = () => {
            const index = nicks.indexOf(this._settings.get_string(key));
            if (index >= 0 && row.selected !== index)
                row.selected = index;
        };
        sync();
        this._connect(this._settings, `changed::${key}`, sync);
        row.connect('notify::selected', () => {
            const nick = nicks[row.selected];
            if (nick && this._settings.get_string(key) !== nick)
                this._settings.set_string(key, nick);
        });
    }

    // ---------------------------------------------------------------- location
    _bindLocation() {
        const sync = () => {
            const location = readLocation(this._settings);
            this._location_row.subtitle = location ? Day.locationName(location) : _('Not set');
        };
        sync();
        for (const key of ['has-location', 'location-name', 'latitude', 'longitude'])
            this._connect(this._settings, `changed::${key}`, sync);
        this._location_row.connect('activated', () => new LocationDialog(this._settings).present(this));
    }

    // ---------------------------------------------------------------- calculation
    _bindCalculation() {
        this._bindEnum('method', this._method_row, PrayerTimes.METHOD_ORDER,
            PrayerTimes.METHOD_ORDER.map(k => _(PrayerTimes.methodInfo(k).name)));
        const region = () => {
            this._method_row.subtitle = _(PrayerTimes.methodInfo(this._settings.get_string('method')).region);
        };
        region();
        this._connect(this._settings, 'changed::method', region);

        this._bindEnum('madhab', this._madhab_row, PrayerTimes.MADHAB_ORDER,
            PrayerTimes.MADHAB_ORDER.map(k => _(PrayerTimes.MADHABS[k].name)));
        const madhab = () => {
            this._madhab_row.subtitle = _(PrayerTimes.MADHABS[this._settings.get_string('madhab')].detail);
        };
        madhab();
        this._connect(this._settings, 'changed::madhab', madhab);

        this._bindEnum('high-latitudes', this._high_lat_row, PrayerTimes.HIGH_LATITUDE_ORDER,
            PrayerTimes.HIGH_LATITUDE_ORDER.map(k => _(PrayerTimes.HIGH_LATITUDE_RULES[k].name)));

        for (const [prayer, key] of Object.entries(TUNE_KEYS))
            this._bindSpin(key, this[`_tune_${prayer}`]);
    }

    // ---------------------------------------------------------------- adhan
    _bindAdhan() {
        this._bindSwitch('notifications', this._notify_row);
        this._bindSpin('reminder-minutes', this._reminder_row);
        this._bindSwitch('play-adhan', this._play_row);

        const ids = Voices.VOICES.map(v => v.id);
        this._bindEnum('voice', this._voice_row, ids, Voices.VOICES.map(v => _(v.label)));
        const voice = () => this._renderVoice();
        voice();
        this._connect(this._settings, 'changed::voice', voice);
        this._connect(this._settings, 'changed::custom-adhan-file', voice);
        this._connect(this._voices, 'notify::status', voice);
        this._connect(this._voices, 'notify::error', voice);
        this._retry_button.connect('clicked', () => this._voices.retry().catch(logError));
        this._custom_row.connect('activated', () => this._chooseFile());

        this._settings.bind('volume', this._volume_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const volume = () => {
            const v = Math.round(this._volume_adjustment.value);
            // Zero is a second, invisible mute hiding behind the switch above:
            // the adhan still "plays", just inaudibly. Naming the state is
            // cheaper than forbidding it.
            this._volume_label.label = v === 0 ? _('Muted') : `${v}%`;
            this._volume_row.subtitle = v > 100
                ? _('Above 100% amplifies the recording')
                : (v === 0 ? _('The adhan still runs, silently') : '');
        };
        volume();
        this._volume_adjustment.connect('value-changed', volume);

        for (const [prayer, key] of Object.entries(ADHAN_KEYS))
            this._bindSwitch(key, this[`_adhan_${prayer}`]);

        const playing = () => {
            const on = this._player.playing !== '';
            this._test_row.title = on ? _('Stop the Adhan') : _('Play the Adhan Now');
            this._test_row.start_icon_name = on ? 'media-playback-stop-symbolic' : 'media-playback-start-symbolic';
        };
        playing();
        this._connect(this._player, 'notify::playing', playing);
        this._test_row.connect('activated', () => {
            this._app.activate_action(this._player.playing !== '' ? 'stop' : 'play', null);
        });
    }

    _renderVoice() {
        const v = this._voices.voice;
        const custom = v.id === 'custom';
        const downloadable = Voices.isDownloadable(v);

        const parts = [_(v.detail)];
        if (v.seconds > 0)
            parts.push(Voices.durationText(v.seconds));
        if (v.author)
            // Translators: a credit line, e.g. "Recording by ejaz215, CC BY 3.0"
            parts.push(format(_('Recording by %s, %s'), v.author, v.licence));
        this._voice_row.subtitle = parts.join(' · ');

        this._custom_row.visible = custom;
        if (custom) {
            const path = this._settings.get_string('custom-adhan-file');
            this._custom_row.subtitle = path || _('Choose a recording; until then the bundled one plays');
        }

        this._download_row.visible = downloadable;
        if (!downloadable)
            return;
        const status = this._voices.status;
        this._download_spinner.visible = status === 'downloading';
        this._retry_button.visible = status === 'failed';
        if (status === 'downloading') {
            this._download_row.title = _('Downloading…');
            this._download_row.subtitle = format(_('%s from Wikimedia Commons. The bundled recording plays until it arrives.'), Voices.sizeText(v.bytes));
        } else if (status === 'failed') {
            this._download_row.title = _('Download Failed');
            this._download_row.subtitle = this._voices.error || _('Check the connection and try again');
        } else {
            this._download_row.title = _('Downloaded');
            this._download_row.subtitle = _('Kept on this device; the network is not needed again');
        }
    }

    _chooseFile() {
        const filter = new Gtk.FileFilter({ name: _('Audio') });
        filter.add_mime_type('audio/*');
        filter.add_mime_type('video/webm');
        const filters = new Gio.ListStore({ item_type: Gtk.FileFilter });
        filters.append(filter);
        const dialog = new Gtk.FileDialog({
            title: _('Choose a Recording'),
            modal: true,
            filters,
            default_filter: filter,
        });
        dialog.open(this.get_root(), null, (_dialog, result) => {
            try {
                const file = dialog.open_finish(result);
                if (file)
                    this._settings.set_string('custom-adhan-file', file.get_path());
            } catch (e) {
                if (!e.matches?.(Gtk.DialogError, Gtk.DialogError.DISMISSED))
                    logError(e);
            }
        });
    }

    // ---------------------------------------------------------------- general
    _bindGeneral() {
        this._bindSwitch('hijri-sync', this._hijri_sync_row);
        this._bindSpin('hijri-offset', this._hijri_offset_row);
        this._bindEnum('clock-format', this._clock_row, CLOCK_FORMATS,
            [_('Follow the System'), _('24-Hour'), _('12-Hour')]);
        this._bindSwitch('show-seconds', this._seconds_row);
        this._bindSwitch('run-in-background', this._background_row);
    }
});
