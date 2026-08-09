# AGENTS.md — menu.beersheep.rs

## Project overview

Static site builder for **Beersheep Garden** beer menu. Fetches beer data from the Cloudflare Worker API, renders it into a responsive HTML page via EJS templates, and deploys to GitHub Pages.

## Architecture

```
API_ORIGIN/list  ─── fetch beer data (sectioned JSON)
        │
        ▼
    build.js ─── mapApiBeer() → flat beer objects for templates
        │
        ▼
    build.js ─── EJS templates (src/index.ejs + src/partials/*)
        │
        ▼
    dist/index.html  ─── static assets (CSS, images, favicons)
        │
        ▼
    GitHub Pages (via workflow_dispatch in deploy.yml)
```

## Tech stack

- **Node.js 24** (`.nvmrc`)
- **EJS** templating
- **html-minifier-terser** for production HTML minification
- **GitHub Actions** deploys to GitHub Pages on `workflow_dispatch`
- **Google Analytics** (production only)
- **Font Awesome 7** for icons

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
  "untappd_url": "https://untappd.com/b/beer/123456"
}
```

## Image handling

- **HD labels** (`image_hd_url`): Displayed at 200px with `object-fit: contain` on a dark background. Container gets `.has-hd` class with larger dimensions at each responsive breakpoint. Border on the `<img>` element itself (hugs the label shape).
- **Preview fallback** (`image_url`): 100px container with `object-fit: cover`. Used when no HD label is available.
- **Placeholder**: Beer icon (`.placeholder`) when neither image source exists.
- **Untappd link**: Beer image wrapped in `<a href="untappd_url">` — clicking the label opens Untappd.

## Price rendering

- Prices sorted **small-to-large** by volume (`parseFloat` sort on keys).
- Entries with `price > 0` only — zero or null prices are filtered out.
- If no valid prices remain, shows "Please ask the bartender for price details".
- Old `price_small`/`price_big` fallback removed — all beers use the `prices` object.

## Deployment

Triggered by `workflow_dispatch` (usually from the scraper after `/feed`).

The deploy workflow (`deploy.yml`):
1. Fetches beer data from `API_ORIGIN/list`
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

## Conventions

- Templates use EJS `<% ... %>` syntax
- CSS is a single `styles.css` file with responsive breakpoints
- Production build injects Google Analytics and minifies output
- `dotenv` loaded in non-production for local `.env` support
