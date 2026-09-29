// Desktop notifications, through GNotification so they work the same under
// GNOME Shell, the portal, and any freedesktop notification daemon.

import Gio from 'gi://Gio';
import { APP_ID } from './paths.js';
import { format } from './util.js';

const PRAYER_ID = 'prayer';
const REMINDER_ID = 'reminder';

function base(title, body, priority) {
    const notification = new Gio.Notification();
    notification.set_title(title);
    notification.set_body(body);
    notification.set_priority(priority);
    notification.set_icon(Gio.ThemedIcon.new(APP_ID));
    notification.set_default_action('app.show');
    return notification;
}

export function notifyPrayer(app, label, timeText, adhanPlaying) {
    const n = base(
        // Translators: %s is the prayer, e.g. "Maghrib · 18:18"
        format(_('%s · %s'), label, timeText),
        format(_('It is time for %s prayer.'), label),
        Gio.NotificationPriority.HIGH);
    if (adhanPlaying)
        n.add_button(_('Stop the adhan'), 'app.stop');
    app.withdraw_notification(REMINDER_ID);
    app.send_notification(PRAYER_ID, n);
}

export function notifyReminder(app, label, minutes, timeText) {
    const n = base(
        // Translators: %s is the prayer, %d the minutes, e.g. "Asr in 10 min"
        format(_('%s in %d min'), label, minutes),
        format(_('%s at %s'), label, timeText),
        Gio.NotificationPriority.NORMAL);
    app.send_notification(REMINDER_ID, n);
}

export function withdrawAll(app) {
    app.withdraw_notification(PRAYER_ID);
    app.withdraw_notification(REMINDER_ID);
}
