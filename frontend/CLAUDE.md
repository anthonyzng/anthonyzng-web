# Frontend notes

Loaded when working under `frontend/`. The rules every frontend change must follow; the root `CLAUDE.md` holds the project overview, workflow and the pre-commit checks. Details by topic live in `docs/frontend/`:

- `docs/frontend/content.md`: where page content comes from (database, snapshot, `content:sync`), per-section content rules
- `docs/frontend/scenes.md`: the two themed worlds (black hole / night sky, ink-wash bamboo), contact screen, page glass, tags and cats, card light, section dock, statement photo
- `docs/frontend/api-client.md`: `src/env.ts`, the fetch client and zod schemas, `useContent`, the contact form, test stubs
- `docs/frontend/admin-panel.md`: the admin panel (`src/admin/`)
- `docs/frontend/seo.md`: meta tags, sitemap, structured data, Lighthouse results

- **Routing**: every public page lives under a language prefix, `/en/...` or `/zh-hant/...` (`src/components/LanguageLayout.tsx`). `/` redirects using the saved language (`localStorage.lang`) or the browser language. The URL is the source of truth for the active language. The admin panel lives at `/admin/*`, without a language prefix (see `docs/frontend/admin-panel.md`).

- **i18n**: locale config in `src/i18n/languages.ts`; UI strings in `src/i18n/locales/{en,zh-Hant}.json`. Every key must exist in both files.

- **Theme**: `data-theme="light|dark"` on `<html>`, set before first paint by `public/theme-init.js`, a blocking script in `index.html`'s head (a file, not an inline script, so the Content-Security-Policy needs no `'unsafe-inline'`), then managed by `src/theme/useTheme.ts`. Follows the OS until the user toggles; the choice is saved in `localStorage.theme`.

- **Design tokens**: defined once in `src/index.css` (CSS variables + Tailwind v4 `@theme`). Use the semantic utilities `bg-bg`, `bg-surface`, `text-fg`, `text-muted`, `border-line`, `text-accent`, `bg-accent`, `text-accent-fg`, and the `text-display` / `text-headline` sizes. Light is ink on paper (`--bg` #f8f6f0, `--fg` #141510, `--muted` #3a382f), dark the night sky (`--bg` #05070c); the sections are see-through to the page backdrop (`PageBackdrop`), so they carry no background of their own. Never use raw hex values in components (the canvas scenes draw their own ink and starlight). All text tokens are verified >= 4.5:1 contrast in both themes; re-check when changing a colour.

- **Fonts**: self-hosted via Fontsource (Inter Variable, Noto Sans TC Variable, IBM Plex Mono, and Kaushan Script's Latin subset as `font-brush`, the brush hand of the light contact screen, chosen by the owner for its dry-brush strength; for the ghost numerals Yuji Mai (light: a brush hand with bleeding ink, one of the few brush faces carrying the traditional formal numerals 貳 參, which the Chinese brush faces on Google Fonts lack; about 220 KB of unicode-range subsets for 壹 to 肆, fetched only in light mode) and Cinzel Decorative (dark, Latin subset)), with no Google Fonts requests.

- **Animation**: GSAP + ScrollTrigger + SplitText (registered only in `src/animations/gsap.ts`; import gsap from there) and Lenis. `SmoothScrollProvider` (a pathless layout route in `App.tsx`, so it survives language switches) owns the single Lenis instance, created only where motion is allowed and a hovering fine pointer is primary (`FINE_POINTER` in `media.ts`; Lenis only smooths the wheel, and on iOS Safari its per-frame programmatic scrolls were dropped, so section links did nothing and the next swipe jumped; touch-first phones and tablets scroll natively and section links use the browser's smooth scrolling): `autoRaf: false`, driven by `gsap.ticker` with `lagSmoothing(0)`, `lenis.on('scroll', ScrollTrigger.update)`, no scrollerProxy or normalizeScroll, destroyed on unmount. Sections consume hooks in `src/animations/` (`useHeroIntro`, `useParallax`, `useBlackHole`, `useInkStream`, `useSectionReveal`, `useStatementReveal`, `useSectionFades`, `useNightSky`, `useBambooGrove`, `useMeteorContact`, `useInkWriting`, `useScrollProgress`, `useActiveSection`, `useScrollTo`, `useHashScroll`); motion numbers live in `motion.ts`. Rules: the static DOM is the final state (no CSS ever hides content); from-states exist only inside a matched `gsap.matchMedia()` branch that requires `(prefers-reduced-motion: no-preference)`, and each branch runs through `runSafely()`, which reverts on error; animate only transform/opacity; parallax targets outer `[data-speed]` wrappers, intro and reveal tweens target inner elements, and GSAP targets never carry Tailwind translate/scale/rotate classes; exactly one GSAP pin (Statement, only on fine-pointer desktops at least `md` (48rem) wide and 600px tall where Lenis drives the wheel; on a child, never the root; `refreshPriority: 1` so it is refreshed before the triggers below it; no `anticipatePin`). `useScrollAnchor` keeps the reader's section when a breakpoint change rebuilds the matchMedia branches. Each content section passes `SectionShell` a `motionKey` (its item ids, joined): when the API payload adds or removes a card or row, `useSectionReveal` and `useParallax` revert and rebuild for the new set, so an item that only the API has is revealed and drifts like the others and no trigger stays on a removed node. Header offset: `--header-h` feeds `html { scroll-padding-top }` (Lenis and `scrollIntoView` both honour it) and `headerOffset()` in JS; never hard-code 64. Anchors: `SectionLink` renders a real `/lang#id` href; on the home page it smooth-scrolls via `useScrollTo` and focuses the section's `h2[tabindex="-1"]`; from other pages it navigates with router state that makes `useHashScroll` focus that heading; deep links land via `useHashScroll` before the first paint (no focus move); after a language switch focus returns to the language switcher, and the switch lands on the region being read (a section or the statement) at the same reading progress (`readingPosition.ts`; router state, applied on PUSH only, never replayed on Back/reload). JS media queries use the same unit as Tailwind (`MD_UP` / `BELOW_MD` in `media.ts`); never write px width queries. Touch-first devices: no Lenis (native scrolling, native smooth anchors). Reduced motion: no Lenis, no intro, parallax, pin, split or progress rule; native instant anchors. Touch tablets: no pin (the unpinned line reveal). Mobile (below `md`): no pin, halved parallax, no x-shear, native touch scroll (`syncTouch: false`); the menu is a native `<dialog>` with CSS-only motion. A scrubbed reveal never hides focus: `[data-reveal-inner]:focus-within` forces `opacity: 1` and `transform: none` (`!important` beats the inline styles GSAP writes), so a keyboard user never types into a translucent, displaced form or tabs onto a half-faded link.

## Stack

| Layer      | Choice |
|------------|--------|
| Frontend   | React + TypeScript + Vite |
| Styling    | Tailwind CSS |
| Animation  | GSAP + ScrollTrigger (scroll-driven, pinning, parallax), Lenis (smooth scroll) |
| i18n       | react-i18next; locales `en`, `zh-Hant` |
| Routing    | React Router |

## Design direction

Minimal, modern, professional. Reference style: editorial portfolios such as those collected on Awwwards and a1.gallery.
- Generous whitespace, strong typography (grotesk sans such as Inter / Neue Montreal, plus a mono accent such as IBM Plex Mono)
- Restrained palette: neutral base plus one accent colour
- Motion is tasteful: layered parallax on individual elements, text reveals tied to scroll, pinned sections for storytelling (e.g. the experience timeline)
- Use the `ui-ux-pro-max` skill for design system decisions

## Conventions

- TypeScript strict mode. Function components + hooks, one component per file, PascalCase filenames.
- Animation logic lives in `src/animations/` as reusable hooks (`useParallax`, `useScrollReveal`, ...). Sections consume hooks rather than wiring GSAP inline.
- Use `gsap.context()` / `useGSAP` and always clean up ScrollTriggers on unmount.
- Always honour `prefers-reduced-motion`.
- Animate only `transform` and `opacity`.
- Mobile-first; verify at 375px, 768px, 1280px+ (use the `webapp-testing` skill).
- Accessibility: semantic HTML, alt text, keyboard navigation, WCAG AA contrast in both themes.

## Files

```
anthonyzng-web/
├── frontend/
│   ├── CLAUDE.md               # frontend rules, loaded when working under frontend/
│   ├── Dockerfile              # multi-stage: npm build → unprivileged nginx on :8080
│   ├── nginx.conf              # SPA fallback, asset caching, /healthz
│   ├── .env.example            # VITE_API_BASE_URL, VITE_TURNSTILE_SITE_KEY (public build-time values)
│   ├── scripts/                # sync-content.mjs (`npm run content:sync`)
│   └── src/
│       ├── api/                # fetch client, zod schemas, /content and /contact calls, file URLs
│       ├── components/         # incl. ContactForm + ContactDialog, ProjectCard, TagList + EdgeCat, SectionDock, PageBackdrop
│       ├── content/            # resolved shape, snapshot/<locale>.json (saved API payload), useContent + ContentProvider
│       ├── sections/           # Hero, Statement, Experience, Projects, Skills, Tools, Closing (the contact screen), Archive
│       ├── assets/             # images bundled by Vite (the statement photo)
│       ├── animations/         # scroll / parallax hooks, the canvas scenes (black hole, ink stream, sky, bamboo, contact)
│       ├── i18n/               # UI string translations, formatMonth, formatFileSize
│       ├── admin/              # admin panel (Phase 5)
│       └── pages/
```

## Commands

```bash
# Frontend (run inside frontend/)
npm install
npm run dev          # http://localhost:5173 (also the "frontend" entry in .claude/launch.json)
npm run typecheck    # tsc -b
npm run lint         # oxlint
npm test             # vitest (jsdom + Testing Library)
npm run build        # typecheck + production build to dist/
npm run preview      # serve dist/ on http://localhost:4173 (the "frontend-preview" entry in .claude/launch.json; for Lighthouse runs against a production build)
npm run content:sync # save GET /content (both locales) as src/content/snapshot/*.json; default http://localhost:8000, or `-- <api origin>`
```
