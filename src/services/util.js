// Small helpers shared by the services and the UI.

// printf-style %s and %d substitution, so translatable strings can carry
// their arguments in a translator-friendly order without pulling in gjs's
// legacy String.prototype.format.
export function format(template, ...args) {
    let i = 0;
    return String(template).replace(/%[sd]/g, () => {
        const value = args[i++];
        return value === undefined ? '' : String(value);
    });
}

// Errors from a cancelled operation are the caller's own doing, and never
// worth reporting.
export function isCancelled(error) {
    return Boolean(error) && (error.matches?.(imports.gi.Gio.IOErrorEnum, imports.gi.Gio.IOErrorEnum.CANCELLED) ||
        /cancel/i.test(String(error.message)));
}
