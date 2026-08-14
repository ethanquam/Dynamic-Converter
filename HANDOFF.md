# Dynamic Converter v1 — Session Handoff

Last updated: August 13, 2026

## Project location

```
C:\Users\equam\Projects\dynamic-converter-v1
```

## Live site

- **App:** https://ethanquam.github.io/Dynamic-Converter/
- **GitHub repo:** https://github.com/ethanquam/Dynamic-Converter
- **Upload updated files:** https://github.com/ethanquam/Dynamic-Converter/upload/main

GitHub Pages is enabled: **Deploy from branch → main → / (root)**

After uploading, hard refresh: **Ctrl + Shift + R**

---

## What's done

- Vanilla HTML/CSS/JS surveying tool (no build step)
- Length converter, volume converter, point-to-point distance, grade-plane adjustment
- Trimble CSV import/export (P, N, E, Z, D)
- 3D views with orbit/zoom/fullscreen (Three.js via CDN)
- Mobile-friendly layout
- **Load example data** buttons (sample alignment + grade scenarios)
- **Clear data** buttons (both workflows)
- Example data in `js/example-data.js`

---

## Pick up here (next session)

### 1. Re-upload latest fixes (if not done yet)

These files had button styling + reliability fixes after the live site looked wrong:

| File | Why |
|------|-----|
| `index.html` | Button layout (`btn-panel-action`) |
| `css/styles.css` | Matching green/gray button styles |
| `js/point-distance.js` | Clear/example handlers + 3D fallback |
| `js/plane-grade.js` | Same |
| `js/example-data.js` | Example point data (if missing on GitHub) |

### 2. Verify on live site

1. Open https://ethanquam.github.io/Dynamic-Converter/
2. Hard refresh (Ctrl + Shift + R)
3. Scroll to **Point-to-Point Distance** → click **Load example data**
4. Points table should appear; distances and 3D view should update
5. Click **Clear data** → table clears

Repeat for **Adjust Points to Horizontal Plane**.

### 3. Optional future work (discussed, not started)

- Install **Git for Windows** to push updates from Cursor instead of web upload
- README on GitHub repo
- Google Sites embed (needs live URL — already have it)
- PWA / home-screen install
- Password protection (not supported on free GitHub Pages; would need different hosting)

---

## How to run locally

Open `index.html` in a browser, or use Cursor's Simple Browser.

**Note:** ES modules and 3D views need HTTPS or localhost — `file://` may block modules in some browsers. GitHub Pages or a local server is best.

---

## File map

```
dynamic-converter-v1/
├── index.html
├── HANDOFF.md          ← this file
├── css/styles.css
├── js/
│   ├── units.js
│   ├── csv-import.js
│   ├── example-data.js
│   ├── converter.js
│   ├── volume-converter.js
│   ├── point-distance.js
│   ├── plane-grade.js
│   ├── distance-view3d.js
│   ├── plane-view3d.js
│   ├── view3d-ui.js
│   └── vertical-plane.js
└── .github/workflows/deploy-pages.yml  (optional; using branch deploy instead)
```

---

## Git status

- Git is **not installed** on this PC (or not in PATH) as of last session
- Repo on GitHub was populated via **web upload** (not git push)
- Repo is **public**; site is live but not easily discoverable without the URL

---

## Quick resume prompt for Cursor

Copy this into a new chat to continue:

> I'm continuing work on Dynamic Converter v1 at `C:\Users\equam\Projects\dynamic-converter-v1`. Read `HANDOFF.md` for context. The live site is https://ethanquam.github.io/Dynamic-Converter/
