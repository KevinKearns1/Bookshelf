"""Generate the app icons.

Pure standard library: builds an RGB buffer at 2x and box-filters it down
for anti-aliasing, then writes a PNG by hand (zlib + struct). No Pillow,
no build step -- run it only when the icon design changes.

    python tools/make_icons.py
"""

import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "icons")

WOOD_DARK = (0x3E, 0x2A, 0x1C)
WOOD      = (0x8B, 0x5E, 0x3C)
WOOD_LIP  = (0xA9, 0x76, 0x4E)
GOLD      = (0xD9, 0xA4, 0x41)
BOOKS = [(0x8C, 0x2F, 0x39), (0xD9, 0xA4, 0x41), (0x2F, 0x60, 0x70), (0x6F, 0x7F, 0x4F)]


class Canvas:
    def __init__(self, size, bg):
        self.n = size
        self.px = bytearray(bg * (size * size))

    def rect(self, x0, y0, x1, y1, color, radius=0.0):
        """Coordinates are 0..1 fractions of the canvas."""
        n = self.n
        px0, py0 = int(x0 * n), int(y0 * n)
        px1, py1 = int(x1 * n), int(y1 * n)
        r = radius * n
        for y in range(max(0, py0), min(n, py1)):
            for x in range(max(0, px0), min(n, px1)):
                if r > 0 and not self._inside_round(x, y, px0, py0, px1, py1, r):
                    continue
                i = (y * n + x) * 3
                self.px[i:i + 3] = bytes(color)

    @staticmethod
    def _inside_round(x, y, x0, y0, x1, y1, r):
        cx = x0 + r if x < x0 + r else (x1 - 1 - r if x > x1 - 1 - r else x)
        cy = y0 + r if y < y0 + r else (y1 - 1 - r if y > y1 - 1 - r else y)
        if cx == x and cy == y:
            return True
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

    def downsample(self, factor):
        n = self.n // factor
        out = bytearray(n * n * 3)
        f2 = factor * factor
        for y in range(n):
            for x in range(n):
                r = g = b = 0
                for dy in range(factor):
                    row = (y * factor + dy) * self.n
                    for dx in range(factor):
                        i = (row + x * factor + dx) * 3
                        r += self.px[i]
                        g += self.px[i + 1]
                        b += self.px[i + 2]
                o = (y * n + x) * 3
                out[o] = r // f2
                out[o + 1] = g // f2
                out[o + 2] = b // f2
        return n, bytes(out)


def write_png(path, size, rgb):
    raw = b"".join(b"\x00" + rgb[y * size * 3:(y + 1) * size * 3] for y in range(size))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as fh:
        fh.write(png)
    return len(png)


def draw(size, inset):
    """A short row of books on a shelf. `inset` shrinks the art so the
    maskable version survives a circular crop."""
    ss = 2
    c = Canvas(size * ss, WOOD_DARK)

    def m(v):                      # map 0..1 art space into the safe area
        return inset + v * (1 - 2 * inset)

    # back panel, slightly lighter than the frame
    c.rect(m(0.06), m(0.06), m(0.94), m(0.94), (0x55, 0x3A, 0x26), radius=0.03)

    # four spines of assorted height, standing on the plank
    base = m(0.78)
    spines = [(0.16, 0.30, 0.30), (0.32, 0.46, 0.20), (0.48, 0.62, 0.36), (0.64, 0.80, 0.26)]
    for (x0, x1, h), color in zip(spines, BOOKS):
        top = base - h * (1 - 2 * inset)
        c.rect(m(x0), top, m(x1), base, color, radius=0.012)
        # foil bands
        c.rect(m(x0) + 0.012, top + 0.045, m(x1) - 0.012, top + 0.055, GOLD)
        c.rect(m(x0) + 0.012, base - 0.075, m(x1) - 0.012, base - 0.065, GOLD)

    # shelf plank
    c.rect(m(0.08), base, m(0.92), base + 0.035, WOOD_LIP)
    c.rect(m(0.08), base + 0.018, m(0.92), base + 0.055, WOOD)

    n, rgb = c.downsample(ss)
    return n, rgb


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ("icon-192.png", 192, 0.06),
        ("icon-512.png", 512, 0.06),
        ("icon-maskable-512.png", 512, 0.14),
        ("apple-touch-icon.png", 180, 0.06),
    ]
    for name, size, inset in jobs:
        n, rgb = draw(size, inset)
        nbytes = write_png(os.path.join(OUT, name), n, rgb)
        print("wrote %-24s %4dpx  %5d bytes" % (name, n, nbytes))


if __name__ == "__main__":
    main()
