// The application: one window at most, the services that outlive it, and the
// actions the menu, the notifications and `gapplication` can invoke.
//
// With "Run in the background" on, the application holds itself so closing
// the window does not quit it; the announcer keeps ticking and the adhan
// still sounds. `--background` starts it that way without a window, which is
// what the autostart entry uses.

import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gst from 'gi://Gst?version=1.0';
import Gtk from 'gi://Gtk?version=4.0';

import * as Voices from './engine/voices.js';
import { APP_ID, RESOURCE_BASE } from './services/paths.js';
import { getSettings } from './services/settings.js';
import { AdhanPlayer } from './services/player.js';
import { VoiceStore } from './services/voice-store.js';
import { Announcer } from './services/announcer.js';
import { setAutostart } from './services/background.js';
import { SalahWindow } from './ui/window.js';
import { SalahPreferences } from './ui/preferences.js';
import { LocationDialog } from './ui/location-dialog.js';

export const SalahApplication = GObject.registerClass(
class SalahApplication extends Adw.Application {
    constructor() {
        super({
            application_id: APP_ID,
            flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE,
            resource_base_path: RESOURCE_BASE,
        });
        this._held = false;

        this.add_main_option('background', 0, GLib.OptionFlags.NONE, GLib.OptionArg.NONE,
            'Start in the background, without a window', null);
        this.add_main_option('version', 0, GLib.OptionFlags.NONE, GLib.OptionArg.NONE,
            'Print the version and exit', null);
    }

    get settings() { return this._settings; }
    get announcer() { return this._announcer; }
    get player() { return this._player; }
    get voices() { return this._voices; }

    // ---------------------------------------------------------------- lifecycle
    vfunc_handle_local_options(options) {
        if (options.contains('version')) {
            print(`Salah ${pkg.version}`);
            return 0;
        }
        return -1;
    }

    vfunc_command_line(commandLine) {
        const options = commandLine.get_options_dict();
        if (options.contains('background')) {
            if (!this._settings.get_boolean('run-in-background')) {
                commandLine.printerr_literal(
                    'Salah is set not to run in the background, so there is nothing to do. ' +
                    'Turn it on under Preferences › General.\n');
            }
        } else {
            this.activate();
        }
        return 0;
    }

    vfunc_startup() {
        super.vfunc_startup();
        Gst.init(null);

        this._settings = getSettings();
        this._loadStyle();

        this._player = new AdhanPlayer();
        this._voices = new VoiceStore(this._settings);
        this._announcer = new Announcer(this, this._settings, this._player, this._voices);

        this._addActions();
        this._syncBackground();
        this._settings.connect('changed::run-in-background', () => this._syncBackground(true));

        this._announcer.start();
        this._voices.ensure().catch(logError);
    }

    vfunc_activate() {
        this._ensureWindow().present();
    }

    vfunc_shutdown() {
        this._announcer.stop();
        super.vfunc_shutdown();
    }

    _ensureWindow() {
        return this.active_window ?? new SalahWindow({ application: this });
    }

    _loadStyle() {
        const provider = new Gtk.CssProvider();
        provider.load_from_resource(`${RESOURCE_BASE}/style.css`);
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        iconTheme.add_resource_path(`${RESOURCE_BASE}/icons`);
        // Under `meson devenv` nothing is installed, so the application icon
        // would be missing from the About dialog and the notifications.
        const sourceRoot = GLib.getenv('MESON_SOURCE_ROOT');
        if (sourceRoot && GLib.getenv('MESON_DEVENV') === '1')
            iconTheme.add_search_path(GLib.build_filenamev([sourceRoot, 'data', 'icons']));
    }

    // The hold is the whole mechanism: while held, GApplication stays alive
    // with no window, and the announcer with it.
    _syncBackground(changed = false) {
        const on = this._settings.get_boolean('run-in-background');
        if (on && !this._held) {
            this.hold();
            this._held = true;
        } else if (!on && this._held) {
            this.release();
            this._held = false;
        }
        setAutostart(on)
            .then(how => log(`Autostart ${on ? 'on' : 'off'} via ${how}`))
            .catch(e => log(`Autostart could not be ${on ? 'enabled' : 'disabled'}: ${e.message}`));
        if (changed && !on)
            log('Run in the background is off; the app quits when the window closes');
    }

    // ---------------------------------------------------------------- actions
    _addActions() {
        const actions = [
            ['show', () => this.activate()],
            ['preferences', () => this._showPreferences()],
            ['location', () => new LocationDialog(this._settings).present(this._ensureWindow())],
            ['shortcuts', () => this._showShortcuts()],
            ['about', () => this._showAbout()],
            ['play', () => this._announcer.playTest()],
            ['stop', () => this._announcer.stopAdhan()],
            ['fetch-voice', () => this._voices.retry().catch(logError)],
            ['sync-hijri', () => this._announcer.syncHijri(true).catch(logError)],
            ['quit', () => this.quit()],
        ];
        for (const [name, handler] of actions) {
            const action = new Gio.SimpleAction({ name });
            action.connect('activate', handler);
            this.add_action(action);
        }

        // `gapplication action io.github.sifenfisaha.Salah preferences-page "'adhan'"`
        // opens preferences on a given page: times, adhan or general.
        const page = new Gio.SimpleAction({ name: 'preferences-page', parameter_type: new GLib.VariantType('s') });
        page.connect('activate', (_action, parameter) => this._showPreferences(parameter.unpack()));
        this.add_action(page);

        // Stop is only meaningful while something plays; a greyed-out menu
        // item says so.
        const stop = this.lookup_action('stop');
        const syncStop = () => { stop.enabled = this._player.playing !== ''; };
        syncStop();
        this._player.connect('notify::playing', syncStop);

        this.set_accels_for_action('app.preferences', ['<Control>comma']);
        this.set_accels_for_action('app.shortcuts', ['<Control>question']);
        this.set_accels_for_action('app.play', ['<Control>p']);
        this.set_accels_for_action('app.stop', ['<Control>period']);
        this.set_accels_for_action('app.quit', ['<Control>q']);
        this.set_accels_for_action('app.location', ['<Control>l']);
        this.set_accels_for_action('window.close', ['<Control>w']);
    }

    _showPreferences(page = '') {
        const dialog = new SalahPreferences(this);
        if (page)
            dialog.set_visible_page_name(page);
        dialog.present(this._ensureWindow());
    }

    _showShortcuts() {
        const builder = Gtk.Builder.new_from_resource(`${RESOURCE_BASE}/ui/shortcuts.ui`);
        builder.get_object('shortcuts_dialog').present(this._ensureWindow());
    }

    _showAbout() {
        const about = new Adw.AboutDialog({
            application_name: 'Salah',
            application_icon: APP_ID,
            developer_name: 'sifenfisaha',
            version: pkg.version,
            website: 'https://github.com/sifenfisaha/salah',
            issue_url: 'https://github.com/sifenfisaha/salah/issues',
            license_type: Gtk.License.MIT_X11,
            developers: ['sifenfisaha'],
            copyright: '© 2026 sifenfisaha',
            // Translators: replace with your name and, optionally, email
            translator_credits: _('translator-credits'),
        });
        about.add_link(_('The Omarchy Plugin'), 'https://github.com/sifenfisaha/omarchy-salah-reminder');
        about.add_acknowledgement_section(_('Prayer-time model'), ['PrayTimes.org https://praytimes.org']);

        const credits = Voices.VOICES
            .filter(v => v.author)
            .map(v => `${_(v.label)}\n${v.author} · ${v.licence} · ${v.page}`)
            .join('\n\n');
        about.add_legal_section(_('Adhan recordings'), null, Gtk.License.CUSTOM,
            `${_('Recordings are from Wikimedia Commons, each under the licence shown, and are fetched only when chosen.')}\n\n${credits}`);
        about.present(this._ensureWindow());
    }
});
