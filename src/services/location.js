// Three ways to learn where the user is, each an explicit choice in the
// location dialog: a city search, the desktop's location service through the
// portal, and an IP lookup. None runs on its own.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Day from '../engine/day.js';
import { fetchText } from './network.js';

// Whether libportal's bindings are installed at all. Without them there is
// no location portal to ask, and the dialog leaves that option out rather
// than offering one that can only fail.
export function portalAvailable() {
    try {
        const { Xdp, XdpGtk4 } = imports.gi;
        return Boolean(Xdp && XdpGtk4);
    } catch {
        return false;
    }
}

export async function searchCities(query, cancellable = null) {
    const url = 'https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=' +
        encodeURIComponent(query);
    return Day.parseGeocodingResults(await fetchText(url, cancellable));
}

export async function lookupByIp(cancellable = null) {
    const found = Day.parseIpLocation(await fetchText('https://ipapi.co/json/', cancellable));
    if (!found)
        throw new Error(_('The lookup returned no coordinates'));
    return found;
}

// One fix from the location portal, then the monitor is stopped again: the
// app wants an answer, not a stream. Rejects when no portal backend serves
// location requests, which is the case on many non-GNOME desktops.
export async function systemLocation(window, cancellable = null, timeoutSeconds = 25) {
    const { default: Xdp } = await import('gi://Xdp');
    const { default: XdpGtk4 } = await import('gi://XdpGtk4');
    Gio._promisify(Xdp.Portal.prototype, 'location_monitor_start', 'location_monitor_start_finish');

    const portal = new Xdp.Portal();
    const parent = window ? XdpGtk4.parent_new_gtk(window) : null;

    return new Promise((resolve, reject) => {
        let timeout = 0;
        let updatedId = 0;
        const finish = () => {
            if (timeout)
                GLib.source_remove(timeout);
            if (updatedId)
                portal.disconnect(updatedId);
            portal.location_monitor_stop();
        };
        updatedId = portal.connect('location-updated', (_p, latitude, longitude) => {
            finish();
            resolve({ name: '', latitude, longitude });
        });
        portal.location_monitor_start(parent, 0, 0, Xdp.LocationAccuracy.CITY,
            Xdp.LocationMonitorFlags.NONE, cancellable).then(ok => {
            if (!ok) {
                finish();
                reject(new Error(_('Access to the location was not granted')));
                return;
            }
            timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, timeoutSeconds, () => {
                timeout = 0;
                finish();
                reject(new Error(_('The location service did not answer in time')));
                return GLib.SOURCE_REMOVE;
            });
        }).catch(e => {
            finish();
            reject(e);
        });
    });
}
