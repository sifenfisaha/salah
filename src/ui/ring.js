// The progress ring around the next prayer's icon: how far through the
// current window we are, drawn with GSK paths so it stays crisp at any
// scale factor, in the desktop's accent colour.

import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Gsk from 'gi://Gsk';
import Gtk from 'gi://Gtk?version=4.0';

export const Ring = GObject.registerClass({
    GTypeName: 'SalahRing',
    CssName: 'salah-ring',
    Properties: {
        'progress': GObject.ParamSpec.double('progress', null, null,
            GObject.ParamFlags.READWRITE, 0, 1, 0),
        'size': GObject.ParamSpec.int('size', null, null,
            GObject.ParamFlags.READWRITE, 16, 1024, 104),
        'line-width': GObject.ParamSpec.double('line-width', null, null,
            GObject.ParamFlags.READWRITE, 1, 64, 6),
    },
}, class Ring extends Gtk.Widget {
    constructor(params) {
        super(params);
        this._accentId = 0;
        this.connect('notify::progress', () => this.queue_draw());
        this.connect('notify::line-width', () => this.queue_draw());
        this.connect('notify::size', () => this.queue_resize());
    }

    vfunc_realize() {
        super.vfunc_realize();
        // A stale ring in the old accent is the one artefact a cached
        // drawing would happily keep showing after the desktop changes it.
        const styleManager = Adw.StyleManager.get_default();
        this._accentId = styleManager.connect('notify::accent-color-rgba', () => this.queue_draw());
    }

    vfunc_unrealize() {
        if (this._accentId) {
            Adw.StyleManager.get_default().disconnect(this._accentId);
            this._accentId = 0;
        }
        super.vfunc_unrealize();
    }

    vfunc_measure(_orientation, _forSize) {
        return [this.size, this.size, -1, -1];
    }

    vfunc_snapshot(snapshot) {
        const width = this.get_width();
        const height = this.get_height();
        const lineWidth = this.line_width;
        const radius = Math.min(width, height) / 2 - lineWidth / 2;
        const cx = width / 2;
        const cy = height / 2;
        if (radius <= 0)
            return;

        const foreground = this.get_color();
        const track = new Gdk.RGBA({
            red: foreground.red, green: foreground.green, blue: foreground.blue,
            alpha: foreground.alpha * 0.12,
        });

        let builder = new Gsk.PathBuilder();
        builder.add_circle(new Graphene.Point({ x: cx, y: cy }), radius);
        snapshot.append_stroke(builder.to_path(), new Gsk.Stroke(lineWidth), track);

        const progress = Math.max(0, Math.min(1, this.progress));
        if (progress <= 0)
            return;

        const stroke = new Gsk.Stroke(lineWidth);
        stroke.set_line_cap(Gsk.LineCap.ROUND);
        builder = new Gsk.PathBuilder();
        if (progress >= 0.9995) {
            builder.add_circle(new Graphene.Point({ x: cx, y: cy }), radius);
        } else {
            // From twelve o'clock, clockwise.
            const start = -Math.PI / 2;
            const end = start + 2 * Math.PI * progress;
            builder.move_to(cx + radius * Math.cos(start), cy + radius * Math.sin(start));
            builder.svg_arc_to(radius, radius, 0, progress > 0.5, true,
                cx + radius * Math.cos(end), cy + radius * Math.sin(end));
        }
        snapshot.append_stroke(builder.to_path(), stroke,
            Adw.StyleManager.get_default().get_accent_color_rgba());
    }
});
