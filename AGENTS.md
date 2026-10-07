# AGENTS.md — menu.beersheep.rs

## Project overview

Static site builder for the **Beersheep Garden** beer menu and the (unreleased) **Beersheep Beer Store** menu. Fetches beer data from the Cloudflare Worker API, renders it into responsive HTML pages via EJS templates, and deploys to GitHub Pages.

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
        src/store.ejs      → dist/store/index.html    (Beer Store, URL /store/, from API_ORIGIN/store/list; unlinked until STORE_PUBLIC)
        src/404.ejs        → dist/404.html        (custom error page, default locale only)
        (index/bottles rendered once per locale: en → dist/, sr → dist/sr/)
        src/partials/*     (shared snippets, head, nav, footer…)
        │
        ├─ dist/           (static assets: CSS, images, favicons)
        └─ dist/api/v1/    (taps.json, fridge.json, store.json — JSON mirror of beer data)
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
- **`src/ld-json.js`** generates Schema.org `BarOrPub` + `Menu` structured data for the garden pages, and `LiquorStore` + `OfferCatalog` (no opening hours) for the store page

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
  "image_name": "beer-slug",
  "prices": { "0.33L": 540, "0.5L": 600 },
  "brewery": "Brewery Name",
  "country": "Serbia",
  "serving_style": "draft",
  "on_tap": false,
  "untappd_url": "https://untappd.com/b/beer/123456"
}
```

`serving_style`: `"draft"` | `"can"` | `"bottle"` — drives the icon in `snippet.ejs`.  
`on_tap`: when `true` on a bottles/cans entry, renders an "also on tap" badge ("also on tap in Garden" on the store page).  
`sizes` (store only): `[{ size, style }]` — the store lists volumes, not prices; each volume keeps its own container icon.  
`style_group` (store only): filter-chip group from the style prefix (`STYLE_GROUPS` in `build.js`).  
`abv`: may be null — Untappd menus print "N/A ABV" for both 0% and unknown ABV, so the two can't be told apart. A missing ABV on a `Non-Alcoholic` style shows a "Non-alcoholic" badge (never a made-up 0.0%); any other style shows no ABV badge.  
`image_name`: slug for a locally hosted `.webp` in `dist/img/`. **Note:** `mapApiBeer()` in `build.js` does not currently map this field from the API response, so local images are only served if the beer data is injected via `BEER_DATA` with `image_name` already set.

## Image handling

Priority order in `src/partials/snippet.ejs`:
1. **Local webp** (`image_name`): `<img src="/img/<image_name>.webp">` — static files in `src/assets/img/`, copied to `dist/img/` at build time.
2. **HD label** (`image_hd_url`): Untappd HD image. Container gets `.has-hd` class (200px, `object-fit: contain`).
3. **Preview fallback** (`image_url`): Untappd preview. 100px container, `object-fit: cover`.

**Thumbnails** (`src/thumbnails.js`): the build downloads the label used by 2/3, shrinks it to a 400px WebP (sharp, q75) and serves it as `/thumbs/<sha1-of-url>.webp` (`image_thumb`). A label that fails to download keeps its remote URL; the build never fails on images. Thumbnails are cached in `.cache/thumbnails/` (gitignored), kept between CI runs by `actions/cache` in `deploy.yml`, so only new labels are fetched; cached files unused for 30 days are pruned.
4. **Placeholder**: Beer icon (`.placeholder`) when no image source exists.

**Untappd link**: The image (any source) is wrapped in `<a href="untappd_url">` when the URL is present.

## Price rendering

- Prices sorted **small-to-large** by volume (`parseFloat` sort on keys).
- Entries with `price > 0` only — zero or null prices are filtered out.
- If no valid prices remain, shows "Please ask the bartender for price details" — except on the store page, which shows the volumes (`sizes`) instead.
- Old `price_small`/`price_big` fallback removed — all beers use the `prices` object.

## Beer Store page (`store.ejs`)

- **Data:** `build.js` fetches `API_ORIGIN/store/list` (`[{ section, beers }]`, sections are countries in Untappd order). It's always fetched from the API, even when `BEER_DATA` is given.
- **Isolated:** any store fetch or render failure logs a warning and skips the store page; the garden pages still build and deploy. Store rows are validated leniently (no name → skipped; no ABV → no badge).
- **Hidden release:** `/store/` is always a real page, indexable like the other pages of its locale. `STORE_PUBLIC` (repo variable, passed by `deploy.yml`, default false) only controls what points to it: while false, no nav tab on the garden pages and no sitemap entry. `STORE_PUBLIC=true` adds the nav tab and the sitemap URL (written into `dist/sitemap.xml` at build).
- **No garden tabs:** the store is a separate venue, so its page has no On Tap / Bottles & Cans tabs. The garden pages link to it only once `STORE_PUBLIC` is true.
- **Design:** country sections with the jump-to-section nav; search (name/brewery/style, accent-insensitive) and style-group chips, both client-side, shown by the inline script (without JS everything is listed); footer and ld-json use the store's venue (`VENUES` in `build.js`: name + address key).
- "Beer Store" is a name — never translated in any locale.

## Deployment

Triggered by `workflow_dispatch` (usually from the scraper after `/feed`).

The deploy workflow (`deploy.yml`):
1. Accepts optional `BEER_DATA` JSON input; falls back to fetching `API_ORIGIN/list` (repository variable) when not provided
2. Builds with `NODE_ENV=production`
3. Deploys to GitHub Pages
4. Sends Telegram notification (suppressed when `inputs.notify: false` — silent deploys from silent scrapes)

## Commands

```bash
npm run build    # Build dist/
npm run serve    # Build + serve at localhost:8000
npm run clean    # Remove dist/
```

Local dev: `API_ORIGIN=https://beersheep.whyshouldi.workers.dev npm run serve`

## i18n

- UI strings live in `src/i18n/<code>.json` (`en`, `sr` = Serbian Cyrillic). Locales are listed in `LOCALES` in `build.js`; the default (`en`) renders to `dist/`, others to `dist/<prefix>/`.
- Templates get `t(key, vars)` (dot-path lookup, `{var}` interpolation, falls back to `en` then to the key), plus `lang`, `base` (`''` or `/sr`), `pagePath` and `locales`.
- Internal links must use `<%= base %>/…`; asset links must be absolute (`/styles.css`) so they resolve under `/sr/`.
- `head.ejs` emits `hreflang` alternates + `x-default` for public locales; `nav.ejs` renders the EN / СР switcher (hidden via `.lang-switch { display: none }`); `ld-json.js` takes `(data, pageType, t, base, localize)`.
- `public: false` on a locale (currently `sr`) renders its pages with `noindex` and leaves them out of `hreflang`; they are also kept out of `sitemap.xml`. To launch: set `public: true`, add the URLs to the sitemap, and show the switcher.
- Beer names, styles and section names from the API are **not** translated.
- Beer descriptions use `description_<code>` from the API (e.g. `description_sr`, maintained manually in D1) via `localize.description()`, falling back to English; country names via the `countries` map in the locale file.
- Adding a language: create `src/i18n/<code>.json` and add it to `LOCALES` (start with `public: false`).

## CSS breakpoints

- Desktop: default
- 769px: larger images (120px), HD gets 200px
- 768px: 100px images, HD gets 170px
- 480px: compact layout
- 360px: minimum width
- Print: small images, no backgrounds

## Partials

| File | Purpose |
|---|---|
| `head.ejs` | `<meta>` tags, OG/Twitter cards, favicons, canonical URL |
| `header.ejs` | `<h1>` + page nav |
| `nav.ejs` | "On Tap" / "Bottles & Cans" tab links on the garden pages (+ "Beer Store" when `STORE_PUBLIC`); the store page has no tabs |
| `section-nav.ejs` | Jump-to-section links (bottles and store pages) |
| `snippet.ejs` | Single beer card (image, name, style, ABV, prices, rating) |
| `ld-json.ejs` | Inlines the `<script type="application/ld+json">` block |
| `scroll-top.ejs` | Fixed scroll-to-top button + CSS scroll-progress ring |
| `footer.ejs` | Venue name, address and Instagram from `venue` (garden: @beersheepgarden, store: @beersheep_), Telegram/Facebook links (rendered via `include()`, so `t()` works) |
| `gtag.ejs` | Google Analytics snippet (injected only in production) |
| `cftag.ejs` | Cloudflare Web Analytics beacon (injected only in production) |

## Conventions

- Templates use EJS `<% ... %>` syntax; partials shared via `include()` with `filename` set so EJS resolves relative paths
- CSS is a single `src/styles/styles.css` file, copied to `dist/` at build time
- Production build injects analytics tags and minifies HTML (with `html-minifier-terser`)
- `dotenv` loaded in non-production for local `.env` support
