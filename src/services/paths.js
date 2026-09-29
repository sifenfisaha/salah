// Where the app keeps things, and the small file helpers everything shares.
//
// Under Flatpak the XDG directories are already private to the app; outside
// it they are shared with every other program, so the app id is used as the
// subdirectory rather than something short that another project might pick.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const APP_ID = 'io.github.sifenfisaha.Salah';
export const RESOURCE_BASE = '/io/github/sifenfisaha/Salah';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'query_info_async', 'query_info_finish');

export function dataDir() {
    return GLib.build_filenamev([GLib.get_user_data_dir(), APP_ID]);
}

export function stateDir() {
    return GLib.build_filenamev([GLib.get_user_state_dir(), APP_ID]);
}

// Downloaded voices. Data rather than cache: a cache may be cleared behind
// the app's back, and the adhan would then silently fall back to the bundled
// recording.
export function voicesDir() {
    return GLib.build_filenamev([dataDir(), 'adhan']);
}

export function announcedFile() {
    return Gio.File.new_for_path(GLib.build_filenamev([stateDir(), 'announced.json']));
}

export function stateFile() {
    return Gio.File.new_for_path(GLib.build_filenamev([stateDir(), 'state.json']));
}

export function ensureDir(path) {
    if (GLib.mkdir_with_parents(path, 0o700) !== 0)
        throw new Error(`Could not create ${path}`);
}

// The file's text, or null when it does not exist. Anything else is an error
// the caller should hear about.
export async function readText(file, cancellable = null) {
    try {
        const [contents] = await file.load_contents_async(cancellable);
        return new TextDecoder().decode(contents);
    } catch (e) {
        if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return null;
        throw e;
    }
}

// replace_contents writes to a temporary file and renames it into place, so
// a reader can never see the file half-written.
export async function writeText(file, text, cancellable = null) {
    ensureDir(file.get_parent().get_path());
    const bytes = new GLib.Bytes(new TextEncoder().encode(text));
    await file.replace_contents_bytes_async(bytes, null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, cancellable);
}

// Size in bytes, or -1 when the file is missing.
export async function fileSize(file, cancellable = null) {
    try {
        const info = await file.query_info_async(Gio.FILE_ATTRIBUTE_STANDARD_SIZE,
            Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
        return info.get_size();
    } catch (e) {
        if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return -1;
        throw e;
    }
}
