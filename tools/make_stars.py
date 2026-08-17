"""Generate the night sky that sits behind the bookcase.

Writes img/stars.svg: a seamlessly tiling starfield of hand-drawn-looking
five-pointed stars, scattered dust, and the occasional shooting star.

Procedural rather than a photograph, so it stays sharp on any screen,
adds nothing to download, and works offline. The seed is fixed, so
re-running this produces exactly the same sky.

    python tools/make_stars.py
"""

import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "img")

W, H = 500, 760          # tile size in CSS pixels
SEED = 20260817
MARGIN = 30              # how close to an edge before we duplicate for the wrap

rng = random.Random(SEED)


def star_path(cx, cy, radius, rotation, wobble=0.14):
    """A five-pointed star. Each vertex is nudged slightly so the result
    looks drawn by hand rather than struck from a template."""
    inner = radius * 0.42
    pts = []
    for i in range(10):
        ang = rotation + i * math.pi / 5
        r = radius if i % 2 == 0 else inner
        r *= 1 + rng.uniform(-wobble, wobble)
        pts.append((cx + r * math.sin(ang), cy - r * math.cos(ang)))
    d = "M%.1f %.1f" % pts[0]
    for p in pts[1:]:
        d += "L%.1f %.1f" % p
    return d + "Z"


def shooting_star(x, y, length, angle):
    """A thin curved streak, bowed slightly so it reads as motion."""
    x2 = x + length * math.cos(angle)
    y2 = y + length * math.sin(angle)
    # control point pushed perpendicular to the line to bow the curve
    mx, my = (x + x2) / 2, (y + y2) / 2
    bow = length * 0.10
    cx = mx + bow * math.cos(angle - math.pi / 2)
    cy = my + bow * math.sin(angle - math.pi / 2)
    return "M%.1f %.1f Q%.1f %.1f %.1f %.1f" % (x, y, cx, cy, x2, y2)


def wrapped(x, y):
    """Every position this element also needs to be drawn at so the tile
    joins up with itself on all four sides."""
    xs = [x]
    ys = [y]
    if x < MARGIN:
        xs.append(x + W)
    elif x > W - MARGIN:
        xs.append(x - W)
    if y < MARGIN:
        ys.append(y + H)
    elif y > H - MARGIN:
        ys.append(y - H)
    return [(a, b) for a in xs for b in ys]


def main():
    os.makedirs(OUT, exist_ok=True)
    parts = []

    # Dust: the fine speckle that gives the sky its depth.
    dust = []
    for _ in range(300):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(0.4, 1.5)
        o = rng.uniform(0.25, 0.95)
        for px, py in wrapped(x, y):
            dust.append('<circle cx="%.1f" cy="%.1f" r="%.1f" opacity="%.2f"/>'
                        % (px, py, r, o))
    parts.append("<g fill='#fff'>" + "".join(dust) + "</g>")

    # Stars proper, in three sizes so the field has some hierarchy.
    stars = []
    for count, lo, hi, op_lo, op_hi in (
        (46, 4.0, 7.5, 0.55, 0.9),
        (24, 8.0, 13.0, 0.75, 1.0),
        (9, 14.0, 20.0, 0.9, 1.0),
    ):
        for _ in range(count):
            x, y = rng.uniform(0, W), rng.uniform(0, H)
            radius = rng.uniform(lo, hi)
            rot = rng.uniform(0, math.pi * 2)
            op = rng.uniform(op_lo, op_hi)
            for px, py in wrapped(x, y):
                stars.append('<path d="%s" opacity="%.2f"/>'
                             % (star_path(px, py, radius, rot), op))
    parts.append("<g fill='#fff'>" + "".join(stars) + "</g>")

    # Two streaks, kept sparse — they are the detail you notice second.
    streaks = []
    for _ in range(2):
        x, y = rng.uniform(60, W - 60), rng.uniform(60, H - 60)
        length = rng.uniform(70, 110)
        angle = rng.uniform(0.5, 1.0) * rng.choice([1, -1])
        for px, py in wrapped(x, y):
            streaks.append('<path d="%s"/>' % shooting_star(px, py, length, angle))
    parts.append(
        "<g fill='none' stroke='#fff' stroke-width='1.6' stroke-linecap='round' opacity='0.85'>"
        + "".join(streaks) + "</g>"
    )

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
        'viewBox="0 0 %d %d">' % (W, H, W, H)
        + "".join(parts)
        + "</svg>"
    )

    path = os.path.join(OUT, "stars.svg")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(svg)
    print("wrote %s  %d bytes" % (path, len(svg)))


if __name__ == "__main__":
    main()
