# AGENTS.md — menu.beersheep.rs

## Project overview

Static site builder for **Beersheep Garden** beer menu. Fetches beer data from the Cloudflare Worker API, renders it into responsive HTML pages via EJS templates, and deploys to GitHub Pages.

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
        src/bottles.ejs    → dist/bottles.html   (bottles & cans)
        src/404.ejs        → dist/404.html        (custom error page)
        src/partials/*     (shared snippets, head, nav, footer…)
        │
        ├─ dist/           (static assets: CSS, images, favicons)
        └─ dist/api/v1/    (taps.json, fridge.json — JSON mirror of beer data)
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
- **Font Awesome 7** for icons
- **`src/ld-json.js`** generates Schema.org `BarOrPub` + `Menu` structured data for both pages

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
`on_tap`: when `true` on a bottles/cans entry, renders an "also on tap" badge.  
`image_name`: slug for a locally hosted `.webp` in `dist/img/`. **Note:** `mapApiBeer()` in `build.js` does not currently map this field from the API response, so local images are only served if the beer data is injected via `BEER_DATA` with `image_name` already set.

## Image handling

Priority order in `src/partials/snippet.ejs`:
1. **Local webp** (`image_name`): `<img src="/img/<image_name>.webp">` — static files in `src/assets/img/`, copied to `dist/img/` at build time.
2. **HD label** (`image_hd_url`): Remote Untappd HD image. Container gets `.has-hd` class (200px, `object-fit: contain`).
3. **Preview fallback** (`image_url`): Remote Untappd preview. 100px container, `object-fit: cover`.
4. **Placeholder**: Beer icon (`.placeholder`) when no image source exists.

**Untappd link**: The image (any source) is wrapped in `<a href="untappd_url">` when the URL is present.

## Price rendering

- Prices sorted **small-to-large** by volume (`parseFloat` sort on keys).
- Entries with `price > 0` only — zero or null prices are filtered out.
- If no valid prices remain, shows "Please ask the bartender for price details".
- Old `price_small`/`price_big` fallback removed — all beers use the `prices` object.

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
| `nav.ejs` | "On Tap" / "Bottles & Cans" tab links |
| `section-nav.ejs` | Jump-to-section links (bottles page only) |
| `snippet.ejs` | Single beer card (image, name, style, ABV, prices, rating) |
| `ld-json.ejs` | Inlines the `<script type="application/ld+json">` block |
| `scroll-top.ejs` | Fixed scroll-to-top button + CSS scroll-progress ring |
| `footer.ejs` | Address, social links |
| `gtag.ejs` | Google Analytics snippet (injected only in production) |
| `cftag.ejs` | Cloudflare Web Analytics beacon (injected only in production) |

## Conventions

- Templates use EJS `<% ... %>` syntax; partials shared via `include()` with `filename` set so EJS resolves relative paths
- CSS is a single `src/styles/styles.css` file, copied to `dist/` at build time
- Production build injects analytics tags and minifies HTML (with `html-minifier-terser`)
- `dotenv` loaded in non-production for local `.env` support
