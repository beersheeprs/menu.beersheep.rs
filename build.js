const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const htmlMinifier = require('html-minifier-terser');

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
    };
}

const LOCALES = [
    { code: 'en', prefix: '' },
    { code: 'sr', prefix: 'sr' },
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

        const ldJson = require('./src/ld-json');
        const buildDate = new Date().toISOString();
        const environment = process.env.NODE_ENV || 'development';
        const locales = LOCALES.map(({ code, prefix }) => ({
            code,
            base: prefix ? `/${prefix}` : '',
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

        const partials = {
            gtag: fs.readFileSync(path.join(__dirname, 'src/partials/gtag.ejs'), 'utf8'),
            cftag: fs.readFileSync(path.join(__dirname, 'src/partials/cftag.ejs'), 'utf8'),
        };
        const mainTemplate = fs.readFileSync(path.join(__dirname, 'src/index.ejs'), 'utf8');
        const bottlesTemplate = fs.readFileSync(path.join(__dirname, 'src/bottles.ejs'), 'utf8');
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

            const common = { partials, t, localize, lang: code, base, locales, buildDate, environment };

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
                pagePath: '/bottles.html',
                filename: 'src/bottles.ejs',
            });
            fs.writeFileSync(path.join(outDir, 'bottles.html'), bottlesHtml);

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
        console.log('Successfully built');
    } catch (error) {
        console.error('Build failed:', error.message);
        process.exit(1);
    }
}

build();
