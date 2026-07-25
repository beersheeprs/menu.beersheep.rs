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
        brewery: apiBeer.brewery,
        country: apiBeer.country,
        abv: apiBeer.abv,
        ibu: apiBeer.ibu,
        description: apiBeer.description,
        prices: apiBeer.prices,
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

async function build() {
    try {
        let beerData;

        if (process.env.BEER_DATA) {
            console.log('Using BEER_DATA env var');
            beerData = JSON.parse(process.env.BEER_DATA);
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
            beerData = apiData.map(mapApiBeer);
        }

        validateBeers(beerData);

        const ldJson = require('./src/ld-json')(beerData);

        const templateData = {
            beers: { data: beerData },
            ldJson,
            buildDate: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
        };

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
            head: fs.readFileSync(path.join(__dirname, 'src/partials/head.ejs'), 'utf8'),
            header: fs.readFileSync(path.join(__dirname, 'src/partials/header.ejs'), 'utf8'),
            footer: fs.readFileSync(path.join(__dirname, 'src/partials/footer.ejs'), 'utf8'),
            gtag: fs.readFileSync(path.join(__dirname, 'src/partials/gtag.ejs'), 'utf8'),
            cftag: fs.readFileSync(path.join(__dirname, 'src/partials/cftag.ejs'), 'utf8'),
        };
        const mainTemplate = fs.readFileSync(path.join(__dirname, 'src/index.ejs'), 'utf8');

        let taplistHtml = ejs.render(mainTemplate, {
            ...templateData,
            partials,
            pageType: 'taps',
            filename: 'src/index.ejs',
        });

        if (process.env.NODE_ENV === 'production') {
            console.log('Minifying HTML');
            taplistHtml = await htmlMinifier.minify(taplistHtml, minifyOptions);
        }

        fs.writeFileSync(path.join(distDir, 'index.html'), taplistHtml);
        console.log('Successfully built');
    } catch (error) {
        console.error('Build failed:', error.message);
        process.exit(1);
    }
}

build();
