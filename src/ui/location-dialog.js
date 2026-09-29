// Choosing where you are: a city search with live suggestions, the desktop's
// location service, or an IP lookup. Whatever is chosen is written to the
// settings, and the announcer picks it up on its next tick.

import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import { RESOURCE_BASE } from '../services/paths.js';
import { writeLocation } from '../services/settings.js';
import { searchCities, lookupByIp, systemLocation, portalAvailable } from '../services/location.js';
import { format, isCancelled } from '../services/util.js';

const DEBOUNCE_MS = 320;

export const LocationDialog = GObject.registerClass({
    GTypeName: 'SalahLocationDialog',
    Template: `resource://${RESOURCE_BASE}/ui/location-dialog.ui`,
    InternalChildren: ['search', 'results_stack', 'busy_label', 'results', 'message_label', 'system_row', 'ip_row'],
}, class LocationDialog extends Adw.Dialog {
    constructor(settings) {
        super();
        this._settings = settings;
        this._cancellable = null;
        this._debounce = 0;

        this._search.connect('search-changed', () => this._onQueryChanged());
        this._search.connect('activate', () => this._chooseFirst());
        // The entry swallows Escape as "stop search"; from the user's side it
        // is the same key that closes every other dialog, so it closes this
        // one too.
        this._search.connect('stop-search', () => this.close());
        this._results.connect('row-activated', (_list, row) => this._choose(row._entry));
        this._system_row.connect('activated', () => this._useSystem().catch(logError));
        this._ip_row.connect('activated', () => this._useIp().catch(logError));
        this._system_row.visible = portalAvailable();
        this.connect('closed', () => this._cancel());
    }

    _cancel() {
        if (this._debounce) {
            GLib.source_remove(this._debounce);
            this._debounce = 0;
        }
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }
    }

    _begin() {
        this._cancel();
        this._cancellable = new Gio.Cancellable();
        return this._cancellable;
    }

    _show(page, text = '') {
        if (page === 'message')
            this._message_label.label = text;
        if (page === 'busy')
            this._busy_label.label = text || _('Searching…');
        this._results_stack.visible_child_name = page;
    }

    // ---------------------------------------------------------------- search
    _onQueryChanged() {
        if (this._debounce) {
            GLib.source_remove(this._debounce);
            this._debounce = 0;
        }
        const query = this._search.text.trim();
        if (query.length < 2) {
            this._cancel();
            this._show('hint');
            return;
        }
        this._debounce = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
            this._debounce = 0;
            this._runSearch(query).catch(logError);
            return GLib.SOURCE_REMOVE;
        });
    }

    async _runSearch(query) {
        const cancellable = this._begin();
        this._show('busy');
        try {
            const found = await searchCities(query, cancellable);
            if (cancellable.is_cancelled())
                return;
            this._fill(found);
            if (found.length === 0)
                this._show('message', format(_('No city matches “%s”.'), query));
            else
                this._show('results');
        } catch (e) {
            if (isCancelled(e))
                return;
            this._show('message', _('The city search failed. Check the connection and try again.'));
        }
    }

    _fill(entries) {
        let child = this._results.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this._results.remove(child);
            child = next;
        }
        for (const entry of entries) {
            const row = new Adw.ActionRow({ title: entry.name, subtitle: entry.detail, activatable: true });
            row._entry = entry;
            this._results.append(row);
        }
    }

    _chooseFirst() {
        const first = this._results.get_row_at_index(0);
        if (first && this._results_stack.visible_child_name === 'results')
            this._choose(first._entry);
    }

    _choose(entry) {
        writeLocation(this._settings, {
            name: entry.label ?? entry.name,
            latitude: entry.latitude,
            longitude: entry.longitude,
        });
        this.close();
    }

    // ---------------------------------------------------------------- lookups
    async _useSystem() {
        const cancellable = this._begin();
        this._show('busy', _('Asking the location service…'));
        try {
            const found = await systemLocation(this.get_root(), cancellable);
            if (cancellable.is_cancelled())
                return;
            this._choose({ name: _('Current location'), ...found });
        } catch (e) {
            if (isCancelled(e))
                return;
            this._show('message', format(_('The system location is not available here: %s. Search for a city instead, or look up by IP address.'), e.message));
        }
    }

    async _useIp() {
        const cancellable = this._begin();
        this._show('busy', _('Looking up the address…'));
        try {
            const found = await lookupByIp(cancellable);
            if (cancellable.is_cancelled())
                return;
            this._choose({ name: found.name, latitude: found.latitude, longitude: found.longitude });
        } catch (e) {
            if (isCancelled(e))
                return;
            this._show('message', _('Could not detect a location. Check the connection, or search for a city instead.'));
        }
    }
});
