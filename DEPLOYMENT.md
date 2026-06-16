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
