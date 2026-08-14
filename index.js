import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'qrcode'


// [version-1][ecl] where ecl: 0=L, 1=M, 2=Q, 3=H
const ECC_CODEWORDS_PER_BLOCK = [
  [7,10,13,17],[10,16,22,28],[15,26,18,22],[20,18,26,16],[26,24,18,22],
  [18,16,24,28],[20,18,18,26],[24,22,22,26],[30,22,20,24],[18,26,24,28],
  [20,30,28,24],[24,22,26,28],[26,22,24,22],[30,24,20,24],[22,24,30,24],
  [24,28,24,30],[28,28,28,28],[30,26,28,28],[28,26,26,26],[28,26,30,28],
  [28,26,28,30],[28,28,30,24],[30,28,30,30],[30,28,30,30],[26,28,30,30],
  [28,28,28,30],[30,28,30,30],[30,28,30,30],[30,28,30,30],[30,28,30,30],
  [30,28,30,30],[30,28,30,30],[30,28,30,30],[30,28,30,30],[30,28,30,30],
  [30,28,30,30],[30,28,30,30],[30,28,30,30],[30,28,30,30],[30,28,30,30],
];
const NUM_ERROR_CORRECTION_BLOCKS = [
  [1,1,1,1],[1,1,1,1],[1,1,2,2],[1,2,2,4],[1,2,4,4],
  [2,4,4,4],[2,4,6,5],[2,4,6,6],[2,5,8,8],[4,5,8,8],
  [4,5,8,11],[4,8,10,11],[4,9,12,16],[4,9,16,16],[6,10,12,18],
  [6,10,17,16],[6,11,16,19],[6,13,18,21],[7,14,21,25],[8,16,20,25],
  [8,17,23,25],[9,17,23,34],[9,18,25,30],[10,20,27,32],[12,21,29,35],
  [12,23,34,37],[12,25,34,40],[13,26,35,42],[14,28,38,45],[15,29,40,48],
  [16,31,43,51],[17,33,45,54],[18,35,48,57],[19,37,51,60],[19,38,53,63],
  [20,40,56,66],[21,43,59,70],[22,45,62,74],[24,47,65,77],[25,49,68,81],
];
const ECC_FORMAT_BITS = [1, 0, 3, 2]; // L, M, Q, H
const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function getBit(x, i) { return ((x >>> i) & 1) !== 0; }
function getNumRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numalign = Math.floor(ver / 7) + 2;
    result -= (25 * numalign - 10) * numalign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}
function getNumDataCodewords(ver, ecl) {
  return Math.floor(getNumRawDataModules(ver) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ver - 1][ecl] * NUM_ERROR_CORRECTION_BLOCKS[ver - 1][ecl];
}

// ---------- Reed-Solomon over GF(256), primitive polynomial 0x11D ----------
function rsMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >> 7) * 0x11D);
    z ^= ((y >> i) & 1) * x;
  }
  return z;
}
function rsComputeDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = rsMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = rsMultiply(root, 0x02);
  }
  return result;
}
function rsComputeRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (let k = 0; k < data.length; k++) {
    const factor = data[k] ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < divisor.length; i++) {
      result[i] ^= rsMultiply(divisor[i], factor);
    }
  }
  return result;
}

function addEccAndInterleave(ver, ecl, data) {
  const numblocks = NUM_ERROR_CORRECTION_BLOCKS[ver - 1][ecl];
  const blockecclen = ECC_CODEWORDS_PER_BLOCK[ver - 1][ecl];
  const rawcodewords = Math.floor(getNumRawDataModules(ver) / 8);
  const numshortblocks = numblocks - rawcodewords % numblocks;
  const shortblocklen = Math.floor(rawcodewords / numblocks);
  const blocks = [];
  const rsdiv = rsComputeDivisor(blockecclen);
  let k = 0;
  for (let i = 0; i < numblocks; i++) {
    const datlen = shortblocklen - blockecclen + (i < numshortblocks ? 0 : 1);
    const dat = data.slice(k, k + datlen);
    k += dat.length;
    const ecc = rsComputeRemainder(dat, rsdiv);
    if (i < numshortblocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i !== shortblocklen - blockecclen || j >= numshortblocks) result.push(blocks[j][i]);
    }
  }
  return result;
}

// ---------- bit buffer + data encoding ----------
function utf8Bytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.codePointAt(i);
    if (c > 0xFFFF) i++; // surrogate pair
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) { bytes.push(0xC0 | (c >> 6), 0x80 | (c & 63)); }
    else if (c < 0x10000) { bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    else { bytes.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
  }
  return bytes;
}
function pickMode(text) {
  if (text.length > 0 && /^[0-9]+$/.test(text)) return 'numeric';
  if (text.length > 0) {
    let ok = true;
    for (let i = 0; i < text.length; i++) { if (ALPHANUMERIC.indexOf(text[i]) < 0) { ok = false; break; } }
    if (ok) return 'alphanumeric';
  }
  return 'byte';
}
function charCountBits(mode, version) {
  const idx = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  if (mode === 'numeric') return [10, 12, 14][idx];
  if (mode === 'alphanumeric') return [9, 11, 13][idx];
  return [8, 16, 16][idx]; // byte
}
function modeLength(text, mode) {
  return mode === 'byte' ? utf8Bytes(text).length : text.length;
}
function segmentTotalBits(mode, len, version) {
  let dataBits;
  if (mode === 'numeric') dataBits = Math.floor(len / 3) * 10 + [0, 4, 7][len % 3];
  else if (mode === 'alphanumeric') dataBits = Math.floor(len / 2) * 11 + (len % 2) * 6;
  else dataBits = len * 8;
  return 4 + charCountBits(mode, version) + dataBits;
}

function buildDataCodewords(text, mode, version, ecl) {
  const bits = [];
  function appendBits(val, len) { for (let i = len - 1; i >= 0; i--) bits.push(((val >>> i) & 1) === 1); }
  const modeVal = mode === 'numeric' ? 0x1 : mode === 'alphanumeric' ? 0x2 : 0x4;
  appendBits(modeVal, 4);
  const len = modeLength(text, mode);
  appendBits(len, charCountBits(mode, version));
  if (mode === 'numeric') {
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.slice(i, i + 3);
      appendBits(parseInt(chunk, 10), [0, 4, 7, 10][chunk.length]);
    }
  } else if (mode === 'alphanumeric') {
    for (let i = 0; i < text.length; i += 2) {
      const c1 = ALPHANUMERIC.indexOf(text[i]);
      if (i + 1 < text.length) appendBits(c1 * 45 + ALPHANUMERIC.indexOf(text[i + 1]), 11);
      else appendBits(c1, 6);
    }
  } else {
    const bytes = utf8Bytes(text);
    for (let i = 0; i < bytes.length; i++) appendBits(bytes[i], 8);
  }
  const cap = getNumDataCodewords(version, ecl) * 8;
  const term = Math.min(4, cap - bits.length);
  appendBits(0, term);
  while (bits.length % 8 !== 0) bits.push(false);
  let pad = 0xEC;
  while (bits.length < cap) { appendBits(pad, 8); pad = pad === 0xEC ? 0x11 : 0xEC; }
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] ? 1 : 0);
    data.push(b);
  }
  return data;
}

// ---------- format / version bits ----------
function getFormatBits(ecl, mask) {
  let data = (ECC_FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
function getVersionBits(ver) {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
  return (ver << 12) | rem;
}

// ---------- drawing ----------
function alignmentPatternPositions(ver) {
  if (ver === 1) return [];
  const numalign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.floor((ver * 4 + numalign * 2 + 1) / (numalign * 2 - 2)) * 2;
  const size = ver * 4 + 17;
  const result = [6];
  let pos = size - 7;
  for (let i = 0; i < numalign - 1; i++) { result.splice(1, 0, pos); pos -= step; }
  return result;
}

function drawFunctionPatterns(ver, size, modules, isFunction) {
  function set(x, y, dark) { if (x >= 0 && y >= 0 && x < size && y < size) { modules[y][x] = dark; isFunction[y][x] = true; } }
  // timing
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  // finders
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const dark = dist !== 2 && dist !== 4;
      set(3 + dx, 3 + dy, dark);
      set(size - 4 + dx, 3 + dy, dark);
      set(3 + dx, size - 4 + dy, dark);
    }
  }
  // alignment
  const pos = alignmentPatternPositions(ver);
  const n = pos.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      const cx = pos[i], cy = pos[j];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  // reserve format-info positions (actual bits drawn after mask selection)
  reserveFormatPositions(size, modules, isFunction);
  // version info
  if (ver >= 7) drawVersion(ver, size, modules, isFunction);
}

function reserveFormatPositions(size, modules, isFunction) {
  function mark(x, y, dark) { if (x >= 0 && y >= 0 && x < size && y < size) { modules[y][x] = dark; isFunction[y][x] = true; } }
  for (let i = 0; i <= 5; i++) mark(8, i, false);
  mark(8, 7, false);
  mark(8, 8, false);
  mark(7, 8, false);
  for (let i = 9; i < 15; i++) mark(14 - i, 8, false);
  for (let i = 0; i < 8; i++) mark(size - 1 - i, 8, false);
  for (let i = 0; i < 7; i++) mark(8, size - 1 - i, false);
  mark(8, size - 8, true); // fixed dark module
}

function drawFormatBits(ecl, mask, size, modules, isFunction) {
  const bits = getFormatBits(ecl, mask);
  function set(x, y, dark) { if (x >= 0 && y >= 0 && x < size && y < size) { modules[y][x] = dark; isFunction[y][x] = true; } }
  for (let i = 0; i <= 5; i++) set(8, i, getBit(bits, i));
  set(8, 7, getBit(bits, 6));
  set(8, 8, getBit(bits, 7));
  set(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, getBit(bits, i));
  // second copy: top-right horizontal = bits 0..7; bottom-left vertical = bits 14..8 + dark module
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, getBit(bits, i));
  for (let i = 0; i < 7; i++) set(8, size - 1 - i, getBit(bits, 14 - i));
  set(8, size - 8, true); // fixed dark module
}
function drawVersion(ver, size, modules, isFunction) {
  const bits = getVersionBits(ver);
  function set(x, y, dark) { if (x >= 0 && y >= 0 && x < size && y < size) { modules[y][x] = dark; isFunction[y][x] = true; } }
  for (let i = 0; i < 18; i++) {
    const dark = getBit(bits, i);
    const a = size - 11 + i % 3;
    const b = Math.floor(i / 3);
    set(a, b, dark);
    set(b, a, dark);
  }
}

function drawCodewords(data, size, modules, isFunction) {
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < data.length * 8) {
          modules[y][x] = getBit(data[i >> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

function applyMask(mask, size, modules, isFunction) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFunction[y][x]) continue;
      let invert = false;
      if (mask === 0) invert = (x + y) % 2 === 0;
      else if (mask === 1) invert = y % 2 === 0;
      else if (mask === 2) invert = x % 3 === 0;
      else if (mask === 3) invert = (x + y) % 3 === 0;
      else if (mask === 4) invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      else if (mask === 5) invert = (x * y) % 2 + (x * y) % 3 === 0;
      else if (mask === 6) invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0;
      else if (mask === 7) invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0;
      if (invert) modules[y][x] = !modules[y][x];
    }
  }
}

// ---------- penalty (ISO/IEC 18004 Table 11) ----------
function n3PatternOccurrences(seq, size) {
  const s = seq.map(function (v) { return v ? '1' : '0'; }).join('');
  const pat = '1011101';
  let count = 0;
  let idx = s.indexOf(pat);
  while (idx !== -1) {
    let offset = idx + 7;
    if (idx === 0 || idx === size - 7 ||
        s.slice(Math.max(idx - 4, 0), idx).indexOf('1') === -1 ||
        s.slice(offset, Math.min(offset + 4, size)).indexOf('1') === -1) {
      count += 40;
    } else {
      offset = idx + 4;
    }
    idx = s.indexOf(pat, offset);
  }
  return count;
}
function lineRunPenalty(line) {
  let score = 0;
  let prev = -1, run = 0;
  for (let i = 0; i < line.length; i++) {
    const bit = line[i] ? 1 : 0;
    if (bit === prev) run++;
    else { if (run >= 5) score += run - 2; run = 1; prev = bit; }
  }
  if (run >= 5) score += run - 2;
  return score;
}
function getPenaltyScore(size, modules) {
  let n1 = 0, n2 = 0, n3 = 0;
  // N1 + N3 per row and column
  for (let y = 0; y < size; y++) { n1 += lineRunPenalty(modules[y]); n3 += n3PatternOccurrences(modules[y], size); }
  for (let x = 0; x < size; x++) {
    const col = new Array(size);
    for (let y = 0; y < size; y++) col[y] = modules[y][x];
    n1 += lineRunPenalty(col);
    n3 += n3PatternOccurrences(col, size);
  }
  // N2: 2x2 same-color blocks
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (modules[y][x + 1] === c && modules[y + 1][x] === c && modules[y + 1][x + 1] === c) n2 += 3;
    }
  }
  // N4: dark-module proportion
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) dark++;
  const total = size * size;
  const n4 = 10 * Math.floor(Math.abs((dark / total) * 100 - 50) / 5);
  return n1 + n2 + n3 + n4;
}

// ---------- main encode ----------
function encode(text, opts) {
  opts = opts || {};
  const ecl = opts.ecl === undefined ? 0 : opts.ecl; // 0=L,1=M,2=Q,3=H
  const mode = pickMode(text);
  let version = opts.version || 0;
  if (version === 0) {
    version = 1;
    while (version <= 40) {
      if (segmentTotalBits(mode, modeLength(text, mode), version) <= getNumDataCodewords(version, ecl) * 8) break;
      version++;
    }
    if (version > 40) throw new Error('data too long to encode');
  }
  const size = version * 4 + 17;
  const dataCodewords = buildDataCodewords(text, mode, version, ecl);
  const allCodewords = addEccAndInterleave(version, ecl, dataCodewords);

  // Build matrix for each candidate mask, pick best (or fixed).
  const maskChoice = opts.mask === undefined ? -1 : opts.mask;
  let bestMask = 0, bestPenalty = Infinity, bestModules = null;

  const masksToTry = maskChoice >= 0 ? [maskChoice] : [0, 1, 2, 3, 4, 5, 6, 7];
  for (let m = 0; m < masksToTry.length; m++) {
    const mask = masksToTry[m];
    const modules = [];
    const isFunction = [];
    for (let y = 0; y < size; y++) { modules.push(new Array(size).fill(false)); isFunction.push(new Array(size).fill(false)); }
    drawFunctionPatterns(version, size, modules, isFunction);
    drawCodewords(allCodewords, size, modules, isFunction);
    applyMask(mask, size, modules, isFunction);
    const penalty = getPenaltyScore(size, modules);
    if (penalty < bestPenalty) { bestPenalty = penalty; bestMask = mask; bestModules = modules; }
  }
  // Fill the format info with the chosen mask (drawn after mask selection per ISO 18004 §7.9).
  const finalIsFunction = [];
  for (let y = 0; y < size; y++) {
    const row = new Array(size);
    for (let x = 0; x < size; x++) row[x] = false;
    finalIsFunction.push(row);
  }
  drawFormatBits(ecl, bestMask, size, bestModules, finalIsFunction);
  return { size, version, mask: bestMask, ecl, mode, matrix: bestModules };
}

// ---------- renderers ----------
function bytesToBase64(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = i + 1 < bytes.length ? bytes[i + 1] : 0, b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += alphabet[b0 >> 2];
    out += alphabet[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? alphabet[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? alphabet[b2 & 63] : '=';
  }
  return out;
}
function adler32(bytes) {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
function crc32Uint(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function zlibStore(data) {
  const out = [0x78, 0x01]; // zlib header
  const BLOCK = 65535;
  for (let i = 0; i < data.length; i += BLOCK) {
    const end = Math.min(i + BLOCK, data.length);
    const len = end - i;
    out.push(end >= data.length ? 1 : 0); // BFINAL (BTYPE=00 stored)
    out.push(len & 255, (len >> 8) & 255);
    out.push((~len) & 255, ((~len) >> 8) & 255);
    for (let j = i; j < end; j++) out.push(data[j]);
  }
  const a = adler32(data);
  out.push((a >>> 24) & 255, (a >>> 16) & 255, (a >>> 8) & 255, a & 255);
  return out;
}
function pngEncode(width, height, getPixel) {
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter type 0
    for (let x = 0; x < width; x++) { const p = getPixel(x, y); raw.push(p[0], p[1], p[2], p[3]); }
  }
  const zdata = zlibStore(raw);
  function chunk(type, data) {
    const out = [];
    const len = data.length;
    out.push((len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255);
    for (let i = 0; i < 4; i++) out.push(type.charCodeAt(i));
    for (let i = 0; i < data.length; i++) out.push(data[i]);
    const crcIn = [];
    for (let i = 0; i < 4; i++) crcIn.push(type.charCodeAt(i));
    for (let i = 0; i < data.length; i++) crcIn.push(data[i]);
    const crc = crc32Uint(crcIn);
    out.push((crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255);
    return out;
  }
  const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  const ihdr = [(width >>> 24) & 255, (width >>> 16) & 255, (width >>> 8) & 255, width & 255,
    (height >>> 24) & 255, (height >>> 16) & 255, (height >>> 8) & 255, height & 255,
    8, 6, 0, 0, 0]; // 8-bit RGBA
  const all = sig.concat(chunk('IHDR', ihdr), chunk('IDAT', zdata), chunk('IEND', []));
  return new Uint8Array(all);
}
function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function renderAscii(matrix, border) {
  const n = matrix.length;
  const pad = ' '.repeat(border * 2);
  const blank = ' '.repeat((n + border * 2) * 2);
  const rows = [];
  for (let i = 0; i < border; i++) rows.push(blank);
  for (let y = 0; y < n; y++) {
    let line = pad;
    for (let x = 0; x < n; x++) line += matrix[y][x] ? '\u2588\u2588' : '  ';
    rows.push(line + pad);
  }
  for (let i = 0; i < border; i++) rows.push(blank);
  return rows.join('\n');
}
function renderSvg(matrix, opts) {
  const scale = opts.scale || 4;
  const border = opts.border || 4;
  const n = matrix.length;
  const dim = (n + border * 2) * scale;
  const fg = opts.fg || '#000000';
  const bg = opts.bg || '#ffffff';
  let rects = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (matrix[y][x]) rects += '<rect x="' + (x + border) * scale + '" y="' + (y + border) * scale + '" width="' + scale + '" height="' + scale + '"/>';
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + dim + '" height="' + dim + '" viewBox="0 0 ' + dim + ' ' + dim + '" shape-rendering="crispEdges"><rect width="' + dim + '" height="' + dim + '" fill="' + bg + '"/>' + rects + '</svg>';
}
function renderPngDataUrl(matrix, opts) {
  const scale = opts.scale || 4;
  const border = opts.border || 4;
  const n = matrix.length;
  const dim = (n + border * 2) * scale;
  const fg = hexToRgb(opts.fg || '#000000') || [0, 0, 0];
  const bg = hexToRgb(opts.bg || '#ffffff') || [255, 255, 255];
  const bytes = pngEncode(dim, dim, function (x, y) {
    const mx = Math.floor(x / scale) - border;
    const my = Math.floor(y / scale) - border;
    const dark = mx >= 0 && my >= 0 && mx < n && my < n && matrix[my][mx];
    return dark ? [fg[0], fg[1], fg[2], 255] : [bg[0], bg[1], bg[2], 255];
  });
  return 'data:image/png;base64,' + bytesToBase64(bytes);
}


const ECL_NAMES = { L: 0, M: 1, Q: 2, H: 3 };

function compute(args) {
  const text = args && args.text != null ? String(args.text) : '';
  if (text === '') throw new Error('text is required (the content to encode)');
  const eclKey = args && args.ecl ? String(args.ecl).toUpperCase() : 'M';
  const ecl = ECL_NAMES[eclKey] !== undefined ? ECL_NAMES[eclKey] : 1;
  const format = args && args.format ? String(args.format).toLowerCase() : 'svg';
  const scale = (args && args.scale != null && args.scale !== '') ? Math.max(1, Math.min(32, Math.floor(Number(args.scale)))) : 4;
  const border = (args && args.border != null && args.border !== '') ? Math.max(0, Math.min(16, Math.floor(Number(args.border)))) : 4;
  const fg = args && args.fg ? String(args.fg) : '#000000';
  const bg = args && args.bg ? String(args.bg) : '#ffffff';
  const maskRaw = (args && args.mask != null && args.mask !== '') ? Math.floor(Number(args.mask)) : -1;
  const mask = (maskRaw >= 0 && maskRaw <= 7) ? maskRaw : -1;
  const qr = encode(text, { ecl: ecl, version: 0, mask: mask });
  const ro = { scale: scale, border: border, fg: fg, bg: bg };
  if (format === 'ascii') return { format: 'ascii', output: renderAscii(qr.matrix, Math.max(1, Math.min(8, border))) };
  if (format === 'png') return { format: 'png', output: renderPngDataUrl(qr.matrix, ro) };
  return { format: 'svg', output: renderSvg(qr.matrix, ro) };
}

function run(args) {
  try {
    const r = compute(args);
    return { ok: true, format: r.format, output: r.output };
  } catch (e) {
    return { ok: false, format: '', error: String((e && e.message) || e) };
  }
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'qrcode',
    description: 'Generate a QR code offline (pure local computation, no network, no shell, cross-platform). ' +
      'Encodes the given text (a URL, a WIFI: string, contact info, or any text) into a QR code. ' +
      'format: "svg" (default; scalable vector markup you can save to a .svg file), "ascii" (terminal preview), or "png" (base64 data URL). ' +
      'ecl: error correction level L/M/Q/H (default M, higher = more damage tolerance). ' +
      'scale: module pixel size for svg/png (default 4). border: quiet-zone width in modules (default 4). ' +
      'fg/bg: hex foreground/background colors (default #000000 / #ffffff). mask: optional 0-7 to force a mask (omit for auto).',
    parameters: {
      text: { type: 'string', required: true, description: 'The content to encode into the QR code.' },
      format: { type: 'string', description: 'Output format.', enum: ['svg', 'ascii', 'png'] },
      ecl: { type: 'string', description: 'Error correction level.', enum: ['L', 'M', 'Q', 'H'] },
      scale: { type: 'integer', description: 'Module pixel size for svg/png (default 4).' },
      border: { type: 'integer', description: 'Quiet-zone width in modules (default 4).' },
      fg: { type: 'string', description: 'Foreground color hex, e.g. #000000.' },
      bg: { type: 'string', description: 'Background color hex, e.g. #ffffff.' },
      mask: { type: 'integer', description: 'Force data mask 0-7 (omit to auto-select the best mask).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          format: { type: 'string' },
          output: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: function (args, value) {
        if (!value.ok) return [{ type: 'text', text: 'qrcode error: ' + value.error }];
        if (value.format === 'png') {
          return [{ type: 'text', text: 'QR code PNG generated (' + value.output.length + '-char data URL). To save a file the agent can write, use format=svg and write the returned markup to a .svg file.' }];
        }
        return [{ type: 'text', text: value.output }];
      },
    },
    execute: async function (args) {
      return run(args);
    },
  }));
}
