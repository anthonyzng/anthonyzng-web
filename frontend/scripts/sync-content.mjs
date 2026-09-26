#!/usr/bin/env node
/**
 * Refreshes the site's static fallback content (`src/content/snapshot/<locale>.json`) from a running
 * API, so the page's first paint (and any visit while the API is down) shows what the admin panel
 * last saved. The Content snapshot sync workflow (.github/workflows/content-sync.yml) runs it daily
 * against production and opens a pull request when the files change; run it by hand to update at once.
 *
 *   npm run content:sync                                   # http://localhost:8000 (or VITE_API_BASE_URL)
 *   npm run content:sync -- --api https://api.owwsolution.com
 *   npm run content:sync -- https://api.owwsolution.com    # the same, in any shell
 *
 * Both locales are fetched and checked before either file is written (and fetched again once if an
 * admin save landed between the two requests), then both are written to temporary files and
 * renamed into place, so a failure leaves the previous pair untouched. The payload is written
 * exactly as `GET /api/v1/content` returns it; `src/content/snapshot.test.ts` validates both files
 * against the same zod schema the app uses for live responses.
 *
 * Cover images and the CV are referenced by the id they have in the database behind that API: sync
 * from the API of the database the site will run against (production before a deploy).
 */
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'

const LOCALES = ['en', 'zh-Hant']
const LISTS = ['experience', 'projects']
const SKILL_LISTS = ['groups', 'education', 'certifications', 'languages']
const TIMEOUT_MS = 15_000

function apiBase() {
  // `--api <url>` or just `<url>`: Windows PowerShell drops the `--` of
  // `npm run content:sync -- --api <url>`, npm then takes `--api` for itself and passes on only the URL.
  const [value = process.env.VITE_API_BASE_URL?.trim() || 'http://localhost:8000', ...extra] = process.argv
    .slice(2)
    .filter((arg) => arg !== '--api')
  if (extra.length > 0) throw new Error(`expected one API origin, got: ${[value, ...extra].join(' ')}`)
  if (!/^https?:\/\/[^/]/.test(value)) throw new Error(`the API origin must be an http(s) URL, got "${value}"`)
  return value.replace(/\/+$/, '')
}

/** A cheap structural check, so an error page or a half-migrated API never becomes the fallback. */
function check(payload, locale) {
  const fail = (what) => {
    throw new Error(`/content?locale=${locale}: ${what}`)
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) fail('not a JSON object')
  if (payload.locale !== locale) fail(`locale is "${payload.locale}"`)
  for (const key of LISTS) if (!Array.isArray(payload[key])) fail(`"${key}" is not a list`)
  for (const key of SKILL_LISTS) if (!Array.isArray(payload.skills?.[key])) fail(`"skills.${key}" is not a list`)
  if (!Array.isArray(payload.contact?.links)) fail('"contact.links" is not a list')
  if (!('cv' in payload)) fail('"cv" is missing (is the API older than Phase 5?)')
}

async function fetchPayload(base, locale) {
  const url = `${base}/api/v1/content?locale=${encodeURIComponent(locale)}`
  let response
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (error) {
    const reason = error?.cause?.code ?? error?.cause?.message ?? error?.name ?? 'unknown error'
    throw new Error(`${url} could not be reached (${reason}); is the backend running?`)
  }
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  const payload = await response.json()
  check(payload, locale)
  return { url, payload }
}

/** What both locales share (ids, order, untranslated facts): differs only if the content changed
 * between the two requests. */
function facts(payload) {
  const ids = (items) => items.map((item) => item.id)
  return JSON.stringify({
    experience: payload.experience.map(({ id, company, start, end }) => [id, company, start, end]),
    projects: payload.projects.map(({ id, placeholder, url, image }) => [id, placeholder, url, image]),
    skills: Object.fromEntries(SKILL_LISTS.map((key) => [key, ids(payload.skills[key])])),
    links: payload.contact.links.map(({ id, href, display }) => [id, href, display]),
    cv: payload.cv,
  })
}

async function fetchBoth(base) {
  for (let attempt = 1; ; attempt += 1) {
    const results = []
    for (const locale of LOCALES) results.push({ locale, ...(await fetchPayload(base, locale)) })
    if (new Set(results.map(({ payload }) => facts(payload))).size === 1) return results
    if (attempt === 2) throw new Error('the two locales disagree (content kept changing); try again')
  }
}

async function main() {
  const base = apiBase()
  const results = await fetchBoth(base)

  const directory = new URL('../src/content/snapshot/', import.meta.url)
  await mkdir(directory, { recursive: true })
  const staged = results.map((result) => ({
    ...result,
    temporary: new URL(`.${result.locale}.json.tmp`, directory),
    target: new URL(`${result.locale}.json`, directory),
  }))
  try {
    for (const { payload, temporary } of staged) {
      await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    }
    for (const { temporary, target } of staged) await rename(temporary, target)
  } finally {
    await Promise.all(staged.map(({ temporary }) => rm(temporary, { force: true })))
  }
  for (const { locale, url, payload } of results) {
    const counts = `${payload.experience.length} roles, ${payload.projects.length} projects, cv: ${payload.cv ? 'yes' : 'no'}`
    console.log(`content:sync  ${locale}  <- ${url}  (${counts})`)
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(base)) {
    console.log(
      'content:sync  note: synced from a local API. Cover images and the CV point at files in that\n' +
        '              database; before a deploy, sync from the production API instead.',
    )
  }
}

main().catch((error) => {
  console.error(`content:sync failed: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
