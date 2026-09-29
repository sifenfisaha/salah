// One row of the day: the icon, the name and its Arabic, the time, and the
// bell that silences the adhan for that prayer alone.

import Adw from 'gi://Adw?version=1';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';

import * as PrayerTimes from '../engine/prayer-times.js';
import * as Day from '../engine/day.js';
import { ADHAN_KEYS } from '../services/settings.js';
import { format } from '../services/util.js';

export const PrayerRow = GObject.registerClass({
    GTypeName: 'SalahPrayerRow',
}, class PrayerRow extends Adw.ActionRow {
    constructor(key, settings) {
        // The row itself does nothing when focused; the bell inside it is
        // what keyboard users want to reach.
        super({ activatable: false, selectable: false, focusable: false });
        this._key = key;
        this._settings = settings;
        this._updating = false;

        this.add_css_class('prayer-row');
        this.title = _(Day.prayerLabel(key));
        this.subtitle = Day.prayerLabelAr(key);

        this._icon = new Gtk.Image({ icon_name: PrayerTimes.iconName(key), pixel_size: 20 });
        this._icon.add_css_class('prayer-icon');
        this.add_prefix(this._icon);

        this._time = new Gtk.Label({ label: '--:--', xalign: 1, valign: Gtk.Align.CENTER });
        this._time.add_css_class('time');
        this._time.add_css_class('numeric');
        this.add_suffix(this._time);

        // Sunrise is not prayed, so it gets no bell rather than a disabled
        // one — nothing to decide, nothing to show. A spacer keeps the times
        // in one column.
        if (key === 'sunrise') {
            this._bell = null;
            this.add_suffix(new Gtk.Box({ width_request: 34 }));
        } else {
            this._bell = new Gtk.ToggleButton({ icon_name: 'salah-bell-symbolic', valign: Gtk.Align.CENTER });
            this._bell.add_css_class('flat');
            this._bell.add_css_class('circular');
            this._bell.add_css_class('bell');
            this._bell.connect('toggled', () => this._onBellToggled());
            this.add_suffix(this._bell);
        }
    }

    get key() {
        return this._key;
    }

    update(row, clockFormat) {
        this._time.label = Day.formatTime(row.date, clockFormat);
        this._setClass('next', row.isNext);
        this._setClass('current', row.isCurrent);
        this._setClass('past', row.isPast && !row.isNext);

        if (!this._bell)
            return;
        this._updating = true;
        this._bell.active = row.adhan;
        this._updating = false;
        this._bell.icon_name = row.adhan ? 'salah-bell-symbolic' : 'salah-bell-off-symbolic';
        this._bell.tooltip_text = row.adhan
            ? format(_('Adhan on for %s'), _(row.label))
            : format(_('Adhan off for %s'), _(row.label));
        if (row.adhan)
            this._bell.remove_css_class('off');
        else
            this._bell.add_css_class('off');
    }

    _setClass(name, on) {
        if (on)
            this.add_css_class(name);
        else
            this.remove_css_class(name);
    }

    _onBellToggled() {
        if (this._updating)
            return;
        this._settings.set_boolean(ADHAN_KEYS[this._key], this._bell.active);
    }
});
