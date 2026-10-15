---
name: schema-change
description: Change the database schema or a content collection end to end - model, Alembic migration, schemas, admin API, frontend types, seed, tests, docs. Use when adding or changing a table, column or content field.
---

# Change the schema

Work in this order; each step names where things live (details in `backend/CLAUDE.md` and `docs/backend/`).

1. **Model**: `backend/app/models/`. Translatable text goes into the JSONB `translations` column
   (`{"en": {...}, "zh-Hant": {...}}`); untranslated facts are ordinary columns; dates are `YYYY-MM` strings.
2. **Migration**: `cd backend && python -m uv run alembic revision --autogenerate -m "describe change"`, then read
   the generated file: name it like the others (`000N_...`), add CHECKs the model implies, and backfill existing
   rows when a column is required. Never edit an applied migration.
3. **Schemas**: write model `*In` in `app/schemas/content_write.py` (validation, ASCII-only patterns), read model
   `*Out` in `app/schemas/admin.py`, public payload in the content schemas; register a new collection in
   `app/services/collections.py`.
4. **Public payload**: `app/services/content.py` resolves it per locale. On the frontend, `ResolvedContent`
   (`src/content/resolved.ts`) and `contentPayloadSchema` (`src/api/schemas.ts`) must change together.
5. **Admin panel**: the collection config in `frontend/src/admin/collections.ts`, limits in `validation.ts`,
   strings in both admin locales (`add-ui-string` skill).
6. **Seed and snapshot**: `app/seed/content.json` for a new field; `src/test/contentFixture.ts`; the snapshot
   files change only through `npm run content:sync` against a running API.
7. **Tests**: backend tests for validation, round trip and the published payload (`tests/test_migrations.py`
   catches model drift); frontend tests for rendering.
8. **Docs**: update `backend/CLAUDE.md` / `docs/backend/*` / `docs/frontend/*` where the behaviour is described.
9. Ship with the `ship` skill (runs ruff, mypy, pytest and the frontend checks).
