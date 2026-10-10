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

// Bump when the image processing changes: new file names make the build redo every label
const PROCESSING_VERSION = 4;

const fileName = (url) =>
    crypto.createHash('sha1').update(`${url}#v${PROCESSING_VERSION}`).digest('hex').slice(0, 16) + '.webp';

// Background: every channel at least this bright, i.e. white up to JPEG noise. Strict on
// purpose: cream or pale-sky label art just inside the edge must not count as background
const WHITE_MIN = 243;
// Kept pixels this close to the cut fade out by how light they are (from EDGE_FADE_FROM
// up to WHITE_MIN), which takes off the light JPEG fringe and anti-aliases the edge
const EDGE_BAND = 2;
const EDGE_FADE_FROM = 190;
// Skip the cut when it would remove almost nothing (full-bleed labels) …
const MIN_CUT_SHARE = 0.02;
// … or leave scattered bits (a white label with thin lettering), not one solid shape:
// the kept pixels must fill at least this share of their own bounding box
const MIN_KEPT_DENSITY = 0.4;
// Round labels: when the kept pixels form a disc (box nearly square, almost nothing kept
// outside the inscribed circle, most of the circle kept), the cut follows the circle, so
// white art touching the rim (clouds, foam, birds) stays with the label
const ROUND_TOLERANCE = 0.06;
const ROUND_MAX_OUTSIDE = 0.005;
const ROUND_MIN_FILL = 0.8;
// Pulled in slightly (working pixels) so the label's pale outer rim does not show
const ROUND_INSET = 1.5;

/**
 * Make the white background of a label transparent, in place (RGBA, 4 bytes per pixel).
 * Flood-fills near-white pixels from the image border, so white inside the label
 * (text, a white circle) stays. The pixels along the cut get partial alpha by how
 * white they are, with the white taken out of their colour, so no light halo is left
 * on a dark page. Returns false (buffer untouched) when the image has no white
 * background to cut or the cut would not leave one solid shape.
 */
function cutWhiteBackground(data, width, height) {
    const n = width * height;
    const isBackground = (i) => {
        const o = i * 4;
        if (data[o + 3] < 16) return true; // already transparent (PNG labels)
        return Math.min(data[o], data[o + 1], data[o + 2]) >= WHITE_MIN;
    };

    const cut = new Uint8Array(n);
    const stack = [];
    const visit = (i) => {
        if (!cut[i] && isBackground(i)) {
            cut[i] = 1;
            stack.push(i);
        }
    };
    for (let x = 0; x < width; x++) {
        visit(x);
        visit((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
        visit(y * width);
        visit(y * width + width - 1);
    }
    let cutCount = 0;
    while (stack.length) {
        const i = stack.pop();
        cutCount++;
        const x = i % width;
        if (x > 0) visit(i - 1);
        if (x < width - 1) visit(i + 1);
        if (i >= width) visit(i - width);
        if (i < n - width) visit(i + width);
    }
    if (cutCount < n * MIN_CUT_SHARE || cutCount === n) return false;

    // Bounding box of the kept pixels; a row or column needs 2 of them, so stray JPEG
    // noise left in the background does not stretch it
    const cols = new Uint32Array(width);
    const rows = new Uint32Array(height);
    for (let i = 0; i < n; i++) {
        if (cut[i]) continue;
        const x = i % width;
        cols[x]++;
        rows[(i - x) / width]++;
    }
    const first = (counts) => counts.findIndex((c) => c >= 2);
    const last = (counts) => counts.length - 1 - [...counts].reverse().findIndex((c) => c >= 2);
    const minX = first(cols), maxX = last(cols), minY = first(rows), maxY = last(rows);
    if (minX < 0 || minY < 0) return false;
    const boxArea = (maxX - minX + 1) * (maxY - minY + 1);
    if ((n - cutCount) / boxArea < MIN_KEPT_DENSITY) return false;

    const cx = (minX + maxX + 1) / 2, cy = (minY + maxY + 1) / 2;
    const rx = (maxX - minX + 1) / 2, ry = (maxY - minY + 1) / 2;
    if (Math.abs(rx - ry) <= ROUND_TOLERANCE * Math.max(rx, ry)) {
        const radius = Math.min(rx, ry);
        // Distance from the centre, 1 on the circle
        const r = (i) => {
            const x = i % width;
            return Math.hypot((x + 0.5 - cx) / rx, ((i - x) / width + 0.5 - cy) / ry);
        };
        let inside = 0, keptInside = 0, keptOutside = 0;
        for (let i = 0; i < n; i++) {
            const ri = r(i);
            if (ri <= 1) {
                inside++;
                if (!cut[i]) keptInside++;
            } else if (!cut[i] && ri > 1.04) {
                keptOutside++;
            }
        }
        if (keptOutside <= ROUND_MAX_OUTSIDE * (n - cutCount) && keptInside >= ROUND_MIN_FILL * inside) {
            for (let i = 0; i < n; i++) {
                // Anti-aliased: the share of the pixel inside the (pulled-in) circle
                const coverage = Math.max(0, Math.min(1, 0.5 - ((r(i) - 1) * radius + ROUND_INSET)));
                data[i * 4 + 3] = Math.round(data[i * 4 + 3] * coverage);
            }
            return true;
        }
    }

    // Distance (in steps) from the cut for the kept pixels near it, up to EDGE_BAND
    const near = new Uint8Array(n);
    const touches = (i, set, value) => {
        const x = i % width;
        return (x > 0 && set[i - 1] === value) || (x < width - 1 && set[i + 1] === value) ||
            (i >= width && set[i - width] === value) || (i < n - width && set[i + width] === value);
    };
    for (let i = 0; i < n; i++) if (!cut[i] && touches(i, cut, 1)) near[i] = 1;
    for (let d = 2; d <= EDGE_BAND; d++) {
        for (let i = 0; i < n; i++) if (!cut[i] && !near[i] && touches(i, near, d - 1)) near[i] = d;
    }

    for (let i = 0; i < n; i++) {
        const o = i * 4;
        if (cut[i]) {
            data[o + 3] = 0;
            continue;
        }
        if (!near[i]) continue;
        const min = Math.min(data[o], data[o + 1], data[o + 2]);
        const whiteness = Math.max(0, Math.min(1, (min - EDGE_FADE_FROM) / (WHITE_MIN - EDGE_FADE_FROM)));
        if (whiteness === 0) continue;
        const keep = 1 - whiteness;
        // Un-blend from white: the colour this pixel would have without the white behind it
        for (let c = 0; c < 3; c++) {
            data[o + c] = Math.max(0, Math.min(255, Math.round((data[o + c] - 255 * whiteness) / keep)));
        }
        data[o + 3] = Math.round(data[o + 3] * keep);
    }
    return true;
}

// The cut runs at twice the thumbnail size and is then scaled down, so its edge is
// anti-aliased like the rest of the image, also for small (200px) source labels
const SUPERSAMPLE = 2;

async function toThumbnail(input) {
    const thumbnail = () =>
        sharp(input).resize({ width: WIDTH, height: WIDTH, fit: 'inside', withoutEnlargement: true });
    const { width, height } = (await thumbnail().raw().toBuffer({ resolveWithObject: true })).info;
    const { data, info } = await sharp(input)
        .resize({ width: width * SUPERSAMPLE, height: height * SUPERSAMPLE, fit: 'fill' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const cut = cutWhiteBackground(data, info.width, info.height);
    const image = cut
        ? sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).resize({ width, height, fit: 'fill' })
        : thumbnail(); // untouched labels: no supersampling round trip
    return { image: image.webp({ quality: QUALITY, alphaQuality: 90 }), cut };
}

async function download(url, file) {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const tmp = `${file}.tmp`;
    const { image, cut } = await toThumbnail(Buffer.from(await res.arrayBuffer()));
    await image.toFile(tmp);
    fs.renameSync(tmp, file);
    return cut;
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
    let cutCount = 0;
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
                    if (await download(url, cached)) cutCount++;
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
            `${thumbs.size - fetched} cached, ${failed} failed, ${pruned} pruned; ` +
            `white background cut on ${cutCount} of the fetched)`
    );
}

module.exports = { addThumbnails, cutWhiteBackground };
