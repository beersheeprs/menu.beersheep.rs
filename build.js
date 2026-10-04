const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const htmlMinifier = require('html-minifier-terser');
const { addThumbnails } = require('./src/thumbnails');

if (process.env.NODE_ENV !== 'production') {
    console.debug('not production, loading .env file');
    require('dotenv').config();
}

function mapApiBeer(apiBeer) {
    return {
        tap_num: apiBeer.tap_number,
        name: apiBeer.beer_name,
        style: apiBeer.beer_style,
        rating: apiBeer.beer_rating,
        image_url: apiBeer.beer_image,
        image_hd_url: apiBeer.image_hd_url,
        brewery: apiBeer.brewery,
        country: apiBeer.country,
        abv: apiBeer.abv,
        ibu: apiBeer.ibu,
        description: apiBeer.description,
        description_sr: apiBeer.description_sr,
        prices: apiBeer.prices,
        serving_style: apiBeer.serving_style,
        on_tap: apiBeer.on_tap,
        untappd_url: apiBeer.untappd_url,
        // Beer Store only: [{ size, style }] — volumes, since the store lists no prices
        sizes: apiBeer.sizes,
    };
}

// Venue shown in the footer of each page (structured data: src/ld-json.js)
const VENUES = {
    garden: {
        name: 'Beersheep Garden',
        addressKey: 'footer.address',
        instagram: 'https://www.instagram.com/beersheepgarden/',
    },
    store: {
        name: 'Beersheep Beer Store',
        addressKey: 'footer.storeAddress',
        instagram: 'https://www.instagram.com/beersheep_/',
    },
};

// The Beer Store page is a real, indexable page on every deploy, but nothing points to
// it (no nav tab on the garden pages, not in the sitemap) until STORE_PUBLIC=true —
// the repo variable flips those at release.
const STORE_PUBLIC = process.env.STORE_PUBLIC === 'true';

// Filter chips on the store page: first matching group by the style's prefix
// ("IPA - New England" → ipa); anything else is "other". Labels live in i18n (store.groups).
const STYLE_GROUPS = [
    ['ipa', /^IPA\b/i],
    ['paleAle', /^Pale Ale\b/i],
    ['sour', /^(Sour|Lambic|Wild Ale|Gose)\b/i],
    ['stout', /^(Stout|Porter)\b/i],
    ['lager', /^(Lager|Pilsner|Märzen|Bock)\b/i],
    ['belgian', /^Belgian\b/i],
    ['cider', /^(Cider|Mead|Hard Ginger Beer|Hard Seltzer)\b/i],
    ['nonAlcoholic', /^Non-Alcoholic\b/i],
];

function styleGroup(style) {
    const match = STYLE_GROUPS.find(([, re]) => re.test(style || ''));
    return match ? match[0] : 'other';
}

/**
 * Map /store/list ([{ section, beers }]) for the store page. Lenient on purpose:
 * a row without a name is skipped with a warning instead of failing the build,
 * and a missing ABV (0.0% beers are stored as NULL) just hides the ABV badge.
 */
function mapStoreSections(apiData) {
    if (!Array.isArray(apiData)) throw new Error('store list is not an array');
    return apiData
        .map((section) => ({
            name: section.section,
            beers: (section.beers || [])
                .filter((b) => {
                    if (b.beer_name) return true;
                    console.warn(`Store: skipping a beer without a name in "${section.section}"`);
                    return false;
                })
                .map((b) => ({ ...mapApiBeer(b), style_group: styleGroup(b.beer_style) })),
        }))
        .filter((section) => section.name && section.beers.length > 0);
}

/** Store menu from the Worker, or null when it can't be loaded (the store page is then skipped). */
async function fetchStoreSections(apiOrigin) {
    if (!apiOrigin) {
        console.warn('Store: API_ORIGIN not set — skipping the store page');
        return null;
    }
    try {
        console.log(`Fetching from ${apiOrigin}/store/list`);
        const res = await fetch(`${apiOrigin}/store/list`);
        if (!res.ok) throw new Error(`API returned ${res.status}: ${res.statusText}`);
        return mapStoreSections(await res.json());
    } catch (error) {
        console.warn(`Store: ${error.message} — skipping the store page`);
        return null;
    }
}

const LOCALES = [
    { code: 'en', prefix: '', public: true },
    // Not public yet: /sr/ pages get noindex and are left out of hreflang alternates
    { code: 'sr', prefix: 'sr', public: false },
];
const DEFAULT_LOCALE = 'en';

const dictionaries = Object.fromEntries(
    LOCALES.map(({ code }) => [code, require(`./src/i18n/${code}.json`)])
);

function lookup(dict, key) {
    return key.split('.').reduce((obj, k) => (obj == null ? undefined : obj[k]), dict);
}

// Translation helper: dot-path lookup with {var} interpolation,
// falling back to the default locale and then to the key itself.
function makeT(code) {
    return (key, vars = {}) => {
        let value = lookup(dictionaries[code], key);
        if (typeof value !== 'string') value = lookup(dictionaries[DEFAULT_LOCALE], key);
        if (typeof value !== 'string') return key;
        return value.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? vars[name] : match));
    };
}

// Locale-aware view of a beer's data fields: falls back to the original (English) values.
function makeLocalize(code) {
    const countries = dictionaries[code].countries || {};
    return {
        country: (name) => (name && countries[name]) || name,
        description: (beer) => (code !== DEFAULT_LOCALE && beer[`description_${code}`]?.trim()) || beer.description,
    };
}

const minifyOptions = {
    collapseWhitespace: true,
    removeComments: process.env.NODE_ENV === 'production',
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true,
    minifyJS: true,
    minifyCSS: true,
    removeAttributeQuotes: true,
    ignoreCustomComments: [/^!/],
};

/**
 * GitHub Pages has no server-side redirects: write a page at an old URL that
 * forwards to the new one (meta refresh + canonical for crawlers, JS to keep
 * the #section anchor).
 */
function writeRedirect(file, target) {
    const url = `https://menu.beersheep.rs${target}`;
    fs.writeFileSync(
        file,
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Redirecting…</title>` +
            `<link rel="canonical" href="${url}"><meta http-equiv="refresh" content="0; url=${target}">` +
            `<script>location.replace(${JSON.stringify(target)} + location.hash)</script></head>` +
            `<body><a href="${target}">${url}</a></body></html>`
    );
}

const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

const copyDir = (src, dest) => {
    ensureDir(dest);

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
};

function validateBeers(beers) {
    if (!beers || !Array.isArray(beers) || beers.length === 0) {
        throw new Error(
            `Invalid BEER_DATA: expected non-empty array, got ${JSON.stringify(beers)}`
        );
    }
    for (let i = 0; i < beers.length; i++) {
        const beer = beers[i];
        if (!beer.name || typeof beer.abv !== 'number') {
            throw new Error(
                `Invalid beer at index ${i}: missing name or abv. Got: ${JSON.stringify(beer)}`
            );
        }
    }
}

function extractSections(apiData) {
    const sections = [];
    for (const [key, value] of Object.entries(apiData)) {
        if (key !== 'Draft Beers' && Array.isArray(value) && value.length > 0) {
            sections.push({
                name: key,
                beers: value.map(mapApiBeer),
            });
        }
    }
    return sections;
}

async function build() {
    try {
        let beerData;
        let bottleSections = [];

        if (process.env.BEER_DATA) {
            console.log('Using BEER_DATA env var');
            const raw = JSON.parse(process.env.BEER_DATA);
            const draftBeers = raw['Draft Beers'];
            if (!draftBeers || !Array.isArray(draftBeers)) {
                throw new Error('BEER_DATA missing "Draft Beers" array');
            }
            beerData = draftBeers.map(mapApiBeer);
            bottleSections = extractSections(raw);
        } else {
            const apiOrigin = process.env.API_ORIGIN;
            if (!apiOrigin) {
                throw new Error('API_ORIGIN env var is required when BEER_DATA is not set');
            }
            console.log(`Fetching from ${apiOrigin}/list`);
            const res = await fetch(`${apiOrigin}/list`);
            if (!res.ok) {
                throw new Error(`API returned ${res.status}: ${res.statusText}`);
            }
            const apiData = await res.json();
            const draftBeers = apiData['Draft Beers'];
            if (!draftBeers || !Array.isArray(draftBeers)) {
                throw new Error('API response missing "Draft Beers" array');
            }
            beerData = draftBeers.map(mapApiBeer);
            bottleSections = extractSections(apiData);
        }

        validateBeers(beerData);
        for (const section of bottleSections) {
            validateBeers(section.beers);
        }

        // The store page must never break the garden pages: any failure skips it
        const storeSections = await fetchStoreSections(process.env.API_ORIGIN);

        const ldJson = require('./src/ld-json');
        const buildDate = new Date().toISOString();
        const environment = process.env.NODE_ENV || 'development';
        const locales = LOCALES.map(({ code, prefix, public: isPublic }) => ({
            code,
            base: prefix ? `/${prefix}` : '',
            public: isPublic,
            name: dictionaries[code].meta.langName,
        }));

        console.log('Building HTML with EJS...');

        const distDir = './dist';
        if (fs.existsSync(distDir)) {
            fs.rmSync(distDir, { recursive: true, force: true });
        }
        ensureDir(distDir);

        console.log('Copying static assets');
        const assetDirs = [
            { src: './src/assets', dest: './dist' },
            { src: './src/styles', dest: './dist' },
        ];
        assetDirs.forEach(({ src, dest }) => {
            if (fs.existsSync(src)) {
                copyDir(src, dest);
                console.debug(`   ✓ ${src} → ${dest}`);
            }
        });

        await addThumbnails(
            [beerData, ...bottleSections, ...(storeSections || [])].flatMap((s) => s.beers || s),
            distDir
        );

        const partials = {
            gtag: fs.readFileSync(path.join(__dirname, 'src/partials/gtag.ejs'), 'utf8'),
            cftag: fs.readFileSync(path.join(__dirname, 'src/partials/cftag.ejs'), 'utf8'),
        };
        const mainTemplate = fs.readFileSync(path.join(__dirname, 'src/index.ejs'), 'utf8');
        const bottlesTemplate = fs.readFileSync(path.join(__dirname, 'src/bottles.ejs'), 'utf8');
        const storeTemplate = fs.readFileSync(path.join(__dirname, 'src/store.ejs'), 'utf8');
        const notFoundTemplate = fs.readFileSync(path.join(__dirname, 'src/404.ejs'), 'utf8');

        const render = async (template, data) => {
            const html = ejs.render(template, data);
            return process.env.NODE_ENV === 'production'
                ? htmlMinifier.minify(html, minifyOptions)
                : html;
        };

        for (const locale of locales) {
            const { code, base } = locale;
            const t = makeT(code);
            const localize = makeLocalize(code);
            const outDir = path.join(distDir, base);
            ensureDir(outDir);
            console.log(`Rendering locale "${code}" → ${outDir}`);

            const common = { partials, t, localize, lang: code, base, locales, isPublic: locale.public, buildDate, environment, venue: VENUES.garden, storePublic: STORE_PUBLIC };

            const taplistHtml = await render(mainTemplate, {
                ...common,
                beers: { data: beerData },
                ldJson: ldJson(beerData, 'taps', t, base, localize),
                pageType: 'taps',
                pagePath: '/',
                filename: 'src/index.ejs',
            });
            fs.writeFileSync(path.join(outDir, 'index.html'), taplistHtml);

            const bottlesHtml = await render(bottlesTemplate, {
                ...common,
                sections: bottleSections,
                ldJson: ldJson(bottleSections, 'bottles', t, base, localize),
                pageType: 'bottles',
                pagePath: '/bottles/',
                filename: 'src/bottles.ejs',
            });
            // Directory URLs: GitHub Pages serves /bottles/ from bottles/index.html
            ensureDir(path.join(outDir, 'bottles'));
            fs.writeFileSync(path.join(outDir, 'bottles', 'index.html'), bottlesHtml);
            // The page used to live at /bottles.html — keep old links and bookmarks working
            writeRedirect(path.join(outDir, 'bottles.html'), `${base}/bottles/`);

            if (storeSections) {
                try {
                    const storeHtml = await render(storeTemplate, {
                        ...common,
                        venue: VENUES.store,
                        sections: storeSections,
                        ldJson: ldJson(storeSections, 'store', t, base, localize),
                        pageType: 'store',
                        pagePath: '/store/',
                        filename: 'src/store.ejs',
                    });
                    ensureDir(path.join(outDir, 'store'));
                    fs.writeFileSync(path.join(outDir, 'store', 'index.html'), storeHtml);
                } catch (error) {
                    console.warn(`Store: rendering failed for "${code}" (${error.message}) — skipping`);
                }
            }

            // GitHub Pages only serves the root 404.html, so render it for the default locale only
            if (code === DEFAULT_LOCALE) {
                const notFoundHtml = await render(notFoundTemplate, {
                    ...common,
                    pageType: '404',
                    pagePath: '/',
                    filename: 'src/404.ejs',
                });
                fs.writeFileSync(path.join(outDir, '404.html'), notFoundHtml);
            }
        }

        // API endpoints
        ensureDir(path.join(distDir, 'api/v1'));
        fs.writeFileSync(
          path.join(distDir, 'api/v1/taps.json'),
          JSON.stringify(beerData)
        );
        fs.writeFileSync(
          path.join(distDir, 'api/v1/fridge.json'),
          JSON.stringify(bottleSections)
        );
        if (storeSections) {
            fs.writeFileSync(path.join(distDir, 'api/v1/store.json'), JSON.stringify(storeSections));
        }

        // The store page joins the sitemap only once it is public
        if (STORE_PUBLIC && storeSections) {
            const sitemapPath = path.join(distDir, 'sitemap.xml');
            const storeEntry =
                '  <url>\n    <loc>https://menu.beersheep.rs/store/</loc>\n' +
                '    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n';
            fs.writeFileSync(
                sitemapPath,
                fs.readFileSync(sitemapPath, 'utf8').replace('</urlset>', storeEntry + '</urlset>')
            );
        }
        console.log('Successfully built');
    } catch (error) {
        console.error('Build failed:', error.message);
        process.exit(1);
    }
}

build();
