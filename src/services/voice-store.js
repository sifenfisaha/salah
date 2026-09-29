// Which recording plays, and fetching the ones that are not bundled.
//
// Everything but the bundled recording and a file of the user's own is
// fetched on request from Wikimedia Commons into the data directory. Until it
// has arrived, or if it never does, the bundled recording plays, so a prayer
// is never silent because of a download.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Voices from '../engine/voices.js';
import * as Day from '../engine/day.js';
import { RESOURCE_BASE, dataDir, voicesDir, ensureDir, fileSize } from './paths.js';
import { download } from './network.js';

// A download smaller than this is an error page, not a recording.
const MIN_RECORDING_BYTES = 50000;

export const VoiceStore = GObject.registerClass({
    Properties: {
        // ready | downloading | failed. "ready" also covers the two voices
        // that need no download.
        'status': GObject.ParamSpec.string('status', null, null, GObject.ParamFlags.READABLE, 'ready'),
        'error': GObject.ParamSpec.string('error', null, null, GObject.ParamFlags.READABLE, ''),
    },
}, class VoiceStore extends GObject.Object {
    constructor(settings) {
        super();
        this._settings = settings;
        this._status = 'ready';
        this._error = '';
        this._downloading = null;
        this._settings.connect('changed::voice', () => this.ensure().catch(logError));
    }

    get status() { return this._status; }
    get error() { return this._error; }

    // The chosen voice, resolved through the catalogue.
    get voice() {
        return Voices.voice(Day.voiceSelection({ voice: this._settings.get_string('voice') }));
    }

    cacheFile(v = this.voice) {
        return Gio.File.new_for_path(GLib.build_filenamev([voicesDir(), `${v.id}.${v.ext}`]));
    }

    // The URI to hand the player right now. Never waits on the network.
    async uriToPlay() {
        const v = this.voice;
        if (v.id === 'custom') {
            const custom = this._settings.get_string('custom-adhan-file').trim();
            if (custom.length > 0)
                return Gio.File.new_for_path(custom).get_uri();
            return this.bundledUri();
        }
        if (Voices.isDownloadable(v) && this._status === 'ready' &&
            await fileSize(this.cacheFile(v)) >= MIN_RECORDING_BYTES)
            return this.cacheFile(v).get_uri();
        return this.bundledUri();
    }

    // The bundled recording is a GResource. It is copied out once so the
    // player gets an ordinary file URI, which every GStreamer source
    // understands, rather than depending on giosrc's handling of resource://.
    bundledUri() {
        const target = Gio.File.new_for_path(GLib.build_filenamev([dataDir(), 'bundled.ogg']));
        const resource = Gio.File.new_for_uri(`resource://${RESOURCE_BASE}/adhan.ogg`);
        try {
            const expected = resource.query_info(Gio.FILE_ATTRIBUTE_STANDARD_SIZE, Gio.FileQueryInfoFlags.NONE, null).get_size();
            let have = -1;
            try {
                have = target.query_info(Gio.FILE_ATTRIBUTE_STANDARD_SIZE, Gio.FileQueryInfoFlags.NONE, null).get_size();
            } catch {
                // Not copied yet.
            }
            if (have !== expected) {
                ensureDir(dataDir());
                resource.copy(target, Gio.FileCopyFlags.OVERWRITE, null, null);
            }
        } catch (e) {
            logError(e, 'Could not unpack the bundled recording');
        }
        return target.get_uri();
    }

    // Make sure the chosen voice is on disk, fetching it if not.
    async ensure() {
        const v = this.voice;
        if (!Voices.isDownloadable(v)) {
            this._set('ready', '');
            return;
        }
        // Let a download in flight finish; it re-checks the choice when done.
        if (this._downloading)
            return;
        if (await fileSize(this.cacheFile(v)) >= MIN_RECORDING_BYTES) {
            this._set('ready', '');
            return;
        }
        await this._download(v);
    }

    async retry() {
        if (this._downloading)
            return;
        await this.ensure();
    }

    async _download(v) {
        this._downloading = v.id;
        this._set('downloading', '');
        // Into a .part file first, and only counted as arrived when it is at
        // least recording-sized, so a half-fetched or error-page file never
        // plays.
        const target = this.cacheFile(v);
        const part = Gio.File.new_for_path(`${target.get_path()}.part`);
        try {
            ensureDir(voicesDir());
            const bytes = await download(v.url, part);
            if (bytes < MIN_RECORDING_BYTES)
                throw new Error(`Received ${bytes} bytes, which is not a recording`);
            part.move(target, Gio.FileCopyFlags.OVERWRITE, null, null);
            if (this._downloading === this.voice.id)
                this._set('ready', '');
        } catch (e) {
            try {
                part.delete(null);
            } catch {
                // Nothing to clean up.
            }
            if (this._downloading === this.voice.id)
                this._set('failed', e.message);
        } finally {
            const finished = this._downloading;
            this._downloading = null;
            // The choice moved on while this one was in flight.
            if (finished !== this.voice.id)
                this.ensure().catch(logError);
        }
    }

    _set(status, error) {
        const changed = status !== this._status;
        const errorChanged = error !== this._error;
        this._status = status;
        this._error = error;
        if (changed)
            this.notify('status');
        if (errorChanged)
            this.notify('error');
    }
});
