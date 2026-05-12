# menu.beersheep.rs

## deployment

- For manual deploy trigger the workflow passing valid json with taps

## development

### prerequisites

- install [nvm](https://www.nvmnode.com/guide/installation.html)
- `nvm install && nvm use`

### build and debug

- `BEER_DATA='[{"tap_num":1,"name":"Hazy Sheep","style":"NE IPA","abv":5.5,"ibu":161,"rating":3.61391997337341,"description":"Super cool beer","image_url":"https://labels.untappd.com/4847776","price_big":600,"price_small":540,"brewery":"Beersheep Brew","country":"Serbia"},...]' npm run serve`
- visit `http://bs-local.com:8000/`
