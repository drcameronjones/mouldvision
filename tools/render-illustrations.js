// Renders the homepage illustrations (decorative, captioned "Illustration, not a test stimulus").
// Same mathematical form as the test pattern (sine grating in a Gaussian window on mid-grey, sRGB-linearised)
// but drawn here at a fixed, clearly visible contrast; these images are never used in the test.
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const out = path.join(__dirname, '..', 'src', 'site', 'img'); fs.mkdirSync(out, { recursive: true });
const srgb = l => l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
const MEAN = 0.2140;   // linear luminance of sRGB 128

function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w, h, grey) {
  const raw = Buffer.alloc((w + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = grey[y * w + x]; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// one patch into a canvas: centre (cx,cy), radius R px, cycles across the patch diameter, tilt degrees
function patch(buf, w, cx, cy, R, cycles, tiltDeg, contrast) {
  const th = tiltDeg * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th), sigma = R * 0.42, f = cycles / (2 * R);
  for (let y = Math.floor(cy - R); y < cy + R; y++) for (let x = Math.floor(cx - R); x < cx + R; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r2 = dx * dx + dy * dy; if (r2 > R * R) continue;
    const u = dx * ct + dy * st, env = Math.exp(-r2 / (2 * sigma * sigma));
    buf[y * w + x] = Math.max(0, Math.min(255, Math.round(255 * srgb(MEAN * (1 + contrast * env * Math.sin(2 * Math.PI * f * u))))));
  }
}
function canvas(w, h) { return new Uint8Array(w * h).fill(128); }

// Figure 1: one patch leaning left (same sign convention as the test: left = top of the bars leans left)
{ const w = 720, h = 720, b = canvas(w, h); patch(b, w, 360, 360, 330, 9, -15, 0.55); fs.writeFileSync(path.join(out, 'figure-grating.png'), png(w, h, b)); }
// Figure 2: the five bar widths A–E (relative bar widths 1.5 : 3 : 6 : 12 : 18 cycles per degree, scaled for a 5° patch)
{ const w = 1500, h = 300, b = canvas(w, h); [1.5, 3, 6, 12, 18].forEach((cpd, i) => patch(b, w, 150 + i * 300, 150, 135, cpd * 5 * 0.55, 0, 0.55)); fs.writeFileSync(path.join(out, 'figure-columns.png'), png(w, h, b)); }
// Figure 3: three tilts, left / upright / right
{ const w = 1080, h = 360, b = canvas(w, h); [-15, 0, 15].forEach((t, i) => patch(b, w, 180 + i * 360, 180, 160, 7, t, 0.55)); fs.writeFileSync(path.join(out, 'figure-tilts.png'), png(w, h, b)); }
console.log('wrote', fs.readdirSync(out).join(', '));
