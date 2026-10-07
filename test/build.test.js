const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    mapApiBeer,
    mapStoreSections,
    styleGroup,
    makeT,
    makeLocalize,
    validateBeers,
    extractSections,
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

test('validateBeers rejects empty lists and beers without name or ABV', () => {
    assert.doesNotThrow(() => validateBeers(list['Draft Beers'].map(mapApiBeer)));
    assert.throws(() => validateBeers([]), /non-empty array/);
    assert.throws(() => validateBeers([{ name: 'X', abv: null }]), /index 0/);
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
