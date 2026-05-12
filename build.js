const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const htmlMinifier = require('html-minifier-terser');

if (process.env.NODE_ENV !== 'production') {
    console.debug('not production, loading .env file');
    require('dotenv').config();
}
// parse input json
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
    minifyURLs: true,
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

// Helper function to read EJS files
function readTemplate(filePath) {
    return fs.readFileSync(path.join(__dirname, filePath), 'utf8');
}

// Read partials
const partials = {
    head: readTemplate('./src/partials/head.ejs'),
    header: readTemplate('./src/partials/header.ejs'),
    footer: readTemplate('./src/partials/footer.ejs'),
    gtag: readTemplate('./src/partials/gtag.ejs'),
};

async function build() {
    try {
        if (!beerData || !Array.isArray(beerData) || beerData.length === 0) {
            throw new Error('Invalid BEER_DATA environment variable:', beerData);
        }
        const beerDataTemplate = {
            assets: {
                images: './assets/images',
                styles: './styles'
            },
            beers: { data: beerData },
            buildDate: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development'
        }
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
        const mainTemplate = readTemplate('./src/index.ejs');
        let taplistHtml = ejs.render(mainTemplate, {
            ...beerDataTemplate,
            partials,
            pageType: 'index',
            cache: beerDataTemplate.environment === 'production',
            filename: 'src/index.ejs'
        });

        if (process.env.NODE_ENV === 'production') {
            console.log('Minifying HTML');
            taplistHtml = await htmlMinifier.minify(taplistHtml, minifyOptions);
        }

        fs.writeFileSync(path.join(distDir, 'index.html'), taplistHtml);
        console.log(`Successfully built`);

    } catch (error) {
        console.error('Build failed:', error.message);
        process.exit(1);
    }
}

build();