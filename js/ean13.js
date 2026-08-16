/* ============================================================
   ean13.js — a self-contained EAN-13 barcode reader.

   Every book barcode is an EAN-13 whose digits are the ISBN. No
   library, no CDN, no network: we binarize one horizontal line of
   pixels, measure the widths of the black/white runs, and match those
   runs against the 10 digit patterns.

   Structure of the symbol (95 modules):
     start guard 101 | 6 digits (L or G) | centre 01010 | 6 digits (R) | end 101
   The parity pattern of the first six digits encodes the 13th digit,
   which is never printed as bars.
   ============================================================ */

var EAN13 = (function () {

  /* Each digit is four runs whose widths sum to 7 modules.
     Left-hand "L" digits start with a white run; right-hand "R"
     digits are the colour inverse and so share these same widths. */
  var L = [
    [3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2],
    [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2]
  ];
  /* "G" digits are L reversed — that mirroring is what carries parity. */
  var G = L.map(function (p) { return p.slice().reverse(); });

  var GUARD  = [1, 1, 1];
  var CENTRE = [1, 1, 1, 1, 1];

  /* Bitmask of which of the six left digits used G encoding, MSB first,
     indexed by the leading digit it implies. */
  var FIRST_DIGIT = [0x00, 0x0B, 0x0D, 0x0E, 0x13, 0x19, 0x1C, 0x15, 0x16, 0x1A];

  var MAX_AVG_VARIANCE = 0.44;   // mean width error tolerated, in modules
  var MAX_IND_VARIANCE = 0.70;   // worst single run error tolerated

  /* ── binarization ─────────────────────────────────────────────
     A single global threshold falls apart under the uneven lighting
     of a phone held over a book, so compare each pixel to the mean of
     a window around it. Prefix sums keep that O(width). */
  function toRuns(row, width) {
    var min = 255, max = 0, i;
    for (i = 0; i < width; i++) {
      var v = row[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (max - min < 26) return null;        // flat: no barcode here

    var pre = new Int32Array(width + 1);
    for (i = 0; i < width; i++) pre[i + 1] = pre[i] + row[i];

    var win = Math.max(15, width >> 4);
    var half = win >> 1;
    var bias = Math.max(4, (max - min) * 0.06);

    var lens = [];
    var firstBlack = false;
    var runLen = 0;
    var cur = null;

    for (i = 0; i < width; i++) {
      var a = i - half; if (a < 0) a = 0;
      var b = i + half; if (b > width - 1) b = width - 1;
      var mean = (pre[b + 1] - pre[a]) / (b - a + 1);
      var black = row[i] < mean - bias;

      if (cur === null) {
        cur = black;
        firstBlack = black;
        runLen = 1;
      } else if (black === cur) {
        runLen++;
      } else {
        lens.push(runLen);
        cur = black;
        runLen = 1;
      }
    }
    lens.push(runLen);

    if (lens.length < 59) return null;      // a full symbol is 59 runs
    return { lens: lens, firstBlack: firstBlack };
  }

  /* Mean per-run deviation from a pattern, normalized so the result is
     scale independent. Infinity means "not this pattern". */
  function variance(lens, offset, pattern) {
    var n = pattern.length;
    if (offset + n > lens.length) return Infinity;

    var total = 0, patTotal = 0, i;
    for (i = 0; i < n; i++) { total += lens[offset + i]; patTotal += pattern[i]; }
    if (total < patTotal) return Infinity;  // under one pixel per module

    var unit = total / patTotal;
    var maxInd = unit * MAX_IND_VARIANCE;
    var sum = 0;
    for (i = 0; i < n; i++) {
      var d = Math.abs(lens[offset + i] - pattern[i] * unit);
      if (d > maxInd) return Infinity;
      sum += d;
    }
    return sum / total;
  }

  function bestDigit(lens, offset, useG) {
    var best = -1, bestV = MAX_AVG_VARIANCE, bestG = false, d;
    for (d = 0; d < 10; d++) {
      var v = variance(lens, offset, L[d]);
      if (v < bestV) { bestV = v; best = d; bestG = false; }
      if (useG) {
        var g = variance(lens, offset, G[d]);
        if (g < bestV) { bestV = g; best = d; bestG = true; }
      }
    }
    return best < 0 ? null : { digit: best, g: bestG };
  }

  function checksum(code) {
    var sum = 0;
    for (var i = 0; i < 12; i++) sum += (+code[i]) * (i % 2 ? 3 : 1);
    return ((10 - (sum % 10)) % 10) === +code[12];
  }

  /* Attempt a full symbol starting at the guard bar `start`. */
  function decodeFrom(lens, start) {
    var idx = start + 3;
    var digits = [];
    var parity = 0;
    var k, m;

    for (k = 0; k < 6; k++) {
      m = bestDigit(lens, idx, true);
      if (!m) return null;
      digits.push(m.digit);
      if (m.g) parity |= 1 << (5 - k);
      idx += 4;
    }

    if (variance(lens, idx, CENTRE) === Infinity) return null;
    idx += 5;

    for (k = 0; k < 6; k++) {
      m = bestDigit(lens, idx, false);
      if (!m) return null;
      digits.push(m.digit);
      idx += 4;
    }

    /* The end guard may be clipped by the frame edge; demand it only
       when there are runs left to check. */
    if (idx + 2 < lens.length && variance(lens, idx, GUARD) === Infinity) return null;
    if (idx >= lens.length) return null;

    var first = FIRST_DIGIT.indexOf(parity);
    if (first < 0) return null;

    var code = String(first) + digits.join('');
    return checksum(code) ? code : null;
  }

  function scanRuns(lens, firstBlack) {
    for (var i = 0; i + 58 < lens.length; i++) {
      var isBlack = firstBlack ? (i % 2 === 0) : (i % 2 === 1);
      if (!isBlack) continue;                       // guards start on a bar
      if (variance(lens, i, GUARD) === Infinity) continue;
      /* Insist on a quiet zone in front of the guard, which rejects
         most of the false starts inside cover artwork. */
      if (i > 0) {
        var guardWidth = lens[i] + lens[i + 1] + lens[i + 2];
        if (lens[i - 1] < guardWidth * 0.8) continue;
      }
      var code = decodeFrom(lens, i);
      if (code) return code;
    }
    return null;
  }

  /* Both scan directions off one binarization, so an upside-down book
     reads as happily as a right-way-up one. */
  function bothWays(r) {
    var code = scanRuns(r.lens, r.firstBlack);
    if (code) return code;

    var n = r.lens.length;
    var lastBlack = r.firstBlack ? ((n - 1) % 2 === 0) : ((n - 1) % 2 === 1);
    return scanRuns(r.lens.slice().reverse(), lastBlack);
  }

  /* A speck of noise splits one run into three. Drop runs far shorter
     than a module and stitch their neighbours back together. The
     threshold comes from the median run, so it scales with the print. */
  function despeckle(r) {
    var sorted = r.lens.slice().sort(function (a, b) { return a - b; });
    var median = sorted[sorted.length >> 1];
    var min = median / 3;
    if (min < 1.5) return null;                 // nothing is short enough to be noise

    var lens = [], first = r.firstBlack, i;
    for (i = 0; i < r.lens.length; i++) {
      var len = r.lens[i];
      if (len >= min || lens.length === 0 || i === r.lens.length - 1) {
        lens.push(len);
        continue;
      }
      /* Absorb the speck and the run after it into the run before it. */
      lens[lens.length - 1] += len + r.lens[i + 1];
      i++;
    }
    return lens.length === r.lens.length ? null : { lens: lens, firstBlack: first };
  }

  function attempt(row, width) {
    var r = toRuns(row, width);
    if (!r) return null;

    var code = bothWays(r);
    if (code) return code;

    var d = despeckle(r);
    return d && d.lens.length >= 59 ? bothWays(d) : null;
  }

  /* Sensor noise near the threshold splits one run into three. A 1-2-1
     blur fixes that, but it also erases barcodes printed close to one
     pixel per module — so it is a second chance, never the first. */
  function smooth(row, width) {
    var out = new Uint8Array(width);
    out[0] = row[0];
    out[width - 1] = row[width - 1];
    for (var i = 1; i < width - 1; i++) {
      out[i] = (row[i - 1] + row[i] * 2 + row[i + 1]) >> 2;
    }
    return out;
  }

  function decodeLine(row, width) {
    return attempt(row, width) || attempt(smooth(row, width), width);
  }

  /* Sweep evenly spaced lines across a greyscale buffer. Middle lines
     first: that is where a centred barcode actually is. */
  function scan(gray, width, height, lines) {
    lines = lines || 16;
    var order = [];
    for (var t = 0; t < lines; t++) order.push(t);
    order.sort(function (a, b) {
      return Math.abs(a - (lines - 1) / 2) - Math.abs(b - (lines - 1) / 2);
    });

    for (var i = 0; i < order.length; i++) {
      var y = Math.min(height - 1, Math.round((order[i] + 0.5) * height / lines));
      var row = gray.subarray ? gray.subarray(y * width, y * width + width)
                              : gray.slice(y * width, y * width + width);
      var code = decodeLine(row, width);
      if (code) return code;
    }
    return null;
  }

  return { scan: scan, decodeLine: decodeLine, checksum: checksum };
})();
