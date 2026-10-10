const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cutWhiteBackground } = require('../src/thumbnails');

// RGBA image of size×size: white, with the pixels for which paint(x, y) returns a colour
function image(size, paint) {
    const data = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const [r, g, b] = paint(x, y) || [255, 255, 255];
            data.set([r, g, b, 255], (y * size + x) * 4);
        }
    }
    return data;
}
const alpha = (data, size, x, y) => data[(y * size + x) * 4 + 3];

test('cutWhiteBackground clears the white around a label, keeps the label and white inside it', () => {
    // Red square with a white centre, on white
    const data = image(20, (x, y) => {
        if (x < 5 || x > 14 || y < 5 || y > 14) return null;
        if (x >= 9 && x <= 10 && y >= 9 && y <= 10) return null;
        return [200, 30, 30];
    });
    assert.equal(cutWhiteBackground(data, 20, 20), true);
    assert.equal(alpha(data, 20, 0, 0), 0);
    assert.equal(alpha(data, 20, 7, 7), 255);
    assert.equal(alpha(data, 20, 9, 9), 255, 'white enclosed by the label stays');
});

test('cutWhiteBackground leaves full-bleed labels alone', () => {
    const data = image(20, () => [30, 120, 60]);
    assert.equal(cutWhiteBackground(data, 20, 20), false);
    assert.equal(alpha(data, 20, 0, 0), 255);
});

test('cutWhiteBackground skips white labels with scattered lettering', () => {
    // Thin dark marks spread over a white label: cutting would leave floating bits
    const data = image(40, (x, y) => (x % 10 === 0 && y % 10 === 0 ? [20, 20, 20] : null));
    assert.equal(cutWhiteBackground(data, 40, 40), false);
    assert.equal(alpha(data, 40, 1, 1), 255);
});
