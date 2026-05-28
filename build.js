const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const htmlMinifier = require('html-minifier-terser');

if (process.env.NODE_ENV !== 'production') {
    console.debug('not production, loading .env file');
    require('dotenv').config();
}

const beerData = process.env.BEER_DATA ? JSON.parse(process.env.BEER_DATA) : [];

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
        validateBeers(beerData);

        const templateData = {
            beers: { data: beerData },
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
