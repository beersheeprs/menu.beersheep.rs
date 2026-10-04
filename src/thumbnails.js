const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Untappd labels are 500px+ JPEGs (60–260 KB) shown in at most a 200px box.
// The build downloads each once, shrinks it to WebP and serves it from the site.
// The cache directory is kept between CI runs by actions/cache (deploy.yml).
const CACHE_DIR = '.cache/thumbnails';
const OUT_DIR = 'thumbs';
const WIDTH = 400; // 2× the HD label box, sharp on high-DPI phones
const QUALITY = 75;
const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 15000;
// Cached thumbnails not used by any build for this long are deleted
const MAX_UNUSED_DAYS = 30;

const fileName = (url) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 16) + '.webp';

async function download(url, file) {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const tmp = `${file}.tmp`;
    await sharp(Buffer.from(await res.arrayBuffer()))
        .resize({ width: WIDTH, height: WIDTH, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toFile(tmp);
    fs.renameSync(tmp, file);
}

/**
 * Set `image_thumb` (a site path) on every beer whose label could be fetched and
 * converted, and copy those thumbnails into distDir. Never throws: a label that
 * fails keeps its remote Untappd URL.
 */
async function addThumbnails(beers, distDir) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.mkdirSync(path.join(distDir, OUT_DIR), { recursive: true });

    const urls = [...new Set(beers.map((b) => b.image_hd_url || b.image_url).filter(Boolean))];
    const thumbs = new Map();
    let fetched = 0;
    let failed = 0;

    const queue = [...urls];
    const worker = async () => {
        for (let url = queue.shift(); url; url = queue.shift()) {
            const name = fileName(url);
            const cached = path.join(CACHE_DIR, name);
            try {
                if (fs.existsSync(cached)) {
                    const now = new Date();
                    fs.utimesSync(cached, now, now); // mark as used for pruning
                } else {
                    await download(url, cached);
                    fetched++;
                }
                fs.copyFileSync(cached, path.join(distDir, OUT_DIR, name));
                thumbs.set(url, `/${OUT_DIR}/${name}`);
            } catch (error) {
                failed++;
                console.warn(`Thumbnail: ${url} — ${error.message}, using the remote label`);
            }
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    for (const beer of beers) {
        const thumb = thumbs.get(beer.image_hd_url || beer.image_url);
        if (thumb) beer.image_thumb = thumb;
    }

    const cutoff = Date.now() - MAX_UNUSED_DAYS * 24 * 60 * 60 * 1000;
    let pruned = 0;
    for (const name of fs.readdirSync(CACHE_DIR)) {
        const file = path.join(CACHE_DIR, name);
        if (fs.statSync(file).mtimeMs < cutoff) {
            fs.unlinkSync(file);
            pruned++;
        }
    }

    console.log(
        `Thumbnails: ${thumbs.size}/${urls.length} labels (${fetched} fetched, ` +
            `${thumbs.size - fetched} cached, ${failed} failed, ${pruned} pruned)`
    );
}

module.exports = { addThumbnails };
