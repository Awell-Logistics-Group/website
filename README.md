# AWELL Logistics Group website

Static site, English + Chinese. Dark theme; homepage first screen has a placeholder background (see the comment in `index.html` to swap in a video).

## Files

- `index.html` — all page content. Every piece of text has an English copy (`class="en"`) and a Chinese copy (`class="zh"`). Change both together.
- `quote.html` — quote request page. The form sends to imports@awellus.com through Web3Forms (free, 250 submissions/month). The access key is `WEB3FORMS_KEY` near the bottom of the file; the receiving address is whichever email the key was created with.
- `site.js` — shared script for both pages: language switch, photo zoom, copy buttons.
- `styles.css` — design. Brand colors are at the top in `:root`.
- `logo-light.png` — logo recoloured for the dark background (used on every page). `logo.png` is the original.
- `network.js` — starts the map animation on the homepage when it scrolls into view.
- `favicon.svg` — browser tab icon.
- `terms-and-conditions.pdf` — terms from the old site.
- `photos/` — real cargo photos.
- `vendor/` — Simplified → Traditional converter (only loaded when 繁 is selected).

## Language

- Three languages: English (`en`), Simplified Chinese (`zh`), Traditional Chinese (`zht`).
- Only English and Simplified are written in `index.html`. Traditional is converted automatically from Simplified (Hong Kong standard) by `vendor/opencc-cn2t.js` (OpenCC, MIT license).
- Visitors get a language based on their browser: Hong Kong / Taiwan / Macau → Traditional, other Chinese → Simplified, everything else → English.
- The EN / 简 / 繁 switch in the top-right changes language and remembers the choice.
- Direct links: `?lang=en`, `?lang=zh` or `?lang=zht` at the end of the URL.

## Preview locally

Double-click `index.html`, or in PowerShell inside this folder:

```
python -m http.server 8000
```

then open http://localhost:8000
