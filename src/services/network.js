// The two things the app does on the network: fetch a small JSON answer, and
// stream a recording to disk. Both identify the app, because Wikimedia asks
// clients to, and both take a cancellable so a superseded request can be
// dropped rather than raced.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');
Gio._promisify(Soup.Session.prototype, 'send_async', 'send_finish');
Gio._promisify(Gio.File.prototype, 'replace_async', 'replace_finish');
Gio._promisify(Gio.OutputStream.prototype, 'splice_async', 'splice_finish');

let session = null;

function getSession() {
    session ??= new Soup.Session({
        user_agent: `salah/${pkg.version} (https://github.com/sifenfisaha/salah)`,
        timeout: 20,
    });
    return session;
}

function checkStatus(message) {
    const status = message.get_status();
    if (status < 200 || status >= 300)
        throw new Error(`HTTP ${status} ${message.get_reason_phrase() ?? ''}`.trim());
}

export async function fetchText(url, cancellable = null) {
    const message = Soup.Message.new('GET', url);
    const bytes = await getSession().send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable);
    checkStatus(message);
    return new TextDecoder().decode(bytes.get_data());
}

// Streams the response body into `file`, replacing it atomically once the
// whole body has arrived. Returns the number of bytes written.
export async function download(url, file, cancellable = null) {
    const message = Soup.Message.new('GET', url);
    const input = await getSession().send_async(message, GLib.PRIORITY_DEFAULT, cancellable);
    checkStatus(message);
    const output = await file.replace_async(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION,
        GLib.PRIORITY_DEFAULT, cancellable);
    return output.splice_async(input,
        Gio.OutputStreamSpliceFlags.CLOSE_SOURCE | Gio.OutputStreamSpliceFlags.CLOSE_TARGET,
        GLib.PRIORITY_DEFAULT, cancellable);
}
