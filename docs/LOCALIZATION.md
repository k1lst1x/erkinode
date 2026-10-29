# Localization

Erkinode uses **i18next** for shared translation behavior and **react-i18next** for React updates. English is the default and fallback language. Russian and Kazakh are available in Settings → Language; the preference applies immediately and is stored in the encrypted vault.

## Structure

- `locales/en.json`: English source catalog and message identifiers.
- `locales/ru.json`: Russian catalog.
- `locales/kk.json`: Kazakh catalog (`kk`, not the country code `kz`), with matching keys and interpolation variables.
- `locales/runtime.js`: bundled resources, supported languages, and translator factory.
- `src/i18n/index.ts`: renderer instance, React bindings, and `t()` wrapper.
- `electron/i18n.js`: independent main-process instance for native prompts, menus, and application errors.

Both processes load the same catalogs. Main updates its language only after settings are successfully saved. Renderer reads the persisted preference from the state response. Older vaults without a language field default to English; changing font size does not overwrite language, and vice versa. Restoring a backup restores its language preference as well.

Resources are bundled locally. No translation service, remote script, or network request is required. Terminal output, commands, host names, paths, and SSH authentication challenges from the server remain unchanged. Operating-system controls and third-party/system error details may follow the OS or upstream language.

## Adding a language

1. Copy `locales/en.json` into a new language file and translate all values while keeping keys stable.
2. Preserve every named `{{variable}}` placeholder and all technical identifiers.
3. Register the catalog and native language name in `locales/runtime.js`; update the TypeScript language union. Backend preference validation uses the shared language-code list.
4. The shared catalog registry automatically includes the new catalog in `scripts/check-locales.mjs`. Tests must check complete keys, nonempty values, and matching placeholders.
5. Add plural variants required by the language, and test representative counts. Current catalogs include one/few/many/other entries for Russian; English uses one/other. Kazakh count labels use an invariant noun after the number.
6. Check keyboard access, longer text, native dialogs, fallback, dates, and live terminal preservation. Right-to-left languages need explicit layout work before being advertised as supported.

English source strings currently act as most message IDs. Keep those IDs stable when refining copy. New dynamic messages use named interpolation; counts use i18next plural selection. Do not concatenate translated sentence fragments.

## Checks

```sh
pnpm locales:check
pnpm test
pnpm test:ui
```

Unit tests cover fallback, interpolation, plural forms, old-vault defaults, persistence, partial-setting updates, and invalid-language rejection. Electron E2E switches languages during an active session, reloads the interface to verify persistence, and checks main-process errors, native dialog titles, and menu labels.

Sources: [i18next configuration](https://www.i18next.com/overview/configuration-options), [React bindings](https://react.i18next.com/latest), [Tabby implementation](https://github.com/Eugeny/tabby/blob/master/tabby-core/src/services/locale.service.ts), [Electerm catalogs](https://github.com/electerm/electerm-locales).
