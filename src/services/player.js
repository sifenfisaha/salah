// Playback of the adhan through GStreamer.
//
// One playbin for the life of the app. `playing` names what is sounding —
// a prayer key, or "test" for the button in preferences — and is empty in
// between, so the window can show a Stop control exactly when there is
// something to stop. Video is sent to a fakesink: the Makkah recording on
// Commons is a video container, and without that a window would pop up.

import GObject from 'gi://GObject';
import Gst from 'gi://Gst?version=1.0';

export const AdhanPlayer = GObject.registerClass({
    Properties: {
        'playing': GObject.ParamSpec.string('playing', null, null,
            GObject.ParamFlags.READABLE, ''),
    },
    Signals: {
        'finished': {},
        'failed': { param_types: [GObject.TYPE_STRING] },
    },
}, class AdhanPlayer extends GObject.Object {
    constructor() {
        super();
        this._playbin = null;
        this._playing = '';
    }

    get playing() {
        return this._playing;
    }

    play(uri, volumePercent, key) {
        const playbin = this._ensurePlaybin();
        playbin.set_state(Gst.State.NULL);
        playbin.uri = uri;
        this.setVolume(volumePercent);
        const result = playbin.set_state(Gst.State.PLAYING);
        if (result === Gst.StateChangeReturn.FAILURE) {
            this._setPlaying('');
            this.emit('failed', `Could not play ${uri}`);
            return;
        }
        this._setPlaying(key);
    }

    stop() {
        if (this._playbin)
            this._playbin.set_state(Gst.State.NULL);
        this._setPlaying('');
    }

    // Percent, where 100 is the recording as is and more amplifies. Takes
    // effect immediately, so dragging the slider during a test is audible.
    setVolume(percent) {
        if (!this._playbin)
            return;
        const v = Math.max(0, Math.min(150, Number(percent) || 0));
        this._playbin.volume = v / 100;
    }

    _setPlaying(key) {
        if (this._playing === key)
            return;
        this._playing = key;
        this.notify('playing');
    }

    _ensurePlaybin() {
        if (this._playbin)
            return this._playbin;
        const playbin = Gst.ElementFactory.make('playbin3', 'adhan') ?? Gst.ElementFactory.make('playbin', 'adhan');
        if (!playbin)
            throw new Error('GStreamer has no playbin element; is gst-plugins-base installed?');
        const videoSink = Gst.ElementFactory.make('fakesink', 'no-video');
        if (videoSink)
            playbin.set_property('video-sink', videoSink);

        const bus = playbin.get_bus();
        bus.add_signal_watch();
        bus.connect('message', (_bus, message) => {
            switch (message.type) {
            case Gst.MessageType.EOS:
                this.stop();
                this.emit('finished');
                break;
            case Gst.MessageType.ERROR: {
                const [error] = message.parse_error();
                this.stop();
                this.emit('failed', error.message);
                break;
            }
            default:
                break;
            }
        });
        this._playbin = playbin;
        return playbin;
    }
});
