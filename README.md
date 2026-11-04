# AWELL Logistics Group website

Static one-page site, English + Chinese.

## Files

- `index.html` — all page content. Every piece of text has an English copy (`class="en"`) and a Chinese copy (`class="zh"`). Change both together.
- `styles.css` — design. Brand colors are at the top in `:root`.
- `logo.png` — logo from the old site (small, 117×45). Replace with a high-resolution version if one exists.
- `favicon.svg` — browser tab icon.
- `terms-and-conditions.pdf` — terms from the old site.

## Language

- The page picks Chinese automatically for visitors whose browser is set to Chinese, otherwise English.
- The toggle in the top-right switches language and remembers the choice.
- Direct links: `?lang=en` or `?lang=zh` at the end of the URL.

## Preview locally

Double-click `index.html`, or in PowerShell inside this folder:

```
python -m http.server 8000
```

then open http://localhost:8000
