"""Rasterise img/stars.svg to a PNG so the sky can actually be looked at.

A development aid, not part of the app. The browser renders the SVG for
real; this renders the same primitives well enough to judge density,
brightness and balance without needing a browser window.

Understands only the handful of shapes make_stars.py emits.

    python tools/preview_stars.py [out.png]
"""

import math
import os
import re
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SVG = os.path.join(ROOT, "img", "stars.svg")

# Filled in from the SVG's own <defs>, so the preview cannot drift out
# of step with the generator: {id: [(offset, (r, g, b), alpha), ...]}
GRADIENTS = {}


def parse_gradients(svg):
    for g in re.finditer(r'<radialGradient id="(\w+)">(.*?)</radialGradient>', svg, re.S):
        name, body = g.group(1), g.group(2)
        stops = []
        for s in re.finditer(r"<stop\b[^>]*>", body):
            tag = s.group(0)
            offset = float(attr(tag, "offset", "0"))
            colour = hex_rgb(attr(tag, "stop-color", "#ffffff"))
            alpha = float(attr(tag, "stop-opacity", "1"))
            stops.append((offset, colour, alpha))
        GRADIENTS[name] = sorted(stops)
    return GRADIENTS


def hex_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return (int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0)


def sample(name, t):
    stops = GRADIENTS[name]
    t = max(0.0, min(1.0, t))
    for i in range(len(stops) - 1):
        o0, c0, a0 = stops[i]
        o1, c1, a1 = stops[i + 1]
        if t <= o1:
            f = 0.0 if o1 == o0 else (t - o0) / (o1 - o0)
            col = tuple(c0[k] + (c1[k] - c0[k]) * f for k in range(3))
            return col, a0 + (a1 - a0) * f
    return stops[-1][1], stops[-1][2]


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [0.0] * (w * h * 3)

    def blend(self, x, y, col, alpha):
        if alpha <= 0.0005 or x < 0 or y < 0 or x >= self.w or y >= self.h:
            return
        if alpha > 1.0:
            alpha = 1.0
        i = (y * self.w + x) * 3
        p = self.px
        p[i] += (col[0] - p[i]) * alpha
        p[i + 1] += (col[1] - p[i + 1]) * alpha
        p[i + 2] += (col[2] - p[i + 2]) * alpha

    def to_png(self, path):
        raw = bytearray()
        for y in range(self.h):
            raw.append(0)
            row = self.px[y * self.w * 3:(y + 1) * self.w * 3]
            for v in row:
                raw.append(int(max(0.0, min(1.0, v)) * 255 + 0.5))

        def chunk(tag, data):
            c = struct.pack(">I", len(data)) + tag + data
            return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

        png = (b"\x89PNG\r\n\x1a\n"
               + chunk(b"IHDR", struct.pack(">IIBBBBB", self.w, self.h, 8, 2, 0, 0, 0))
               + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
               + chunk(b"IEND", b""))
        with open(path, "wb") as fh:
            fh.write(png)
        return len(png)


def attr(tag, name, default=None):
    m = re.search(r'%s="([^"]*)"' % name, tag)
    return m.group(1) if m else default


def fnum(tag, name, default=0.0):
    v = attr(tag, name)
    return float(v) if v is not None else default


def draw_disc(c, cx, cy, r, fill, opacity, gradient=None):
    """Circle with a one-pixel soft edge, or a radial falloff."""
    x0, x1 = int(cx - r - 1), int(cx + r + 2)
    y0, y1 = int(cy - r - 1), int(cy + r + 2)
    for y in range(max(0, y0), min(c.h, y1)):
        for x in range(max(0, x0), min(c.w, x1)):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if d > r + 0.7:
                continue
            if gradient:
                col, a = sample(gradient, d / r if r else 1.0)
                c.blend(x, y, col, a * opacity)
            else:
                cover = 1.0 if d <= r - 0.5 else max(0.0, (r + 0.5 - d))
                c.blend(x, y, fill, opacity * min(1.0, cover))


def draw_cloud(c, cx, cy, rx, ry, rot, opacity):
    ca, sa = math.cos(math.radians(-rot)), math.sin(math.radians(-rot))
    x0, x1 = int(cx - rx - 1), int(cx + rx + 2)
    y0, y1 = int(cy - rx - 1), int(cy + rx + 2)
    for y in range(max(0, y0), min(c.h, y1)):
        for x in range(max(0, x0), min(c.w, x1)):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            ux = (dx * ca - dy * sa) / rx
            uy = (dx * sa + dy * ca) / ry
            t = math.hypot(ux, uy)
            if t > 1.0:
                continue
            col, a = sample("cloud", t)
            c.blend(x, y, col, a * opacity)


def draw_poly(c, pts, fill, opacity, samples=4):
    """Coverage-sampled, because a diffraction spike is thinner than a
    pixel: testing one point per pixel drops it entirely, which reads as
    a missing arm rather than as the faint line the browser will draw."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    step = 1.0 / samples
    offsets = [(i + 0.5) * step for i in range(samples)]

    for y in range(max(0, int(min(ys)) - 1), min(c.h, int(max(ys)) + 2)):
        for x in range(max(0, int(min(xs)) - 1), min(c.w, int(max(xs)) + 2)):
            hits = 0
            for oy in offsets:
                py = y + oy
                for ox in offsets:
                    px = x + ox
                    inside = False
                    j = len(pts) - 1
                    for i in range(len(pts)):
                        xi, yi = pts[i]
                        xj, yj = pts[j]
                        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                            inside = not inside
                        j = i
                    if inside:
                        hits += 1
            if hits:
                c.blend(x, y, fill, opacity * hits / (samples * samples))


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "stars-preview.png")
    svg = open(SVG, encoding="utf-8").read()
    parse_gradients(svg)

    W = int(re.search(r'width="(\d+)"', svg).group(1))
    H = int(re.search(r'height="(\d+)"', svg).group(1))
    canvas = Canvas(W, H)

    body = svg[svg.index("</defs>") + 7:]
    group_fill, group_op = (1.0, 1.0, 1.0), 1.0
    counts = {"rect": 0, "ellipse": 0, "circle": 0, "path": 0}

    for m in re.finditer(r"<(rect|circle|ellipse|path|g)\b[^>]*>|</g>", body):
        tag = m.group(0)
        kind = m.group(1)

        if tag == "</g>":
            group_fill, group_op = (1.0, 1.0, 1.0), 1.0
            continue

        if kind == "g":
            group_fill = hex_rgb(attr(tag, "fill", "#ffffff"))
            group_op = float(attr(tag, "opacity", "1"))
            continue

        fill = attr(tag, "fill", "#ffffff")
        op = float(attr(tag, "opacity", "1"))
        grad = None
        gm = re.match(r"url\(#(\w+)\)", fill or "")
        if gm:
            grad = gm.group(1)

        if kind == "rect":
            counts["rect"] += 1
            for y in range(H):
                for x in range(W):
                    if grad:
                        t = math.hypot((x + 0.5 - W / 2) / (W / 2), (y + 0.5 - H / 2) / (H / 2))
                        col, a = sample(grad, t)
                        canvas.blend(x, y, col, a * op)
                    else:
                        canvas.blend(x, y, hex_rgb(fill), op)

        elif kind == "circle":
            counts["circle"] += 1
            draw_disc(canvas, fnum(tag, "cx"), fnum(tag, "cy"), fnum(tag, "r"),
                      None if grad else hex_rgb(fill), op, grad)

        elif kind == "ellipse":
            counts["ellipse"] += 1
            rot = 0.0
            tm = re.search(r"rotate\(([-\d.]+)", tag)
            if tm:
                rot = float(tm.group(1))
            draw_cloud(canvas, fnum(tag, "cx"), fnum(tag, "cy"),
                       fnum(tag, "rx"), fnum(tag, "ry"), rot, op)

        elif kind == "path":
            counts["path"] += 1
            d = attr(tag, "d", "")
            nums = [float(v) for v in re.findall(r"-?\d+\.?\d*", d)]
            pts = [(nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2)]
            tm = re.search(r"rotate\(90 ([\d.]+) ([\d.]+)\)", tag)
            if tm:
                rx, ry = float(tm.group(1)), float(tm.group(2))
                pts = [(rx - (p[1] - ry), ry + (p[0] - rx)) for p in pts]
            draw_poly(canvas, pts, group_fill, group_op)

    size = canvas.to_png(out)
    print("wrote %s  %dx%d  %.1f KB" % (out, W, H, size / 1024.0))
    print("drew: %s" % counts)


if __name__ == "__main__":
    main()
