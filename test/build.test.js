const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    mapApiBeer,
    parseVolumeMl,
    isNonAlcoholic,
    mapStoreSections,
    styleGroup,
    makeT,
    makeLocalize,
    validateBeers,
    extractSections,
    BETA_THEMES,
    lastModifiedIso,
    buildMeta,
    mapDrinkSections,
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
    assert.deepEqual(beer.prices, [
        { volume_ml: 330, price: 470 },
        { volume_ml: 500, price: 550 },
    ]);
});

test('parseVolumeMl reads liter and milliliter labels', () => {
    assert.equal(parseVolumeMl('0.33L'), 330);
    assert.equal(parseVolumeMl('0,5 l'), 500);
    assert.equal(parseVolumeMl('1L'), 1000);
    assert.equal(parseVolumeMl('330ml'), 330);
    assert.equal(parseVolumeMl('33cl'), 330);
    assert.equal(parseVolumeMl('0.5'), 500);
    assert.equal(parseVolumeMl('750'), 750);
    assert.equal(parseVolumeMl('big'), null);
    assert.equal(parseVolumeMl(null), null);
});

test('mapApiBeer drops unpriced and unreadable volumes, maps store sizes', () => {
    const beer = mapApiBeer({ beer_name: 'X', prices: { '0.5L': 600, '0.3L': 0, '?': 500 }, sizes: [{ size: '0.33L', style: 'bottle' }] });
    assert.deepEqual(beer.prices, [{ volume_ml: 500, price: 600 }]);
    assert.deepEqual(beer.sizes, [{ volume_ml: 330, style: 'bottle' }]);
    assert.deepEqual(mapApiBeer({ beer_name: 'Y', prices: null }).prices, []);
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

test('lastModifiedIso reads the Worker header as ISO, null when missing or unreadable', () => {
    const res = (h) => new Response('{}', { headers: h ? { 'Last-Modified': h } : {} });
    assert.equal(lastModifiedIso(res('Fri, 27 Nov 2026 00:15:06 GMT')), '2026-11-27T00:15:06.000Z');
    assert.equal(lastModifiedIso(res(null)), null);
    assert.equal(lastModifiedIso(res('not a date')), null);
});

test('buildMeta: per-file update time and beer count; taps and fridge share the garden feed', () => {
    const taps = list['Draft Beers'].map(mapApiBeer);
    const fridgeSections = extractSections(list);
    const storeSections = mapStoreSections(store);
    const beers = (sections) => sections.reduce((n, s) => n + s.beers.length, 0);
    const meta = buildMeta({
        generatedAt: new Date('2026-11-27T00:15:06.076Z'),
        taps,
        fridgeSections,
        storeSections,
        gardenUpdatedAt: '2026-11-27T00:14:50.000Z',
        storeUpdatedAt: '2026-11-26T18:00:00.000Z',
    });
    assert.deepEqual(meta, {
        generated_at: '2026-11-27T00:15:06.076Z',
        taps: { updated_at: '2026-11-27T00:14:50.000Z', count: taps.length },
        fridge: { updated_at: '2026-11-27T00:14:50.000Z', count: beers(fridgeSections) },
        store: { updated_at: '2026-11-26T18:00:00.000Z', count: beers(storeSections) },
    });
    assert.ok(meta.taps.count > 0 && meta.fridge.count > 0 && meta.store.count > 0);

    // the store page was skipped; the times are unknown (BEER_DATA build, older Worker)
    const partial = buildMeta({
        generatedAt: new Date('2026-11-27T00:15:06.076Z'),
        taps,
        fridgeSections,
        storeSections: null,
        gardenUpdatedAt: null,
        storeUpdatedAt: null,
    });
    assert.equal(partial.store, null);
    assert.equal(partial.taps.updated_at, null);
});

test('mapDrinkSections: titles, serving, groups, prices and localized names', () => {
    const data = {
        sections: [
            {
                id: 'soda',
                items: [
                    { name: 'Coca-Cola', prices: [{ volume: '0.33L', price: 290 }, { volume: '0.25L', price: 260 }, { price: 0 }] },
                    { prices: [{ price: 100 }] },
                ],
            },
            { id: 'rakija', serving: '5cl', items: [{ name: 'Kovilj Dunja', note: 'Quince', note_sr: '', prices: [{ price: 480 }] }] },
            { id: 'whisky', serving: '2.5cl', groups: [{ id: 'islay', items: [{ name: 'Ardbeg 10', prices: [{ price: 630 }] }] }, { id: 'speyside', items: [] }] },
            { id: 'empty', items: [] },
        ],
    };
    const en = mapDrinkSections(data, 'en', makeT('en'));
    assert.deepEqual(en.map((s) => s.name), ['soda', 'rakija', 'whisky']);
    assert.equal(en[0].title, 'Soft drinks');
    assert.equal(en[0].items.length, 1, 'nameless item skipped');
    assert.deepEqual(en[0].items[0].prices, [{ volume_ml: 250, price: 260 }, { volume_ml: 330, price: 290 }]);
    assert.equal(en[1].serving_ml, 50);
    assert.equal(en[1].items[0].note, 'Quince');
    assert.equal(en[2].serving_ml, 25);
    assert.deepEqual(en[2].groups.map((g) => g.title), ['Islay — smoky & peaty'], 'empty group dropped');

    const sr = mapDrinkSections(data, 'sr', makeT('sr'));
    assert.equal(sr[1].items[0].note, '', 'empty note_sr hides the note');
    assert.equal(sr[2].groups[0].title, 'Islay / dimljeni i tresetni');
    assert.throws(() => mapDrinkSections({}, 'en', makeT('en')), /no sections/);
});

test('src/data/drinks.json maps to non-empty sections in every locale', () => {
    const data = require('../src/data/drinks.json');
    for (const code of ['en', 'sr']) {
        const t = makeT(code);
        const sections = mapDrinkSections(data, code, t);
        assert.ok(sections.length > 0);
        for (const s of sections) {
            assert.notEqual(s.title, `drinks.sections.${s.name}`, `missing ${code} title for ${s.name}`);
            for (const g of s.groups) assert.ok(!g.title.startsWith('drinks.groups.'), `missing ${code} group title`);
            for (const item of [...s.items, ...s.groups.flatMap((g) => g.items)]) {
                assert.ok(item.prices.length > 0, `${item.name} has no price`);
            }
        }
    }
});

test('drinks ld-json: bar with a Menu, nested whisky sections, unique ids, priced per volume or serving', () => {
    const ldJson = require('../src/ld-json');
    const data = require('../src/data/drinks.json');
    for (const code of ['en', 'sr']) {
        const t = makeT(code);
        const sections = mapDrinkSections(data, code, t);
        const [bar, site] = ldJson(sections, 'drinks', t, code === 'en' ? '' : '/sr', makeLocalize(code));
        assert.equal(bar['@type'], 'BarOrPub');
        assert.equal(site['@type'], 'WebSite');
        assert.equal(bar.hasMenu['@type'], 'Menu');
        const items = [];
        const walk = (s) => { items.push(...(s.hasMenuItem || [])); (s.hasMenuSection || []).forEach(walk); };
        bar.hasMenu.hasMenuSection.forEach(walk);
        const total = sections.reduce((n, s) => n + s.items.length + s.groups.reduce((m, g) => m + g.items.length, 0), 0);
        assert.equal(items.length, total);
        assert.equal(new Set(items.map((i) => i['@id'])).size, total, 'unique @ids');
        const byName = Object.fromEntries(items.map((i) => [i.name, i.offers]));
        assert.equal(byName['Espresso'].price, 240, 'per-serving price');
        assert.equal(byName['Caol Ila 12'].priceSpecification[0].referenceQuantity.value, 0.025, 'section serving');
        assert.equal(byName['Schweppes Tonic Water'].priceSpecification[0].referenceQuantity.value, 0.25, 'bottle volume');
    }
});
