const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const htmlMinifier = require('html-minifier-terser');
const { createClient } = require('@supabase/supabase-js');

if (process.env.NODE_ENV !== 'production') {
    console.debug('not production, loading .env file');
    require('dotenv').config();
}
// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials not found in environment variables');
    if (process.env.NODE_ENV !== 'production') {
        console.error('   Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env file');
    } else {
        console.error('   Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in environment variables');
    }
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);


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

// Function to fetch data from Supabase
async function fetchDataFromSupabase() {
    console.log('📡 Fetching data from Supabase...');

    try {
        const { data, error } = await supabase.rpc('get_taplist')
        return {
            data
        };
    } catch (error) {
        console.error('❌ Error fetching data from Supabase:', error.message);
        return {
            data: []
        };
    }
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
const copyFile = (src, dest, transform = null) => {
    ensureDir(path.dirname(dest));

    if (transform) {
        const content = fs.readFileSync(src, 'utf8');
        fs.writeFileSync(dest, transform(content));
    } else {
        fs.copyFileSync(src, dest);
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
        const beers = await fetchDataFromSupabase();
        const templateData = {
            // Asset paths (relative to dist/)
            assets: {
                images: './assets/images',
                styles: './styles',
                scripts: './scripts',
            },
            beers,

            buildDate: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development'
        };
        console.log('🚀 Building HTML with EJS...');
        const distDir = './dist';
        if (fs.existsSync(distDir)) {
            fs.rmSync(distDir, { recursive: true, force: true });
        }
        ensureDir(distDir);
        console.log('📁 Copying static assets...');
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
        let html = ejs.render(mainTemplate, {
            ...templateData,
            partials,
            // EJS options
            cache: templateData.environment === 'production',
            filename: 'src/index.ejs'
        });

        if (process.env.MINIFY !== 'false') {
            console.log('🔧 Minifying HTML...');
            html = await htmlMinifier.minify(html, minifyOptions);
        }

        // Write to output file
        const outputPath = path.join(distDir, 'index.html');
        fs.writeFileSync(outputPath, html);
        console.log(`✅ Successfully built: ${outputPath}`);

    } catch (error) {
        console.error('❌ Build failed:', error.message);
        process.exit(1);
    }
}

build();