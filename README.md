# TrailGear Outfitters

A fictional outdoor gear shop, built as a demo target for **Salesforce Marketing Cloud
Personalization (MCP)**. Five static pages, no framework, no build step, no backend.

- `../PLAN.md` — the full implementation plan, Phases 0 to 6
- `../HANDOVER.md` — what is actually built, where it diverges from the plan, and what to do next

This README covers what is in the repo today (Phases 1 and 2) and how to run it.

Visual design is explicitly out of scope. Everything here is the simplest thing that makes
tracking and recommendations work and be visible.

## Status

| Phase | State |
|---|---|
| 1 — Static site | Done |
| 2 — Product catalog | Data + generator done; import into MCP outstanding |
| 3 — Web SDK and sitemap | Not started. One line to configure, see below |
| 4–6 | Not started |

## Layout

```
.nojekyll                  stops GitHub Pages running Jekyll
index.html                 home        — banner zone + recommendation zone
catalog.html               catalog     — grid, ?category= filter
product.html               product     — ?id=TG-0xx, add to cart, PDP zone
cart.html                  cart        — localStorage cart, checkout
thankyou.html              order       — confirmation, fires the purchase interaction
assets/css/style.css
assets/js/datalayer.js     builds window.TG  ← the sitemap contract
assets/js/app.js           rendering, cart, order handoff
assets/img/TG-0xx.svg      20 placeholder images
data/products.json         SINGLE SOURCE OF TRUTH
data/build-catalog.html    generates the two MCP import CSVs
```

## Running it locally

Any static server at the repo root; the pages `fetch` `data/products.json`, so opening the
files directly over `file://` will not work.

```powershell
npx serve .
```

Then browse whatever port it reports (`npx serve` defaults to 3000).

## How tracking data reaches MCP

The sitemap must never scrape the DOM for product ID, price or category — it breaks the
moment someone edits the markup. Instead every page publishes `window.TG` before the beacon
initialises, and the sitemap reads only from there.

`window.TG.pageType` is one of `home`, `catalog`, `product`, `cart`, `order`, set from the
`data-page-type` attribute on the `datalayer.js` script tag. That makes sitemap `isMatch`
logic a string comparison, independent of URL structure.

On product pages `window.TG.product` carries the full catalog shape:

```js
{ id, name, url, imageUrl, description, price, categoryId, brand, inventoryCount }
```

`url` and `imageUrl` are **derived** from `id` and the site's base URL, never stored. The
same derivation lives in `datalayer.js` and in `data/build-catalog.html`. If those two ever
disagree, the IDs the sitemap tracks will not match the imported catalog and recommendation
zones render empty with no visible explanation. Change one, change the other.

## Enabling the beacon (Phase 3)

One line, one place. In `assets/js/datalayer.js`:

```js
beaconUrl: "//cdn.evgnet.com/beacon/<account>/<dataset>/scripts/evergage.min.js"
```

`datalayer.js` injects the beacon itself, *after* `window.TG` is complete. The plan describes
pasting a `<script>` tag into all five pages; that was changed here deliberately, because the
most common failure in an MCP build is `window.TG` being set after the beacon initialises
(no page type matches, no events fire, nothing in the console). Injecting from the data layer
makes the ordering correct by construction and leaves one line to configure rather than five
to keep in sync. Do not add a beacon `<script>` tag to the HTML.

Account and dataset names are not secrets and are fine to commit. Catalog API keys, SFTP
credentials and OAuth client secrets are not — they must never be committed, and if the build
turns out to need the Catalog API rather than a manual import, raise it with IT or the CISO
before any credentials are generated.

## Regenerating the catalog import files

`data/products.json` is the single source of truth. After editing it, serve the repo and open
`/data/build-catalog.html`:

1. Confirm the **base URL** is the final public site root, e.g.
   `https://<username>.github.io/mcp-demo-trailgear`. Catalog URLs must be absolute and
   publicly reachable.
2. Download `mcp_products.csv` and `mcp_categories.csv`.
3. Import **categories first** — the Product→Category relationship needs them to exist.
4. Import products, mapping `id` as the unique key and `categoryId` to the Category
   relationship.
5. Spot-check three items in the Catalog UI: image renders, URL is clickable and absolute,
   price is numeric.

Commit the CSVs alongside the `products.json` they came from, so the import file and the live
site are always the same vintage.

The page replaces `build_catalog.py` from the plan. It does the same job — derive two URLs per
row, emit two CSVs — without needing a Python install, and it previews eligibility before you
import rather than after.

## Things that look like bugs and are not

- **TG-008 (Cirrus Down Puffer Jacket) has zero inventory, on purpose.** MCP will not return
  it from any recommendation zone. That is a talking point about inventory-aware
  recommendations, not a fault.
- **Five products per category, on purpose.** After excluding the item being viewed, a
  category-scoped recipe still fills a four-slot carousel.
- **Zones render as empty dashed boxes** until a campaign is published against them. Each is
  labelled with its own selector so you can see which is which.
- **Recommendations identical for every visitor** is expected on a cold dataset — that is the
  fallback ingredient doing its job.

## GitHub Pages notes

- Keep `.nojekyll`. Without it Pages runs Jekyll, which ignores paths beginning with `_`.
- Published assets are CDN-cached for roughly 10 minutes; edits to `products.json` may not
  appear on a hard refresh.
- `github.io` is on the Public Suffix List. Do **not** set `cookieDomain: "github.io"` in
  `init()` — it is rejected and tracking fails silently. Omit it, or use the full host.
- Demo in Chrome. Safari's ITP caps JS-set first-party cookies at around seven days, so a
  profile built earlier in the week may be gone by demo day.

## Deviations from PLAN.md

| Plan | Here | Why |
|---|---|---|
| `data/build_catalog.py` | `data/build-catalog.html` | Same output, no Python install; previews catalog eligibility |
| Beacon `<script>` in all five `<head>`s | Injected by `datalayer.js` | Guarantees `window.TG` exists first; one line to configure, not five |
| `assets/img/<id>.jpg` | `assets/img/<id>.svg` | Generated placeholders, no binary assets in the repo. Swap in real JPGs later — change the extension in `datalayer.js` and `build-catalog.html` together |
| Base URL hard-coded | Derived from `window.location` | Site-side URLs cannot drift from the host or accidentally be relative. `TG_CONFIG.baseUrl` overrides |

---

*Drafted with AI assistance. Review against the MCP instance's own SDK reference before
relying on the sitemap and catalog behaviour.*
