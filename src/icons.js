const solid = require('@fortawesome/free-solid-svg-icons');
const brands = require('@fortawesome/free-brands-svg-icons');

// The few Font Awesome icons the site uses, inlined as an SVG sprite at build time
// instead of loading the whole Font Awesome stylesheet and fonts from a CDN.
const ICONS = {
    beer: solid.faBeerMugEmpty,
    'faucet-drip': solid.faFaucetDrip,
    jar: solid.faJar,
    'wine-bottle': solid.faWineBottle,
    'chevron-up': solid.faChevronUp,
    telegram: brands.faTelegram,
    instagram: brands.faSquareInstagram,
    facebook: brands.faSquareFacebook,
};

const viewBox = (name) => {
    const [width, height] = ICONS[name].icon;
    return `0 0 ${width} ${height}`;
};

/** Hidden sprite with every icon: rendered once at the top of each page's <body>. */
const sprite =
    '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">' +
    Object.keys(ICONS)
        .map((name) => `<symbol id="i-${name}" viewBox="${viewBox(name)}"><path d="${ICONS[name].icon[4]}"/></symbol>`)
        .join('') +
    '</svg>';

/** Decorative icon referencing the sprite; sized and coloured like text (`.icon` in styles.css). */
function icon(name) {
    if (!ICONS[name]) throw new Error(`Unknown icon "${name}"`);
    return `<svg class="icon" viewBox="${viewBox(name)}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
}

module.exports = { sprite, icon };
