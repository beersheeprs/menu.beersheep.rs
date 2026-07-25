# AGENT.md

## Project overview

`menu.beersheep.rs` is a static site builder that generates a beer tap list for **Beersheep Garden**, a craft beer bar in Belgrade, Serbia. It renders beer data into a responsive HTML page and deploys to GitHub Pages.

## Architecture

```
BEER_DATA (env var, optional)
        │
        ▼
    build.js ─── API fetch (fallback, $API_ORIGIN/list)
        │
        ▼
    build.js ─── EJS templates (src/index.ejs + src/partials/*)
        │
        ▼
    dist/index.html  ─── static assets (CSS, images, favicons)
        │
        ▼
    GitHub Pages (via workflow_dispatch)
```

- **Build script** (`build.js`): Uses `BEER_DATA` JSON if provided, otherwise fetches from `$API_ORIGIN/list`. Maps API field names, renders EJS templates, copies static assets, minifies HTML in production.
- **Templates** (`src/`): `index.ejs` is the main page; partials live in `src/partials/` (head metadata, header, footer, beer snippet card, JSON-LD structured data, Google Analytics).
- **Styles** (`src/styles/`): `styles.css` is the single stylesheet.
- **Assets** (`src/assets/`): Favicons, app icons, and beer label images (`img/*.webp`).

## Tech stack

- **Node.js 24** (`.nvmrc`)
- **EJS** templating
- **html-minifier-terser** for production HTML minification
- **GitHub Actions** deploys to GitHub Pages on manual `workflow_dispatch`
- **Google Analytics** (gtag, production only)
- **Font Awesome 7** for icons

## Commands

```bash
# Install dependencies (first time)
nvm install && nvm use && npm ci

# Build and serve locally (BEER_DATA is optional, falls back to API)
BEER_DATA='[{...}]' npm run serve

# Or rely on API fetch (requires API_ORIGIN)
API_ORIGIN=<host> npm run serve

# Build only
npm run build

# Clean dist
npm run clean
```

Local dev expects `http://bs-local.com:8000/` (add to `/etc/hosts` if needed).

## Beer data schema

Each beer object in the `BEER_DATA` JSON array (or from the API after mapping):

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
  "image_name": "beer-slug",
  "prices": { "0.5": 600, "0.33": 540 },
  "brewery": "Brewery Name",
  "country": "Serbia"
}
```

- `prices` is an object mapping volume strings (in liters) to price in RSD. This is the preferred format.
- `price_small` and `price_big` are still supported for backward compatibility with older `BEER_DATA`.
- `image_name` takes precedence over `image_url` (resolved to `/img/<image_name>.webp`).
- `tap_num` and `ibu` are optional.

## Deployment

Deployments are manual via GitHub Actions **workflow_dispatch**. The workflow:
1. Optionally takes `BEER_DATA` as a JSON string input (falls back to API fetch)
2. Fetches beer data from the API if `BEER_DATA` is not provided
3. Builds the site with `NODE_ENV=production`
4. Uploads `dist/` as a Pages artifact
5. Deploys to GitHub Pages

`API_ORIGIN` is set via GitHub Actions variables (`${{ vars.API_ORIGIN }}`).

## Code conventions

- Templates use EJS `<% ... %>` syntax. Partials are passed as pre-read strings in `build.js` for the main template, and included via `<%- include(...) %>` for nested templates.
- CSS is responsive with breakpoints at 769px, 768px, 480px, and 360px, plus print styles.
- The production build injects Google Analytics and minifies output; dev builds skip both.
- `dotenv` is loaded in non-production for local `.env` support.
