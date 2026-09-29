// Entry point. The launcher (io.github.sifenfisaha.Salah.in) has already
// registered the package with gjs, so pkg.* and the gresources exist here.

import { SalahApplication } from './application.js';

export function main(argv) {
    // Defines _, C_ and N_ as globals. Nothing translates at import time —
    // every _() call in this tree lives inside a function — so doing it here,
    // after the imports above, is early enough.
    pkg.initGettext();

    const app = new SalahApplication();
    return app.runAsync(argv);
}
