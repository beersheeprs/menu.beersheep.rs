# AGENTS.md — menu.beersheep.rs

## Project overview

Static site builder for the **Beersheep Garden** beer and drinks menus and the **Beersheep Beer Store** menu (launched 2026-11-28). Fetches beer data from the Cloudflare Worker API, renders it into responsive HTML pages via EJS templates, and deploys to GitHub Pages.

## Architecture

```
API_ORIGIN/list  ─── fetch beer data (sectioned JSON)
        │
        ▼
    build.js ─── mapApiBeer() → flat beer objects for templates
        │            └─ src/ld-json.js → structured data (Schema.org)
        ▼
    EJS templates:
        src/index.ejs      → dist/index.html     (draft taps)
        src/bottles.ejs    → dist/bottles/index.html  (bottles & cans, URL /bottles/; dist/bottles.html redirects there)
        src/store.ejs      → dist/store/index.html    (Beer Store, URL /store/, from API_ORIGIN/store/list; in the sitemap while STORE_PUBLIC=true)
        src/drinks.ejs     → dist/drinks/index.html   (garden tea, coffee, soft drinks, spirits; from src/data/drinks.json, not the API)
        src/404.ejs        → dist/404.html        (custom error page, default locale only)
        src/beta.ejs       → dist/beta/index.html (design previews index; themes at /beta/<slug>/)
        (index/bottles/store/drinks rendered once per locale: en → dist/, sr → dist/sr/)
        src/partials/*     (shared snippets, head, nav, footer…)
        │
        ├─ dist/           (static assets: CSS, images, favicons)
        └─ dist/api/v1/    (taps.json, fridge.json, store.json — mapped beer data, volumes in ml;
                            meta.json — per file: last feed time from the Worker's Last-Modified + beer count)
        │
        ▼
    GitHub Pages (via workflow_dispatch in deploy.yml)
```

## Tech stack

- **Node.js 24** (`.nvmrc`)
- **EJS** templating
- **html-minifier-terser** for production HTML minification
- **GitHub Actions** deploys to GitHub Pages on `workflow_dispatch`
- **Google Analytics + Cloudflare Web Analytics** (production only, `src/partials/gtag.ejs` and `cftag.ejs`)
- **Font Awesome 7** icons, inlined at build time as an SVG sprite (`src/icons.js`, from the `@fortawesome/*-svg-icons` packages; templates call `icon(name)`)
- **`src/ld-json.js`** generates Schema.org `BarOrPub` + `Menu` structured data for the garden pages, and `LiquorStore` + `OfferCatalog` (no opening hours) for the store page (the drinks page: `BarOrPub` + a drinks `Menu`)

## Beer data schema (mapped from API)

```json
{
  "tap_num": 1,
  "name": "Beer Name",
  "style": "IPA",
  "abv": 5.5,
  "ibu": 161,
  "rating": 3.61,
  "description": "Tasting notes...",
  "image_url": "https://labels.untappd.com/...",
  "image_hd_url": "https://assets.untappd.com/site/beer_logos_hd/...",
  "prices": [{ "volume_ml": 330, "price": 540 }, { "volume_ml": 500, "price": 600 }],
  "brewery": "Brewery Name",
  "country": "Serbia",
  "serving_style": "draft",
  "on_tap": false,
  "untappd_url": "https://untappd.com/b/beer/123456"
}
```

`serving_style`: `"draft"` | `"can"` | `"bottle"` — drives the icon in `snippet.ejs`.  
`on_tap`: when `true` on a bottles/cans entry, renders an "also on tap" badge ("also on tap in Garden" on the store page).  
`prices`: the API's `{ "0.33L": 540 }` is mapped in `mapApiBeer()` to `[{ volume_ml, price }]` (milliliters via `parseVolumeMl()`; accepts `L`/`cl`/`ml`, `,` or `.`; unreadable volumes are dropped with a warning). Templates render `volume_ml / 1000` + `L`.  
`sizes` (store only): `[{ volume_ml, style }]` (API: `[{ size: "0.5L", style }]`) — the store lists volumes, not prices; each volume keeps its own container icon.  
`style_group` (store only): filter-chip group from the style prefix (`STYLE_GROUPS` in `build.js`).  
`abv`: may be null — Untappd menus print "N/A ABV" for both 0% and unknown ABV, so the two can't be told apart. A missing ABV on a `Non-Alcoholic` style shows a "Non-alcoholic" badge (never a made-up 0.0%); any other style shows no ABV badge.  

## Image handling

Priority order in `src/partials/snippet.ejs`:
1. **HD label** (`image_hd_url`): Untappd HD image. Container gets `.has-hd` class (200px, `object-fit: contain`).
2. **Preview fallback** (`image_url`): Untappd preview. 100px container, `object-fit: cover`.

**Thumbnails** (`src/thumbnails.js`): the build downloads the label used by 1/2, shrinks it to a 400px WebP (sharp, q75) and serves it as `/thumbs/<sha1-of-url>.webp` (`image_thumb`). A label that fails to download keeps its remote URL; the build never fails on images. Thumbnails are cached in `.cache/thumbnails/` (gitignored), kept between CI runs by `actions/cache` in `deploy.yml`, so only new labels are fetched; cached files unused for 30 days are pruned.
3. **Placeholder**: Beer icon (`.placeholder`) when no image source exists.

**Untappd link**: The image (any source) is wrapped in `<a href="untappd_url">` when the URL is present.

## Price rendering

- Prices sorted **small-to-large** by `volume_ml`, and only entries with `price > 0` — both done in `mapPrices()` (`build.js`), so the templates, JSON-LD and the `dist/api/v1/` mirror all get the same list.
- If no valid prices remain, shows "Please ask the bartender for price details" — except on the store page, which shows the volumes (`sizes`) instead.
- The drinks page has its own price list (`src/partials/drinks-list.ejs`), see below.
- Old `price_small`/`price_big` fallback removed — all beers use `prices`.

## Beer Store page (`store.ejs`)

- **Data:** `build.js` fetches `API_ORIGIN/store/list` (`[{ section, beers }]`, sections are countries in Untappd order). It's fetched from the API even when `BEER_DATA` is given; only `STORE_DATA` (same JSON, used by CI) replaces it.
- **Isolated:** any store fetch or render failure logs a warning and skips the store page; the garden pages still build and deploy. Store rows are validated leniently (no name → skipped; no ABV → no badge).
- **Public:** `/store/` is always a real page, indexable like the other pages of its locale. `STORE_PUBLIC` (repo variable, passed by `deploy.yml`) only controls the sitemap: `STORE_PUBLIC=true` (set since the 2026-11-28 launch) adds the store URL to `dist/sitemap.xml` at build; unset or anything else leaves it out. It applies at build time, so a change needs a deploy. The garden footers link to the store whenever its page is built.
- **No tabs between venues:** the store is a separate venue, so its page has no On Tap / Bottles & Cans tabs and the garden nav has no store tab. The venues link to each other in the footer only.
- **Design:** country sections with the jump-to-section nav; search (name/brewery/style, accent-insensitive) and style-group chips, both client-side, shown by the inline script (without JS everything is listed); footer and ld-json use the store's venue (`VENUES` in `build.js`: name + address key).
- "Beer Store" is a name — never translated in any locale.

## Drinks page (`drinks.ejs`)

- **Data:** `src/data/drinks.json`, edited by hand from the printed garden "Piće menu" (no API, no images). `mapDrinkSections()` in `build.js` maps it per locale.
- **Shape:** `sections: [{ id, serving?, items?, groups? }]`. `serving` (`"5cl"`, `"2.5cl"`) prints a "5 cl serving" line under the section title; `groups` (`[{ id, items }]`, used for the whisky regions) render as sub-headings. Items are `{ name, note?, prices: [{ volume?, price }] }`; `volume` (`"0.25L"`) is a bottle size, a price without one is per serving. Prices in RSD, sorted small-to-large by volume, `price > 0` only.
- **Titles:** section and group titles come from i18n (`drinks.sections.<id>`, `drinks.groups.<id>`), so a new section or group needs a key in every locale. The Serbian whisky groups are copied verbatim from the printed menu (Latin script).
- **Localized items:** `name_<code>` / `note_<code>` override the English. A present `note_<code>` wins even when empty: `note_sr: ""` hides the note on `/sr/` (the rakija notes only repeat the fruit already in the name).
- **Structured data:** `ld-json.js` (`pageType` `'drinks'`) adds the garden `BarOrPub` with a drinks `Menu`: one `MenuSection` per section, whisky groups as nested `MenuSection`s. A price with a `volume` or a section `serving` is a `UnitPriceSpecification` for that quantity (liters); tea and coffee get a plain `price`. Item `@id`s are `#drinks-<section>-<n>` (positions, since `/sr/` names can be Cyrillic).
- **Isolated:** an unreadable/invalid `drinks.json` or a render failure logs `Drinks: …` and skips the page (and its nav tab); the other pages still build. CI fails on any `Drinks:` warning and checks `drinks/index.html` + `sr/drinks/index.html`.
- **Public:** indexable like the other pages of its locale, listed in `src/assets/sitemap.xml`. The garden nav shows a third tab (`nav.drinks`) whenever the page is built (`hasDrinks`); store and beta pages have no drinks tab, and beta themes don't render the drinks page.

## Beta design previews (`/beta/`)

- `BETA_THEMES` in `build.js` lists the themes; each renders the English On Tap / Bottles & Cans / Store pages into `dist/beta/<slug>/` from the same data, with `src/styles/beta/<slug>.css` (overrides loaded after `styles.css`) and its Google Fonts (added in `head.ejs` when `theme` is set).
- `src/beta.ejs` → `dist/beta/index.html` links them all.
- Never indexed: `noindex, nofollow` on every beta page, `Disallow: /beta/` in `robots.txt`, no sitemap entries, no links from public pages.
- Templates get `theme` (`null` outside beta).
- `fonts: null` skips Google Fonts. Beta themes get no light/dark switcher: they build on the dark colours.

## Deployment

Triggered by `workflow_dispatch` (usually from the scraper after `/feed`).

The deploy workflow (`deploy.yml`):
1. Accepts optional `BEER_DATA` JSON input; falls back to fetching `API_ORIGIN/list` (repository variable) when not provided
2. Builds with `NODE_ENV=production`
3. Deploys to GitHub Pages
4. Sends Telegram notification (suppressed when `inputs.notify: false` — silent deploys from silent scrapes)

## CI

`ci.yml` runs on every pull request and push to `main`: `npm test`, then a production build from `test/fixtures/list.json` (`BEER_DATA`) and `test/fixtures/store.json` (`STORE_DATA`), failing if the store or drinks page is skipped or any page is missing. The drinks page is built from the real `src/data/drinks.json` (no fixture). The fixtures are trimmed real API rows covering the template branches (on-tap badge, missing prices, non-alcoholic without ABV, several sizes, a nameless store row); keep them in sync when the API shape changes.

## Commands

```bash
npm test         # Unit tests (node:test, test/*.test.js)
npm run build    # Build dist/
npm run serve    # Build + serve at localhost:8000
npm run clean    # Remove dist/
```

Local dev: `API_ORIGIN=https://beersheep.whyshouldi.workers.dev npm run serve`  
Offline: `BEER_DATA="$(cat test/fixtures/list.json)" STORE_DATA="$(cat test/fixtures/store.json)" npm run serve`

## i18n

- UI strings live in `src/i18n/<code>.json` (`en`, `sr` = Serbian Cyrillic). Locales are listed in `LOCALES` in `build.js`; the default (`en`) renders to `dist/`, others to `dist/<prefix>/`.
- Templates get `t(key, vars)` (dot-path lookup, `{var}` interpolation, falls back to `en` then to the key), plus `lang`, `base` (`''` or `/sr`), `pagePath` and `locales`.
- Internal links must use `<%= base %>/…`; asset links must be absolute (`/styles.css`) so they resolve under `/sr/`.
- `head.ejs` emits `hreflang` alternates + `x-default` for public locales; `nav.ejs` renders the EN / СР switcher (hidden via `.lang-switch { display: none }`); `ld-json.js` takes `(data, pageType, t, base, localize)`.
- `public: false` on a locale (currently `sr`) renders its pages with `noindex` and leaves them out of `hreflang`; they are also kept out of `sitemap.xml`. To launch: set `public: true`, add the URLs to the sitemap, and show the switcher.
- Beer names, styles and section names from the API are **not** translated.
- Beer descriptions use `description_<code>` from the API (e.g. `description_sr`, maintained manually in D1) via `localize.description()`, falling back to English; country names via the `countries` map in the locale file.
- Adding a language: create `src/i18n/<code>.json` and add it to `LOCALES` (start with `public: false`).

## Light / dark

- Colours are CSS variables (`--c-*`) at the top of `styles.css`: `:root` is the original dark palette, `:root[data-theme="light"]` the light one. Use the variables for any new colour (print styles keep fixed colours).
- `COLOR_SCHEME` in `build.js`: `default` (`'light'` | `'dark'` | `'system'`) is what a first visit gets; `light`/`dark` are the `theme-color` of each.
- `head.ejs` sets `data-theme` on `<html>` before first paint (saved choice in `localStorage` `color-scheme` → default → device setting for `'system'`); the round button in `header.ejs` (sun/moon line icons, label `nav.darkMode`) switches and saves it.

## CSS breakpoints

- Desktop: default
- 769px: larger images (120px), HD gets 200px
- 768px: 100px images, HD gets 170px
- 480px: compact layout (garden tabs tighten so the three stay on one line; drinks list goes to one column)
- 360px: minimum width
- Print: small images, no backgrounds

## Partials

| File | Purpose |
|---|---|
| `head.ejs` | `<meta>` tags, OG/Twitter cards, favicons, canonical URL |
| `header.ejs` | `<h1>` + page nav + light/dark switcher |
| `nav.ejs` | "On Tap" / "Bottles & Cans" / "Drinks" tab links on the garden pages (Drinks when `hasDrinks`); the store page has no tabs |
| `section-nav.ejs` | Jump-to-section links (bottles, store and drinks pages; label is `section.title` when set, else `section.name`; anchors always from `section.name`) |
| `drinks-list.ejs` | Text-only drinks price list (name, note, prices) used by `drinks.ejs` |
| `snippet.ejs` | Single beer card (image, name, style, ABV, prices, rating) |
| `ld-json.ejs` | Inlines the `<script type="application/ld+json">` block |
| `scroll-top.ejs` | Fixed scroll-to-top button + CSS scroll-progress ring |
| `footer.ejs` | Venue name, address and Instagram from `venue` (garden: @beersheepgarden, store: @beersheep_), "Also visit" link to `otherVenue` (store → garden; garden → store whenever the store page is built), Telegram/Facebook links (rendered via `include()`, so `t()` works) |
| `gtag.ejs` | Google Analytics snippet (injected only in production) |
| `cftag.ejs` | Cloudflare Web Analytics beacon (injected only in production) |

## Conventions

- Templates use EJS `<% ... %>` syntax; partials shared via `include()` with `filename` set so EJS resolves relative paths
- CSS is a single `src/styles/styles.css` file, copied to `dist/` at build time
- Production build injects analytics tags and minifies HTML (with `html-minifier-terser`)
- Local `.env` is loaded in non-production with Node's built-in `process.loadEnvFile()` (shell variables win)
