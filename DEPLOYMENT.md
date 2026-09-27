# Deployment

This site is a static HTML/CSS/JS website and can be hosted for free on GitHub Pages with HTTPS.

## GitHub Pages

1. Create a public GitHub repository, for example `palette-and-pillows`.
2. Push this folder to the repository.
3. In the repository, open `Settings` -> `Pages`.
4. Under `Build and deployment`, choose `Deploy from a branch`.
5. Select branch `main` and folder `/root`, then save.
6. Under `Custom domain`, use:

   ```text
   www.paletteandpillows.space
   ```

7. After DNS has propagated, enable `Enforce HTTPS`.

## Namecheap DNS

Your domain currently uses Namecheap parking records. Replace the parking records with these.

For the root domain:

| Type | Host | Value |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |

For the `www` domain:

| Type | Host | Value |
| --- | --- | --- |
| CNAME | www | `<your-github-username>.github.io` |

GitHub Pages will redirect between the root domain and `www` once both are configured.

## Working on the site

No build step. GitHub Pages serves these files exactly as they are, so editing
`index.html`, `styles.css` or `script.js` and pushing is the whole workflow.

```sh
npm run serve    # http://localhost:8000
npm test         # jest, jsdom
```

### Media

Optimised media is generated once and committed; it is not built on deploy.

```sh
npm run optimize            # images only
python3 tools/optimize-media.py --force
```

- WebP variants land in `assets/opt/` and are referenced from `index.html` as a
  `<source type="image/webp">` ahead of the original JPEG, which stays as the
  fallback. Never delete the JPEGs.
- **Videos are shipped as supplied and are not re-encoded.** The source clips
  already carry `faststart`, so playback begins before the file finishes
  downloading without any processing. Re-encoding them only trades picture
  quality for bytes, and since the tour loads clips on demand no video is
  fetched on first paint anyway. The script can still do it behind an explicit
  `--videos` flag; there is no reason to use it.
- Requires Pillow (`pip install Pillow`); `ffmpeg` only for the optional
  `--videos` path.

### After adding a room to the tour

Add the `<article class="tour-step">` with its `data-*` attributes and update the
`data-count` values. The section height follows the step count automatically, so
nothing in `styles.css` needs touching.

### Keeping the rating honest

The rating appears in three places that must agree with the live Airbnb listing:
the `.rating-mark` and its supporting copy, the sticky booking bar, and the
JSON-LD `aggregateRating` at the foot of `index.html`. Search for `4.96` to find
all of them.
