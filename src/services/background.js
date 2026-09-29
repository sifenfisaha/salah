// Running with the window closed, and starting at login.
//
// The Background portal is the sanctioned way to ask for both, and the only
// way inside Flatpak. Where no portal backend implements it — this is common
// outside GNOME and KDE — the app falls back to writing the autostart entry
// itself, which is what the portal would have done on its behalf.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { programPath } from 'system';
import { APP_ID, inFlatpak } from './paths.js';

const AUTOSTART_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), 'autostart']);
const AUTOSTART_FILE = GLib.build_filenamev([AUTOSTART_DIR, `${APP_ID}.desktop`]);

// What to run at login. Inside Flatpak the portal wants the command name and
// prefixes `flatpak run` itself. Outside, the launcher's full path: a bare
// name only works if the bin directory is on the session's PATH at login,
// which ~/.local/bin, the prefix the README suggests, often is not.
function launcher() {
    return inFlatpak() || !programPath ? APP_ID : programPath;
}

// Desktop-entry quoting, for the one argument that could hold a space.
function quoteExec(arg) {
    return /[\s"'\\`$]/.test(arg) ? `"${arg.replace(/[\\"`$]/g, '\\$&')}"` : arg;
}

async function viaPortal(enable) {
    const { default: Xdp } = await import('gi://Xdp');
    Gio._promisify(Xdp.Portal.prototype, 'request_background', 'request_background_finish');
    const portal = new Xdp.Portal();
    const flags = enable ? Xdp.BackgroundFlags.AUTOSTART : Xdp.BackgroundFlags.NONE;
    const ok = await portal.request_background(null,
        // Translators: shown by the system when it asks whether the app may run in the background
        _('Salah plays the adhan and sends reminders at prayer times, even while its window is closed.'),
        [launcher(), '--background'], flags, null);
    if (!ok)
        throw new Error('The background request was refused');
}

function writeAutostartFile() {
    GLib.mkdir_with_parents(AUTOSTART_DIR, 0o700);
    const entry = [
        '[Desktop Entry]',
        'Type=Application',
        'Name=Salah',
        'Comment=Prayer times and the adhan',
        `Exec=${quoteExec(launcher())} --background`,
        `Icon=${APP_ID}`,
        'Terminal=false',
        'X-GNOME-Autostart-enabled=true',
        '',
    ].join('\n');
    GLib.file_set_contents(AUTOSTART_FILE, entry);
}

function removeAutostartFile() {
    const file = Gio.File.new_for_path(AUTOSTART_FILE);
    try {
        file.delete(null);
    } catch (e) {
        if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            throw e;
    }
}

// Resolves to a short description of what was done, for the log.
export async function setAutostart(enable) {
    try {
        await viaPortal(enable);
        return 'portal';
    } catch (e) {
        if (inFlatpak())
            throw e;
        if (enable)
            writeAutostartFile();
        else
            removeAutostartFile();
        return `autostart file (portal unavailable: ${e.message})`;
    }
}
