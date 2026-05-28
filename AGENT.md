# AGENT.md

## Project overview

`menu.beersheep.rs` is a static site builder that generates a beer tap list for **Beersheep Garden**, a craft beer bar in Belgrade, Serbia. It renders beer data into a responsive HTML page and deploys to GitHub Pages.

## Architecture

```
BEER_DATA (env var / workflow input)
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

- **Build script** (`build.js`): Parses `BEER_DATA` JSON, renders EJS templates, copies static assets, minifies HTML in production.
- **Templates** (`src/`): `index.ejs` is the main page; partials live in `src/partials/` (head metadata, header, footer, beer snippet card, JSON-LD structured data, Google Analytics).
- **Styles** (`src/styles/`): `taps-styles.css` is the active stylesheet. `styles.css` exists as a fallback.
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

# Build and serve locally
BEER_DATA='[{...}]' npm run serve

# Build only
BEER_DATA='[{...}]' npm run build

# Clean dist
npm run clean
```

Local dev expects `http://bs-local.com:8000/` (add to `/etc/hosts` if needed).

## Beer data schema

Each beer object in the `BEER_DATA` JSON array:

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
  "price_big": 600,
  "price_small": 540,
  "brewery": "Brewery Name",
  "country": "Serbia"
}
```

- `image_name` takes precedence over `image_url` (resolved to `/img/<image_name>.webp`).
- `price_small` (0.33l) and `price_big` (0.5l) are in RSD.
- `tap_num` and `ibu` are optional.

## Deployment

Deployments are manual via GitHub Actions **workflow_dispatch**. The workflow:
1. Takes `BEER_DATA` as a JSON string input
2. Builds the site with `NODE_ENV=production`
3. Uploads `dist/` as a Pages artifact
4. Deploys to GitHub Pages

The workflow file is `.github/workflows/deploy.yml`.

## Code conventions

- Templates use EJS `<% ... %>` syntax. Partials are passed as pre-read strings in `build.js` for the main template, and included via `<%- include(...) %>` for nested templates.
- CSS is responsive with breakpoints at 769px, 768px, 480px, and 360px, plus print styles.
- The production build injects Google Analytics and minifies output; dev builds skip both.
- `dotenv` is loaded in non-production for local `.env` support.
