---
name: add-ui-string
description: Add or change user-facing text in the frontend (public site or admin panel) in both English and Traditional Chinese. Use whenever a component needs a new label, message or aria text.
---

# Add a UI string

UI strings are never hard-coded; every key exists in both locales.

1. Pick the file:
   - Public site: `frontend/src/i18n/locales/en.json` and `zh-Hant.json`.
   - Admin panel: `frontend/src/admin/locales/en.json` and `zh-Hant.json` (namespace `admin`).
   - Page content (hero, experience, projects, ...) is not a UI string: it lives in the database
     (`docs/frontend/content.md`). Only layout copy stays under `content.*`, and `locales.test.ts` pins that list:
     add a new `content.*` key there too.
2. Add the key to both files at the same place in the tree. Write real Traditional Chinese (Hong Kong usage),
   never a copy of the English; keep `{{placeholders}}` and plural suffixes (`_one`, `_other`) identical.
3. Use it with `t('key')` (`useTranslation()`; `useTranslation('admin')` in the admin panel). An accessible name for
   a link to another site ends with `common.newTab`.
4. Run the locale tests: `cd frontend && npx vitest run src/i18n src/admin/locales.test.ts`.
