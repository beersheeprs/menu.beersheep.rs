# menu.beersheep.rs

## deployment

- update supabase tables (mostly it'll be `taps` or `prices`)
- trigger github actions via Actions — Deploy to GitHub pages — Run workflow
- wait for a few seconds
- check the website for changes

## development

### prerequisites

- install [nvm](https://www.nvmnode.com/guide/installation.html)
- `nvm install && nvm use`
- `npm install`

### build and debug

- Add keys for db to `.env`
- `npm run build`
