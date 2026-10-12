const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    mapApiBeer,
    isNonAlcoholic,
    mapStoreSections,
    styleGroup,
    makeT,
    makeLocalize,
    validateBeers,
    extractSections,
    BETA_THEMES,
} = require('../build');
const list = require('./fixtures/list.json');
const store = require('./fixtures/store.json');

test('mapApiBeer maps API fields to template fields', () => {
    const beer = mapApiBeer(list['Draft Beers'][0]);
    const api = list['Draft Beers'][0];
    assert.equal(beer.tap_num, api.tap_number);
    assert.equal(beer.name, api.beer_name);
    assert.equal(beer.style, api.beer_style);
    assert.equal(beer.rating, api.beer_rating);
    assert.equal(beer.image_url, api.beer_image);
    assert.deepEqual(beer.prices, api.prices);
});

test('styleGroup groups styles by prefix', () => {
    assert.equal(styleGroup('IPA - New England / Hazy'), 'ipa');
    assert.equal(styleGroup('Pale Ale - American'), 'paleAle');
    assert.equal(styleGroup('Lambic - Kriek'), 'sour');
    assert.equal(styleGroup('Porter - Baltic'), 'stout');
    assert.equal(styleGroup('Pilsner - Czech / Bohemian'), 'lager');
    assert.equal(styleGroup('Hard Seltzer'), 'cider');
    assert.equal(styleGroup('Non-Alcoholic - Fruit Beer'), 'nonAlcoholic');
    assert.equal(styleGroup('Wheat Beer - Hefeweizen'), 'other');
    assert.equal(styleGroup(undefined), 'other');
});

test('extractSections skips draft beers and empty sections', () => {
    const sections = extractSections(list);
    const names = sections.map((s) => s.name);
    assert.ok(!names.includes('Draft Beers'));
    assert.ok(!names.includes('Empty Section'));
    assert.ok(sections.length > 0);
    assert.ok(sections.every((s) => s.beers.length > 0 && s.beers[0].name));
});

test('validateBeers rejects empty lists, nameless beers and non-numeric ABV', () => {
    assert.doesNotThrow(() => validateBeers(list['Draft Beers'].map(mapApiBeer)));
    assert.doesNotThrow(() => validateBeers([{ name: 'Kriek 0,0%', abv: null }]));
    assert.throws(() => validateBeers([]), /non-empty array/);
    assert.throws(() => validateBeers([{ name: 'X', abv: '5%' }]), /index 0/);
    assert.throws(() => validateBeers([{ abv: 5 }]), /index 0/);
});

test('mapStoreSections skips nameless beers and empty sections, adds style groups', () => {
    const sections = mapStoreSections(store);
    assert.ok(sections.every((s) => s.beers.length > 0));
    assert.ok(!sections.some((s) => s.name === 'Empty'));
    const beers = sections.flatMap((s) => s.beers);
    assert.ok(beers.every((b) => b.name && b.style_group));
    const input = store.flatMap((s) => s.beers).filter((b) => b.beer_name).length;
    assert.equal(beers.length, input);
});

test('mapStoreSections rejects a non-array payload', () => {
    assert.throws(() => mapStoreSections({}), /not an array/);
});

test('t() interpolates and falls back to English, then to the key', () => {
    const en = makeT('en');
    const sr = makeT('sr');
    assert.equal(en('snippet.rating', { value: '3.50' }), 'Rating: 3.50 out of 5');
    assert.equal(sr('snippet.rating', { value: '3.50' }), 'Оцена: 3.50 од 5');
    assert.equal(en('snippet.rating'), 'Rating: {value} out of 5');
    assert.equal(sr('no.such.key'), 'no.such.key');
});

test('localize translates countries and falls back to the English description', () => {
    const sr = makeLocalize('sr');
    const en = makeLocalize('en');
    assert.equal(sr.country('Austria'), 'Аустрија');
    assert.equal(sr.country('Atlantis'), 'Atlantis');
    assert.equal(sr.description({ description: 'Hoppy', description_sr: 'Хмељно' }), 'Хмељно');
    assert.equal(sr.description({ description: 'Hoppy', description_sr: '  ' }), 'Hoppy');
    assert.equal(en.description({ description: 'Hoppy', description_sr: 'Хмељно' }), 'Hoppy');
});

test('every beta theme has its stylesheet', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    for (const theme of BETA_THEMES) {
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'src/styles/beta', `${theme.slug}.css`)), theme.slug);
    }
});

// A 0.0% / "N/A ABV" beer arrives from /list with abv: null (Kriek 0,0%, deploy run 38318137520)
const nullAbvBeer = mapApiBeer({
    ...list['Draft Beers'][0],
    tap_number: null,
    beer_name: 'Kriek 0,0%',
    beer_style: 'Lambic - Kriek',
    abv: null,
    ibu: null,
    serving_style: 'bottle',
});

test('JSON-LD omits the ABV property for a beer without ABV', () => {
    const ldJson = require('../src/ld-json');
    const bottles = [{ name: 'Belgian Beers', beers: [nullAbvBeer] }];
    const out = JSON.stringify(ldJson(bottles, 'bottles', makeT('en'), '', makeLocalize('en')));
    assert.ok(out.includes('Kriek 0,0%'));
    assert.ok(!out.includes('null%'), out);
    assert.ok(!out.includes('"name":"ABV"'), out);
});

function renderCard(item) {
    const ejs = require('ejs');
    const path = require('node:path');
    const { icon } = require('../src/icons');
    return ejs.render(
        `<%- include('partials/snippet', { item }) %>`,
        { item, pageType: 'bottles', icon, t: makeT('en'), localize: makeLocalize('en') },
        { filename: path.join(__dirname, '..', 'src', 'index.ejs') }
    );
}

test('beer card without ABV shows the non-alcoholic badge only for a 0.0% name', () => {
    const html = renderCard(nullAbvBeer);
    assert.ok(html.includes('Kriek 0,0%'));
    assert.match(html, /abv-badge">Non-alcoholic</);
    assert.ok(!html.includes('null'), html);

    const unknown = renderCard({ ...nullAbvBeer, name: 'Kriek', non_alcoholic: false });
    assert.ok(!unknown.includes('abv-badge'), unknown);
});

test('isNonAlcoholic: only an explicit zero, and only when the ABV is unknown', () => {
    const na = (name, extra = {}) => isNonAlcoholic({ name, style: 'Lambic - Kriek', abv: null, ...extra });
    // alcohol-free
    for (const name of ['Kriek 0,0%', 'Pecheresse 0,0%', 'La Chouffe 0.0%', 'Free 0.00%', 'Zero 0,0 %']) {
        assert.equal(na(name), true, name);
    }
    assert.equal(na('Clausthaler', { style: 'Non-Alcoholic Beer - Pale Lager' }), true);
    // not certainly alcohol-free: no badge
    for (const name of [
        'Kriek', 'Lady Cupcake #10', '10.0%', 'Imperial 10,0%', 'Strong 20.0%',
        'Light 0.5%', 'Light 0,5%', 'Almost 0.05%', 'Weird 1.0.0%', 'Zero 0%', 'Heineken 0.0',
    ]) {
        assert.equal(na(name), false, name);
    }
    // a known ABV always wins
    assert.equal(na('Kriek 0,0%', { abv: 3.5 }), false);
    assert.equal(na('Kriek 0,0%', { abv: 0 }), false);
    assert.equal(na('Clausthaler', { style: 'Non-Alcoholic Beer - Pale Lager', abv: 0.4 }), false);
});
