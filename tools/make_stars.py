"""Generate the night sky that sits behind the bookcase.

Writes img/stars.svg: a deep-space field — fine dust, scattered stars,
a handful of bright ones with diffraction spikes, and faint nebula.

Procedural rather than a photograph, so it stays sharp on any screen,
adds no image download, and works offline. The seed is fixed, so
re-running this produces exactly the same sky.

    python tools/make_stars.py

Tuning, roughly in order of how much it changes the look:
    DUST        how grainy the field is
    BRIGHT      how many spiked stars catch the eye
    NEBULA      how much cloud shows through
"""

import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "img")

W, H = 600, 900          # tile size in CSS pixels
SEED = 20260817

DUST = 820               # the fine grain
MID = 80                 # small stars with a soft halo
BRIGHT = 15              # stars with spikes
NEBULA = 5               # cloud patches

MARGIN = 40              # duplicate near an edge so the tile wraps

# Starlight isn't white. Most stars read neutral, some blue, a few warm.
STAR_COLOURS = (
    ["#ffffff"] * 10 +
    ["#dce8ff"] * 5 +
    ["#bcd4ff"] * 3 +
    ["#ffe8cf"] * 2 +
    ["#ffd8c0"]
)

rng = random.Random(SEED)


def wrapped(x, y, margin=MARGIN):
    """Every position an element must also be drawn at for the tile to
    join up with itself on all four sides."""
    xs = [x]
    ys = [y]
    if x < margin:
        xs.append(x + W)
    elif x > W - margin:
        xs.append(x - W)
    if y < margin:
        ys.append(y + H)
    elif y > H - margin:
        ys.append(y - H)
    return [(a, b) for a in xs for b in ys]


def spike(cx, cy, length, width):
    """One arm-pair of a diffraction flare: a long thin diamond that
    tapers to a point, which is what sells the sparkle."""
    return ("M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f Z"
            % (cx - length, cy, cx, cy - width, cx + length, cy, cx, cy + width))


def main():
    os.makedirs(OUT, exist_ok=True)
    parts = []

    # Reusable soft falloff. objectBoundingBox units means one gradient
    # scales itself to every element that references it.
    parts.append(
        '<defs>'
        '<radialGradient id="halo">'
        '<stop offset="0" stop-color="#ffffff" stop-opacity=".42"/>'
        '<stop offset=".35" stop-color="#cfe0ff" stop-opacity=".07"/>'
        '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>'
        '</radialGradient>'
        '<radialGradient id="cloud">'
        '<stop offset="0" stop-color="#46536e" stop-opacity=".075"/>'
        '<stop offset=".55" stop-color="#2c3448" stop-opacity=".03"/>'
        '<stop offset="1" stop-color="#1e2431" stop-opacity="0"/>'
        '</radialGradient>'
        '<radialGradient id="sky">'
        '<stop offset="0" stop-color="#05070E"/>'
        '<stop offset="1" stop-color="#000001"/>'
        '</radialGradient>'
        '</defs>'
    )

    # The ground: essentially black, with only a trace of blue — enough
    # that it reads as sky rather than as an empty div, not so much that
    # it lifts the whole app off true black.
    parts.append('<rect width="%d" height="%d" fill="#000103"/>' % (W, H))
    parts.append('<rect width="%d" height="%d" fill="url(#sky)" opacity=".55"/>' % (W, H))

    # Nebula: large, very faint, irregular. Barely visible on purpose —
    # you should notice depth without being able to point at a cloud.
    clouds = []
    for _ in range(NEBULA):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        rx = rng.uniform(120, 240)
        ry = rx * rng.uniform(0.5, 0.9)
        rot = rng.uniform(0, 180)
        op = rng.uniform(0.3, 0.75)
        for px, py in wrapped(x, y, margin=rx):
            clouds.append(
                '<ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f" fill="url(#cloud)" '
                'opacity="%.2f" transform="rotate(%.0f %.0f %.0f)"/>'
                % (px, py, rx, ry, op, rot, px, py))
    parts.append("".join(clouds))

    # Dust: the grain that makes the field look deep rather than sparse.
    dust = []
    for _ in range(DUST):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(0.22, 0.8)
        o = rng.uniform(0.10, 0.68)
        col = rng.choice(STAR_COLOURS)
        for px, py in wrapped(x, y, margin=4):
            dust.append('<circle cx="%.1f" cy="%.1f" r="%.2f" fill="%s" opacity="%.2f"/>'
                        % (px, py, r, col, o))
    parts.append("".join(dust))

    # Mid stars: a visible point with a soft halo around it.
    mids = []
    for _ in range(MID):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(0.7, 1.5)
        col = rng.choice(STAR_COLOURS)
        halo = r * rng.uniform(2.8, 4.4)
        for px, py in wrapped(x, y, margin=halo):
            mids.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="url(#halo)" opacity=".55"/>'
                        % (px, py, halo))
            mids.append('<circle cx="%.1f" cy="%.1f" r="%.2f" fill="%s"/>' % (px, py, r, col))
    parts.append("".join(mids))

    # Bright stars: halo, four-point flare, then the core on top.
    brights = []
    for _ in range(BRIGHT):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(1.1, 2.0)
        arm = r * rng.uniform(8.0, 15.0)
        # Delicate, but not sub-pixel — below about 0.5px a spike stops
        # being a faint line and starts being invisible.
        width = max(0.45, r * rng.uniform(0.20, 0.32))
        halo = r * rng.uniform(3.5, 5.5)
        col = rng.choice(STAR_COLOURS)
        op = rng.uniform(0.5, 0.85)
        for px, py in wrapped(x, y, margin=max(halo, arm)):
            brights.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="url(#halo)"/>'
                           % (px, py, halo))
            brights.append('<g fill="%s" opacity="%.2f">' % (col, op)
                           + '<path d="%s"/>' % spike(px, py, arm, width)
                           # the vertical arm is the horizontal one turned 90°
                           + '<path d="%s" transform="rotate(90 %.1f %.1f)"/>'
                           % (spike(px, py, arm * rng.uniform(0.8, 1.1), width), px, py)
                           + '</g>')
            brights.append('<circle cx="%.1f" cy="%.1f" r="%.2f" fill="#ffffff"/>' % (px, py, r))
    parts.append("".join(brights))

    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
           'viewBox="0 0 %d %d">' % (W, H, W, H)
           + "".join(parts) + "</svg>")

    path = os.path.join(OUT, "stars.svg")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(svg)
    print("wrote %s  %.1f KB  (%d dust, %d mid, %d bright, %d cloud)"
          % (path, len(svg) / 1024.0, DUST, MID, BRIGHT, NEBULA))


if __name__ == "__main__":
    main()
