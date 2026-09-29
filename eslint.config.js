// Flat config. Two environments share one tree: the engine and the tests are
// plain ECMAScript that node runs, everything else runs inside gjs and sees the
// globals gjs's package loader defines.
import js from '@eslint/js';

const gjsGlobals = {
    imports: 'readonly',
    pkg: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
    _: 'readonly',
    C_: 'readonly',
    N_: 'readonly',
    ngettext: 'readonly',
    ARGV: 'readonly',
    TextDecoder: 'readonly',
    TextEncoder: 'readonly',
    console: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    globalThis: 'readonly',
};

export default [
    js.configs.recommended,
    {
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: gjsGlobals,
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
        },
    },
    {
        files: ['test/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { process: 'readonly', console: 'readonly', globalThis: 'readonly' },
        },
    },
];
