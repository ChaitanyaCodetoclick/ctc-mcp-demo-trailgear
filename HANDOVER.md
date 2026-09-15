# Marketing Cloud Personalization Demo — Handover
### State of the build as at 14 September 2026

**Audience:** an AI coding agent picking this up in a new session, or a human following along.
**Read this alongside `PLAN.md`.** `PLAN.md` is the design; this file is what actually exists on
disk and where the build diverged from it.

> **Precedence.** For anything already built, this file wins. `PLAN.md` still governs everything
> not yet started — Phases 3 to 6 — and its terminology, data model and eligibility rules are
> unchanged. Four things were built differently from `PLAN.md` on purpose; each is listed under
> *Deviations* below with its reason. Do not "correct" the code back to the plan without reading
> that section, particularly the beacon.

---

## Where things stand

| Phase | State |
|---|---|
| **0 — Prerequisites** | **Not started.** No account name, dataset name, beacon URL, namespace or catalog attributes confirmed. Still the gate on Phase 3 |
| **1 — Static site** | **Built, not published.** Five pages, data layer, cart, order handoff, 20 placeholder images. Not yet in git, not yet on GitHub Pages. Checkpoint 1.6 not signed off |
| **2 — Product catalog** | **Data and generator built; nothing imported.** `products.json` holds all 20 SKUs; the CSV generator runs in the browser. Nothing has been loaded into MCP, so checkpoint 2.4 is open |
| **3 — Web SDK and sitemap** | **Not started.** One line to configure once Phase 0 answers exist. `docs/sitemap.js` does not exist yet |
| **4 — Recommendations and campaigns** | Not started |
| **5 — Seed and validate** | Not started |
| **6 — Demo script** | Not started |

Nothing in this build has ever spoken to an MCP instance.

---

## What is on disk

Repo root is `mcp-demo-trailgear/`, sitting next to `PLAN.md` and this file.

```
MCP MD/
├── PLAN.md
├── HANDOVER.md                  ← this file
└── mcp-demo-trailgear/
    ├── .nojekyll                empty, stops Pages running Jekyll
    ├── index.html               pageType "home"
    ├── catalog.html             pageType "catalog"
    ├── product.html             pageType "product"
    ├── cart.html                pageType "cart"
    ├── thankyou.html            pageType "order"
    ├── README.md                repo-level docs, overlaps this file
    ├── assets/
    │   ├── css/style.css
    │   ├── js/
    │   │   ├── datalayer.js     builds window.TG  ← the sitemap contract
    │   │   └── app.js           rendering, cart, order handoff
    │   └── img/                 TG-001.svg … TG-020.svg, 400x400
    └── data/
        ├── products.json        SINGLE SOURCE OF TRUTH, 20 SKUs
        └── build-catalog.html   generates the MCP import files (replaces build_catalog.py)
```

Present in `PLAN.md` 1.1 but **not** on disk:

- `data/build_catalog.py` — replaced, see *Deviations*
- `data/mcp_products.csv`, `data/mcp_categories.csv` — generated on demand, never committed yet
- `docs/sitemap.js` — Phase 3, not started

`data/products.json` matches the table in `PLAN.md` 2.2 exactly: 20 SKUs, 5 per category across
`footwear`/`apparel`/`gear`/`accessories`, brands TrailGear/SummitPro/PeakFlow, and TG-008 at
inventory 0. The JSON record shape is verbatim from 2.2 — `url` and `imageUrl` are **not** stored.

---

## Deviations from PLAN.md — read before touching anything

### 1. The beacon is injected by `datalayer.js`, not pasted into five `<head>`s

**`PLAN.md` 3.1 says to copy a beacon `<script>` tag into all five pages. Do not do this.** The
pages have no beacon tag and must not be given one.

`PLAN.md` contradicts itself here: 3.1 puts the beacon *above* `datalayer.js`, while 1.2 and
Appendix A both say `datalayer.js` must run first or no page type will match. Appendix A lists
that exact ordering mistake as a top failure mode — events fire, nothing matches, nothing in the
console explains it.

So `datalayer.js` appends the beacon `<script>` itself, after `window.TG` is complete. The
ordering is then correct by construction, and there is one line to configure rather than five to
keep in sync. To enable tracking in Phase 3, set one value at the top of `assets/js/datalayer.js`:

```js
window.TG_CONFIG = {
  beaconUrl: "//cdn.evgnet.com/beacon/<account>/<dataset>/scripts/evergage.min.js",
  baseUrl: null
};
```

While `beaconUrl` is `null` the site runs normally with no tracking. The Appendix A row
"Events fire but no page type matches → move `datalayer.js` above the beacon" no longer applies
to this build.

### 2. `data/build-catalog.html` replaces `data/build_catalog.py`

Same job as the generator in `PLAN.md` 2.3 — read `products.json`, derive `url` and `imageUrl`
from each `id` and a base URL, emit `mcp_products.csv` and `mcp_categories.csv` — as a browser
page with no install. Identical column order to 2.3:

```
id, name, url, imageUrl, description, price, brand, inventoryCount, categoryId
id, name, url                                                    (categories)
```

It adds one thing the Python did not: a preview table that applies the eligibility rule from
`PLAN.md` 2.1 to every row before you import, so a missing field or a zero inventory is visible
up front rather than as an empty zone later.

Cells are RFC 4180 quoted, because the descriptions contain commas.

### 3. Placeholder images are `.svg`, not `.jpg`

`PLAN.md` 1.1 specifies `assets/img/<id>.jpg`. This build has `assets/img/<id>.svg` — 20
generated 400x400 placeholders showing category, SKU and product name, so no binaries sit in the
repo. Eligibility treats them identically.

If real JPGs are swapped in later, the extension must change in **two** places together, or the
IDs and URLs the sitemap tracks stop matching the imported catalog:

- `imageUrl()` in `assets/js/datalayer.js`
- `imageUrl()` in `data/build-catalog.html`

### 4. Base URL is derived from `window.location`, not hard-coded

`PLAN.md` 0.7 and 2.3 hard-code `BASE_URL`. This build derives it from the browsing host at
runtime, so the absolute URLs written into `window.TG` can never drift from wherever the site is
served and can never accidentally be relative. `TG_CONFIG.baseUrl` overrides it if the catalog
must ever point somewhere other than the host being browsed.

The final public URL from `PLAN.md` 0.7 is **still undecided** — no GitHub username has been
supplied — and it is still required for the CSVs, which need a real public origin baked in.

---

## The data layer as built — `window.TG`

Set on every page, before the beacon, from the `data-page-type` attribute on the `datalayer.js`
script tag:

```html
<script src="assets/js/datalayer.js" data-page-type="product"></script>
```

```js
window.TG = {
  pageType,          // "home" | "catalog" | "product" | "cart" | "order"
  baseUrl,           // derived absolute origin + path
  categories,        // { footwear: "Footwear", apparel: "Apparel", ... }
  products,          // all 20, enriched with url/imageUrl/categoryName — null until TG_READY
  product,           // product pages only; null if ?id= does not resolve
  order,             // order page only, and only when it should be tracked
  productUrl(id), imageUrl(id), categoryUrl(id)
};
window.TG_READY      // Promise, resolves once window.TG is final
```

`window.TG.product` carries exactly the shape in `PLAN.md` 1.2, plus a `categoryName` used only
for display:

```js
{ id, name, url, imageUrl, description, price, categoryId, categoryName, brand, inventoryCount }
```

**The sitemap in `PLAN.md` 3.2 works against this unmodified.** Every accessor it uses —
`tg().pageType`, `tg().product.*`, `tg().order.*` — resolves, and `#add-to-cart-btn` is in the
initial HTML of `product.html` so the click listener always has an element to bind to.

> **One sharp edge to fix when you author the sitemap.** `PLAN.md` 3.2 guards the order page with
> `isMatch: () => tg().pageType === "order" && !!tg().order`, but the product page has no
> equivalent guard. On this build `product.html?id=NONSENSE` gives `pageType === "product"` with
> `product === null`, so `id: () => tg().product.id` throws. Mirror the order guard:
> `isMatch: () => tg().pageType === "product" && !!tg().product`.

### Cart and order handoff

Implemented as `PLAN.md` 1.4 specifies. `localStorage.tg_cart` holds `[{ id, quantity }]` only —
price is looked up from the catalog at checkout, so a stale price can never reach an order's line
items. Checkout writes `sessionStorage.tg_order`, clears the cart and redirects. **It fires no MCP
event**, by design: the purchase interaction is `thankyou.html`'s job, so a failed redirect cannot
bank a sale.

The order object is the shape in 1.4 verbatim. Idempotency works as specified: `datalayer.js`
compares the order ID against `localStorage.tg_last_order_sent` and withholds `window.TG.order` if
they match, which is what suppresses the duplicate purchase on a refresh. `app.js` reads
`sessionStorage` directly for the visible summary, so a refresh still shows the customer their
order while sending nothing.

---

## Invariants — breaking these fails silently

1. **`url` and `imageUrl` are derived in two places and must agree.** `datalayer.js` and
   `build-catalog.html`. If they diverge, the IDs the sitemap tracks stop matching the imported
   catalog and every zone renders empty with no visible explanation.
2. **Never hand-edit the CSVs.** Edit `products.json` and regenerate.
3. **Zone divs stay in the initial HTML.** `#mcp-zone-home`, `#mcp-zone-banner`, `#mcp-zone-pdp`.
   Each has a `min-height` and a `data-zone-label` that renders only while the zone is empty. Do
   not let JS create them.
4. **`#add-to-cart-btn` stays in the initial HTML** of `product.html`. `app.js` only toggles its
   state.
5. **`app.js` fires no Personalization events and must not start.** All tracking is declarative
   and belongs in the sitemap.
6. **Do not set `cookieDomain: "github.io"`** in `init()` — `PLAN.md` 1.6. Omit it.
7. **Currency is display-only.** `CURRENCY` in `app.js` is `£`; prices reaching the catalog are
   bare numbers.

---

## Configuration still outstanding

Everything in `PLAN.md` Phase 0 is unanswered. The two that block progress:

- **0.2 beacon URL** → `TG_CONFIG.beaconUrl` in `assets/js/datalayer.js`. Until this is set, no
  tracking happens anywhere.
- **0.6 custom attributes.** `brand` and `inventoryCount` must exist in the MCP UI *before* the
  sitemap references them, or they are dropped silently (Appendix A).
- **0.7 final public URL** → needed for the CSVs. Not needed for the site, which derives it.

On secrets, per `PLAN.md` 0: account and dataset names in the beacon URL are not credentials and
are fine to commit. Catalog API keys, SFTP credentials and OAuth client secrets are — they must
not be committed and must not be pasted into chat tools. If the build turns out to need the
Catalog API rather than the manual import, raise it with IT or the CISO before any credentials are
generated.

---

## What was verified, and what was not

**Verified:**

- `products.json` parses; 20 SKUs, 5 per category; TG-008 at inventory 0
- all 20 `assets/img/TG-0xx.svg` files exist, one per SKU
- `datalayer.js` and `app.js` both pass `node --check`

**Not verified — do this first in the next session:**

- **No page has been loaded in a browser.** The `PLAN.md` 1.6 checkpoint is entirely open:
  `window.TG` correct on each of the five pages, cart round-trips, `thankyou.html` shows a sane
  order.
- **Nothing is deployed.** Not a git repo yet — `PLAN.md` 1.5 has not been run. The site has never
  been served over HTTPS, which the web SDK requires.
- **Nothing imported into MCP.** `PLAN.md` 2.4 checkpoint open.

The pages `fetch` `data/products.json`, so `file://` will not work. Serve the repo root with any
static server and browse the port it reports.

One thing to review before demoing: `datalayer.js` fetches `products.json` with
`cache: "no-cache"` rather than the `?v=<timestamp>` cache-buster in `PLAN.md` 1.6. It serves the
same purpose against the ~10 minute Pages CDN cache and is safe to leave, but it is a deliberate
difference worth knowing about.

---

## Next actions, in order

1. **Browser-test Phase 1 locally.** Serve the repo root, walk all five pages, sign off the 1.6
   checkpoint.
2. **Run `PLAN.md` 1.5** — git init, push, Settings → Pages → Deploy from branch → `main` / root.
   Confirm the site loads over HTTPS.
3. **Answer `PLAN.md` Phase 0** with whoever owns the MCP instance. This is the gate on Phase 3.
4. **Generate and import the catalog (2.4).** Serve the repo, open `/data/build-catalog.html`,
   **replace the pre-filled base URL with the real public origin** — it defaults to whatever host
   you opened it on, and a CSV full of `localhost` URLs imports cleanly and then returns nothing
   from every zone. Download both files, import categories first, then products with `id` as the
   unique key and `categoryId` mapped to the Category relationship. Commit both CSVs next to the
   `products.json` they came from.
5. **Phase 3.** Set `TG_CONFIG.beaconUrl`, author the sitemap in the Sitemap Editor, add the
   product-page guard noted above, save a copy to `docs/sitemap.js`.

---

## Terminology map

Where this build's names differ from `PLAN.md`:

| `PLAN.md` | This build | Note |
|---|---|---|
| `data/build_catalog.py` | `data/build-catalog.html` | Same two CSVs, same columns |
| `assets/img/<id>.jpg` | `assets/img/<id>.svg` | Generated placeholders |
| `BASE_URL` constant | `TG_CONFIG.baseUrl`, `window.TG.baseUrl` | Derived unless overridden |
| beacon `<script>` in `<head>` | `TG_CONFIG.beaconUrl` | Injected by `datalayer.js` |

Everything else — page types, zone selectors, `window.TG`, the order shape, storage keys
(`tg_cart`, `tg_order`, `tg_last_order_sent`), catalog field names, the eligibility rule — uses
`PLAN.md`'s names unchanged.

---

*Drafted with AI assistance, and describing code drafted with AI assistance. The Phase 1 and 2
output has been syntax-checked but not run in a browser and not validated against a live MCP
instance. Review before relying on it.*
