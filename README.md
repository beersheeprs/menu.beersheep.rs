# menu.beersheep.rs

## deployment

- For manual deploy trigger the workflow. Optionally pass `BEER_DATA` as a JSON override, otherwise beer data is fetched from the API (`$API_ORIGIN/list`).

## development

### prerequisites

- install [nvm](https://www.nvmnode.com/guide/installation.html)
- `nvm install && nvm use`

### build and debug

- `BEER_DATA='{"Draft Beers":[{"tap_number":1,"beer_name":"Albino","abv":6.5,...}]}' npm run serve` (optional, overrides API)
- `API_ORIGIN=<host> npm run serve` (uses API)
- visit `http://bs-local.com:8000/`
