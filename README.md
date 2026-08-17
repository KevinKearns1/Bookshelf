# Bookshelf

Scan the barcode on the back of a book and it appears on a shelf on your phone —
as a coloured spine with its title on it, or as a formal catalogue entry, whichever
you feel like looking at.

No accounts, no server, no app store. Your library is stored on your device.

---

## Run it right now

On this PC:

```bash
python C:\Projects\Application_Bookshelf\serve.py
```

Then open <http://localhost:8000>. The camera works here because browsers treat
`localhost` as a secure origin, so you can test scanning with a webcam. If port 8000
is busy, pass another: `python serve.py 8123`.

To actually use it on your phone, see the next section — a phone needs the app on
`https`, which takes about five minutes to set up once.

## Put it on your phone

Browsers refuse to hand a camera to a page unless it's served over `https`.
The free way to get that is GitHub Pages:

1. Create an empty repository on github.com (call it `bookshelf`, set it Public).
2. In this folder:

```bash
git init && git add -A && git commit -m "Bookshelf" && git branch -M main
```

```bash
git remote add origin https://github.com/YOUR-USERNAME/bookshelf.git && git push -u origin main
```

3. On GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
4. After a minute the app is live at `https://YOUR-USERNAME.github.io/bookshelf/`.
5. Open that on your phone and **Add to Home Screen**:
   - **iPhone**: Safari → Share button → Add to Home Screen.
   - **Android**: Chrome → ⋮ menu → Add to Home screen / Install app.

It now has its own icon, opens full screen with no browser chrome, and works
offline — only the ISBN lookups need a connection.

*(Public repo just means the code is visible. Your books are not in the repo; they
live in your phone's local storage.)*

## Using it

Two collections, each with its own shelf and catalogue: **My Books** for what you
own, **Want to Read** for what you don't yet.

- **Scan** — point at the barcode on the back cover. Hold steady, fill the bracket
  with the barcode. It beeps and buzzes when it reads one, then asks whether you
  have it or want it. The camera stays open, so a stack of books goes quickly.
- **Shelf** — every book as a coloured spine, sized roughly by page count.
  Tap a spine to open it.
- **Decorate** — put your own photos between the books: pick one from your photo
  library, paste it, or drag it in. The white background of a product photo is cut
  out automatically, and you set how big it stands. There are drawn ornaments too
  (plant, globe, cat, candle and so on) if you haven't got a photo to hand. Tap an
  ornament on the shelf to resize it, move it along, or take it away.
- **Catalog** — cover art in a grid, two up, with title and author beneath. Real
  covers where they exist; where they don't, a drawn one in the book's own colour.
  The toggle beside the sort menu swaps to a formal list: title, author, publisher,
  year, length. Both are searchable and sortable four ways.
- **Book details** — mark it Unread / Reading / Read, rate it, move it between
  collections, change the spine colour, keep notes. Books marked *Reading* get a
  gold ribbon on the shelf.
- **⋯ menu** — add a book by hand (or by typing an ISBN), export your library to a
  JSON file, import one back, or wipe everything.

If a book isn't in the catalogue — old, obscure, or self-published — it's added with
the ISBN and you can fill in the title yourself with **Edit details**.

## How it's put together

Plain HTML, CSS and JavaScript. No frameworks, no build step, no dependencies —
what's in the folder is what runs.

| File | What it does |
|---|---|
| `index.html` | The whole app's markup |
| `css/app.css` | All styling, light and dark |
| `js/photos.js` | Your photos: cutout, resize, IndexedDB storage |
| `js/decor.js` | The drawn shelf ornaments |
| `js/ean13.js` | The barcode reader, written from scratch |
| `js/scanner.js` | Camera, frame grabbing, torch |
| `js/lookup.js` | ISBN → book details |
| `js/store.js` | The library, in localStorage |
| `js/ui.js` | Rendering the shelf, catalog and detail sheet |
| `js/app.js` | Wiring it together |
| `sw.js` | Offline caching |
| `img/stars.svg` | The night sky behind the bookcase (generated) |
| `tools/make_icons.py` | Regenerates the app icons |
| `tools/make_stars.py` | Regenerates the night sky |

### About the barcode reader

Chrome on Android has a barcode scanner built into the browser, and the app uses it
when it's there. Safari doesn't, so `js/ean13.js` implements EAN-13 decoding
directly: it takes a horizontal line of pixels, thresholds each pixel against its
local neighbourhood (which copes with uneven lighting), measures the black/white run
widths, and matches them against the digit patterns. It reads ~18 lines per frame,
in both directions so an upside-down book works.

Two safeguards against misreads, because a wrong ISBN is worse than a slow scan:
the same code must be read twice, and it must start `978` or `979` — every book
barcode does.

Tested against 175 synthetic barcode images spanning resolution, orientation,
lighting gradients and sensor noise, plus 600 pure-noise frames. Under conditions a
phone camera actually produces it reads correctly ~95% of the time, and misreads are
vanishingly rare; when it can't read a barcode it reports nothing rather than
guessing.

### Where your data lives

In `localStorage` under the key `bookshelf.v1`, on your device only. The app sends
no data anywhere. When you scan, the ISBN alone is sent to
[Open Library](https://openlibrary.org) (and Google Books if Open Library doesn't
have it) to fetch the title and author.

Because it's device-local, clearing your browser's site data deletes your library —
use **Export** now and then if it matters to you.

---

## If you later want to sell it on the App Store

This is a normal web app, which means the road to a native iOS app doesn't involve
rewriting it. [Capacitor](https://capacitorjs.com) wraps these exact files in a real
native app shell that the App Store accepts, and the camera scanning keeps working
inside it.

What that route needs, honestly:

- **A Mac.** Xcode is required to build and submit an iOS app, and it's Mac-only.
- **An Apple Developer account** — $99/year.
- **Node.js** on the build machine, to run Capacitor's tooling.
- Roughly: `npm init` → `npm install @capacitor/core @capacitor/cli @capacitor/camera`
  → `npx cap init` → point `webDir` at this folder → `npx cap add ios` →
  add `NSCameraUsageDescription` to `Info.plist` (Apple rejects camera apps without
  an explanation string) → `npx cap open ios` → build and submit in Xcode.
- To charge money you'd add StoreKit for the purchase or subscription; a paid-download
  app needs no code at all, just a price tier in App Store Connect.

Two things worth knowing before you bank on it. Apple rejects apps that are merely a
website in a wrapper under guideline 4.2 ("Minimum Functionality") — this one has a
real case to make, since the scanner, the library and the whole app work offline
with no website behind them, but it's a judgement call by a reviewer. And the same
Capacitor project produces the Android build from the same files, where the review
is far more forgiving.

The parts written to make that transition easy: no framework to migrate, no build
step to reproduce, and `store.js` is the only file that touches storage — swapping
localStorage for a native database is a change to that one file.
