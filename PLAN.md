# Marketing Cloud Personalization Demo — Implementation Plan
### Static site on GitHub Pages + product catalog + MCP web channel

**Audience:** an AI coding agent, or a human following along.
**Goal:** stand up a live, bare-bones e-commerce site ("TrailGear Outfitters") on GitHub Pages, wire it to Salesforce Marketing Cloud Personalization (MCP), and demonstrate visitor tracking, a catalog, and catalog-driven recommendations end to end.
**Scope guardrail:** visual design does not matter. Default every UX decision to "the simplest thing that makes MCP tracking and recommendations work and be visibly demonstrated." No framework, no build step for the site, no backend.

**Vertical:** fictional outdoor gear retailer. Chosen because it has natural categories (footwear, apparel, gear, accessories), which makes category affinity and recommendation demos easy to narrate.

**Site structure (5 pages):**

| Page | Role |
|---|---|
| `index.html` | Home — recommendation zone + personalised banner zone |
| `catalog.html` | Full product grid |
| `product.html?id={id}` | Product detail — recommendation zone, add to cart |
| `cart.html` | Client-side cart, checkout button |
| `thankyou.html` | Order confirmation, fires the purchase interaction |

This covers the full MCP event lifecycle: page view → view product → add to cart → view cart → purchase.

> **Companion document.** `HANDOVER.md` records what has actually been built, what has been
> verified, and what has not. This plan is the design; `HANDOVER.md` is the state. Read both.

---

## Local vs hosted — what works where

**Read this before running anything.** The single most common way to waste a day on this build is
assuming local and hosted behave the same. They do not, and one of the differences will quietly
corrupt your MCP catalog if you get it wrong.

Three ways to run the site, and only two of them work:

| How | Result |
|---|---|
| Double-click an HTML file in Explorer (`file://`) | **Does not work.** No products anywhere |
| Local static server (`http://localhost:<port>`) | Phases 1–2 work fully. Phase 3+ is restricted — see below |
| GitHub Pages (`https://<username>.github.io/...`) | Everything works. This is what you demo |

### Why `file://` fails

Every page fetches `data/products.json` at runtime. Browsers block `fetch()` on `file://`
origins, so the catalog never loads and the grid is empty. The site now detects this and says so
on the page rather than showing an empty grid — but the fix is simply to serve it over HTTP.

### What works locally, and what does not

| Capability | Local HTTP | GitHub Pages |
|---|---|---|
| Five pages render, navigation works | Yes | Yes |
| Cart, checkout, order confirmation round-trip | Yes | Yes |
| Inspect `window.TG` in the console | Yes | Yes |
| Generate the catalog CSVs | Yes — **but you must type the public URL by hand** | Yes |
| Import the catalog into MCP | Yes — the CSV is just a file | Yes |
| Beacon loads and `init()` succeeds | Only if your dataset allows `localhost` | Yes |
| Author/debug the sitemap in the Visual Editor | Only if your dataset allows `localhost` | Yes |
| Events land in Event Stream / Live Activity | Only if your dataset allows `localhost` | Yes |
| Catalog objects tracked with **correct URLs** | **No — see the warning below** | Yes |
| Recommendation zones render real items | Unreliable | Yes |
| Run the demo | **No** | Yes |

### The warning that matters

> **Do not enable the beacon while browsing `localhost` unless you have pinned `TG_CONFIG.baseUrl`
> to the public URL first.**
>
> `datalayer.js` derives the site's base URL from `window.location`. That is deliberate — it means
> the absolute URLs in `window.TG` can never accidentally be relative. But MCP **creates and
> updates catalog items from tracked interactions** (the same behaviour Phase 2.4 relies on as a
> fallback import route). So if you browse `http://localhost:3000` with tracking switched on, the
> sitemap will write `http://localhost:3000/product.html?id=TG-001` into the catalog as that
> product's URL — overwriting a correct imported URL with one nobody outside your machine can
> reach.
>
> Per the eligibility rule in Phase 2.1, an item whose URL or image URL does not resolve is dropped
> from recommendations **silently**. The symptom is every zone rendering empty with a catalog that
> looks perfectly healthy in the MCP UI.
>
> **The rule: do Phases 1 and 2 locally, and Phase 3 onward on the hosted site.** If you genuinely
> need to debug the sitemap locally, set `TG_CONFIG.baseUrl` to the public GitHub Pages URL first,
> and accept that the URLs will then not match the page you are actually on.

### One more local-only gotcha

The beacon URL in Phase 0.2 is written protocol-relative (`//cdn.evgnet.com/...`). On an
**HTTPS** page that resolves to `https:`, which is correct. On a **local HTTP** page it resolves
to `http://cdn.evgnet.com/...`, which may be refused. If you must load the beacon locally, write
the scheme explicitly: `https://cdn.evgnet.com/...`.

Browsers treat `http://localhost` as a secure context, so the SDK itself will run there. Whether
your *dataset* accepts `localhost` as a web-channel domain is instance configuration — Phase 0.5.

---

## Phase 0 — Prerequisites

**Gate: do not start Phase 3 until every item below is confirmed.** Several of these are hard blockers — in particular, catalog attributes must exist in the MCP UI before a sitemap can reference them.

Confirm with whoever owns the MCP instance:

1. **Account name and dataset name.** Both appear in the Gears URL in the MCP UI (e.g. `https://<account>.<instance>.evergage.com/`). Use a **non-production / demo dataset** — this exercise generates junk profiles.
2. **Beacon script URL**, of the form `//cdn.evgnet.com/beacon/<account>/<dataset>/scripts/evergage.min.js`.
3. **Namespace.** New builds should use the `SalesforceInteractions` namespace (`interaction`, `catalogObject`, `CartConfig`). The older `Evergage` namespace (`action`, `catalog`, `OrderConfig`, `LineItem`) is still supported and much published example code uses it. **Pick one and do not mix** — the object shapes differ.
4. **Personalization Visual Editor browser extension** installed, and confirmed able to connect to the account/dataset. The Sitemap Editor lives inside it; without it there is no practical way to author or debug the sitemap.
5. **Site domain registered** on the dataset's web channel / allowed domains. Ask explicitly whether `localhost` can be added as well — if not, all sitemap debugging has to happen against the published site.
6. **Catalog object types and custom attributes created in the MCP UI.** Product and Category are standard; `brand` and `inventoryCount` must be created as custom attributes before the sitemap can map them.
7. **Final public URL decided now**, because catalog URLs must be absolute:
   `https://<username>.github.io/mcp-demo-trailgear/`

> **Handling secrets.** The repo is public. Account and dataset names in the beacon URL are not secrets and are fine to commit. Anything issued as a credential — Catalog API keys, SFTP credentials, OAuth client secrets — must not be committed and must not be pasted into chat tools. If the build ends up needing the Catalog API rather than manual import, raise it with IT or the CISO before generating credentials.

---

## Phase 1 — Static site

### 1.1 Repository structure

```
mcp-demo-trailgear/
├── .nojekyll
├── index.html
├── catalog.html
├── product.html
├── cart.html
├── thankyou.html
├── assets/
│   ├── css/style.css
│   ├── js/
│   │   ├── datalayer.js     # builds window.TG on every page  ← the sitemap contract
│   │   └── app.js           # rendering, cart, order handoff
│   └── img/                 # 20 placeholder images, 400x400, named <id>.svg
├── data/
│   ├── products.json        # SINGLE SOURCE OF TRUTH
│   └── build-catalog.html   # generates the MCP import files, in the browser
├── docs/
│   └── sitemap.js           # version-controlled copy of the sitemap (Phase 3)
└── README.md
```

### 1.2 The page-level data layer

**Do not let the sitemap scrape the DOM** for product ID, price or category. DOM scraping is the most brittle part of any MCP implementation and breaks the moment someone edits the markup. Instead, every page publishes a small stable object *before the beacon initialises*.

`window.TG` is built by **`datalayer.js`**, not by `app.js`. `app.js` only renders and manages the cart; it must never write to `window.TG` and must never fire a Personalization event.

The page declares its own type on the script tag:

```html
<!-- in <head>, on every page -->
<script src="assets/js/datalayer.js" data-page-type="product"></script>
```

and `datalayer.js` produces, on a product page:

```js
window.TG = {
  pageType: "product",       // home | catalog | product | cart | order
  baseUrl: "https://<username>.github.io/mcp-demo-trailgear",
  categories: { footwear: "Footwear", ... },
  products: [ /* all 20, enriched */ ],
  product: {
    id: "TG-001",
    name: "Summit Trail Hiking Boots",
    url: "https://<username>.github.io/mcp-demo-trailgear/product.html?id=TG-001",
    imageUrl: "https://<username>.github.io/mcp-demo-trailgear/assets/img/TG-001.svg",
    description: "Waterproof, breathable hiking boots built for rocky terrain.",
    price: 129.99,
    categoryId: "footwear",
    categoryName: "Footwear",   // display only, not a catalog field
    brand: "TrailGear",
    inventoryCount: 12
  },
  order: null,                // order page only, and only when it should be tracked
  loadError: null             // human-readable reason the catalog failed to load
};
window.TG_READY               // Promise; resolves once window.TG is final
```

`window.TG.pageType` is set on all five pages. This makes sitemap `isMatch` logic trivial and independent of URL structure.

**`window.TG` is populated asynchronously.** The catalog comes from `fetch("data/products.json")`, so `window.TG.product` does not exist at parse time — it appears when `TG_READY` resolves. Everything downstream depends on this:

- `app.js` waits on `window.TG_READY` before rendering.
- **The beacon is injected by `datalayer.js` after `TG_READY` resolves.** It is *not* a hand-pasted `<script>` tag in the HTML. See Phase 3.1.

**Ordering matters, and is handled for you.** Because `datalayer.js` appends the beacon itself, the "data layer ran after the beacon" failure cannot happen. Do not add a beacon `<script>` tag to the pages — it would load before `window.TG` exists and no page type would match.

### 1.3 Page requirements

| Page | Must contain |
|---|---|
| `index.html` | nav; `<div id="mcp-zone-home"></div>`; `<div id="mcp-zone-banner"></div>` |
| `catalog.html` | `<div id="product-grid">` populated from `data/products.json`; cards link to `product.html?id=TG-0xx` |
| `product.html` | `<div id="product-detail">`; `<div id="mcp-zone-pdp"></div>`; `<button id="add-to-cart-btn">` |
| `cart.html` | `<div id="cart-items">` rendered from `localStorage`; `<button id="checkout-btn">` |
| `thankyou.html` | order summary read from `sessionStorage` |

Zone divs must be **present in the initial HTML**, not created by JS after the beacon runs, or campaigns will have nothing to target. Give each a fixed `min-height` so the page does not jump when personalised content lands.

`#add-to-cart-btn` must likewise be in the initial HTML, so the sitemap's click listener always has an element to bind to. `app.js` only enables/disables it once the product resolves.

### 1.4 Cart and order handoff

- **Add to cart** → push to `localStorage.tg_cart`, as `[{ id, quantity }]`. Price is **not** stored; it is looked up from the catalog at checkout, so a stale price can never reach an order.
- **Checkout button** → build an order object, write it to `sessionStorage.tg_order`, clear `localStorage.tg_cart`, redirect to `thankyou.html`. **Fire no MCP event here** — if the redirect fails you must not have banked a sale.
- **`thankyou.html` on load** → `datalayer.js` reads `sessionStorage.tg_order`, exposes it as `window.TG.order`, and writes the order ID into `localStorage.tg_last_order_sent`. The sitemap fires the purchase interaction from `window.TG.order`.
- **Idempotency:** before exposing the order, compare its ID against `tg_last_order_sent`. If it matches, do not expose it. This stops a page refresh from double-firing the purchase. The order stays in `sessionStorage` either way, so the page still renders a summary for the customer.

Order object shape:

```js
{
  id: "TG-ORDER-" + Date.now(),
  total: 219.98,
  lineItems: [ { id: "TG-001", price: 129.99, quantity: 1 },
               { id: "TG-011", price: 159.99, quantity: 1 } ]
}
```

### 1.5 Run it locally

**The site must be served over HTTP, even locally.** See *Local vs hosted* above for why, and for what local running can and cannot do.

- **VS Code:** install the *Live Server* extension, right-click `index.html` → **Open with Live Server**.
- **Node:** `npx serve .` from the repo root, then browse the port it prints (defaults to 3000).

**Local checkpoint:** all five pages render, the grid shows 20 products, `window.TG` inspects correctly in the console on each page, the cart round-trips, and `thankyou.html` shows a sane order. Do this before publishing — it needs no MCP access at all.

### 1.6 Publish

```bash
git init && git add . && git commit -m "TrailGear MCP demo site"
git branch -M main
git remote add origin https://github.com/<username>/mcp-demo-trailgear.git
git push -u origin main
```

Then: **Settings → Pages → Deploy from branch → `main` / root**.

### 1.7 GitHub Pages specifics

- **Add `.nojekyll`** at the repo root. Without it, Pages runs Jekyll, which ignores paths beginning with `_` and can surprise you.
- **Published assets are CDN-cached for roughly 10 minutes.** After editing `products.json`, a hard refresh may still serve the old copy. The site already fetches it with `cache: "no-cache"`, which forces revalidation and is safe to leave in place.
- `github.io` is on the Public Suffix List, so the tracking cookie scopes to `<username>.github.io` only. That works — but do **not** set `cookieDomain: "github.io"` in `init()`. It will be rejected and tracking will silently fail. Omit `cookieDomain` entirely, or set the full host.
- **Demo in Chrome.** Safari's ITP caps JS-set first-party cookies at around 7 days, so a profile built earlier in the week may be gone by demo day.

**Hosted checkpoint:** all five pages load over **HTTPS** — required before the web SDK is worth wiring up — `window.TG.baseUrl` now reads `https://<username>.github.io/mcp-demo-trailgear`, and the cart and order flow still work.

---

## Phase 2 — Product catalog

### 2.1 Data model

| MCP object | Fields |
|---|---|
| **Product** (standard) | `id`, `name`, `url`, `imageUrl`, `description`, `price`; custom: `brand`, `inventoryCount` |
| **Category** (standard, related) | `id`, `name`, `url` — related to Product via the categories relationship |

Model category as a **related catalog object**, not a flat string attribute. The relationship is what drives category affinity and "same category" recipes. Brand stays a custom attribute, which makes it usable as an affinity booster.

**Eligibility rule — memorise this.** For a product to be returned by a recipe it must have a name, ID, URL, image URL, price, and an inventory that is either null or non-zero. An item missing any one of these is dropped from recommendations **silently**. This is why URLs must be absolute and publicly reachable, and why zero-inventory items disappear from zones without any rule being written.

### 2.2 Single source of truth — `data/products.json`

20 SKUs, 5 per category. Categories: `footwear`, `apparel`, `gear`, `accessories`. Brands: TrailGear, SummitPro, PeakFlow.

| id | name | category | price | brand | inventory |
|---|---|---|---|---|---|
| TG-001 | Summit Trail Hiking Boots | footwear | 129.99 | TrailGear | 12 |
| TG-002 | Ridgeline Trail Running Shoes | footwear | 99.99 | TrailGear | 20 |
| TG-003 | Granite Approach Shoes | footwear | 114.99 | SummitPro | 8 |
| TG-004 | Glacier Insulated Winter Boots | footwear | 169.99 | SummitPro | 5 |
| TG-005 | Basecamp Camp Sandals | footwear | 39.99 | PeakFlow | 30 |
| TG-006 | AlpineFlex Softshell Jacket | apparel | 89.99 | TrailGear | 15 |
| TG-007 | Merino Wool Base Layer | apparel | 45.00 | TrailGear | 40 |
| TG-008 | Cirrus Down Puffer Jacket | apparel | 199.99 | SummitPro | **0** |
| TG-009 | Stormline Rain Shell | apparel | 139.99 | SummitPro | 11 |
| TG-010 | Traverse Hiking Pants | apparel | 74.99 | PeakFlow | 25 |
| TG-011 | 60L Expedition Backpack | gear | 159.99 | SummitPro | 9 |
| TG-012 | 4-Season Tent (2-Person) | gear | 249.99 | SummitPro | 4 |
| TG-013 | Alpine Down Sleeping Bag | gear | 179.99 | TrailGear | 7 |
| TG-014 | Compact Camp Stove | gear | 59.99 | PeakFlow | 22 |
| TG-015 | Trekking Poles (Pair) | gear | 39.99 | SummitPro | 33 |
| TG-016 | Insulated Water Bottle 32oz | accessories | 24.99 | PeakFlow | 50 |
| TG-017 | Fleece-Lined Beanie | accessories | 19.99 | PeakFlow | 45 |
| TG-018 | Polarized Sport Sunglasses | accessories | 54.99 | PeakFlow | 18 |
| TG-019 | Trailhead Headlamp 300lm | accessories | 34.99 | TrailGear | 27 |
| TG-020 | Softshell Trail Gloves | accessories | 29.99 | TrailGear | 36 |

Five items per category matters: after excluding the item being viewed, a category-scoped recipe still fills a 4-slot carousel. Fewer items per category and the zone looks broken.

TG-008 is deliberately zero-inventory. It should never appear in a recommendation zone — that is a talking point, not a bug.

Each JSON record:

```json
{
  "id": "TG-001",
  "name": "Summit Trail Hiking Boots",
  "categoryId": "footwear",
  "price": 129.99,
  "brand": "TrailGear",
  "inventoryCount": 12,
  "description": "Waterproof, breathable hiking boots built for rocky terrain."
}
```

Note what is **not** stored: `url` and `imageUrl`. Both are derived from `id` and a base URL, so they can never drift and can never accidentally be relative.

### 2.3 Generator — `data/build-catalog.html`

A browser page, not a script — no Python or Node install required. It reads `products.json`, derives `url` and `imageUrl` from each `id`, previews every row against the Phase 2.1 eligibility rule, and downloads the two CSVs.

Columns, in order:

```
mcp_products.csv    id, name, url, imageUrl, description, price, brand, inventoryCount, categoryId
mcp_categories.csv  id, name, url
```

**Serve it over HTTP** — same `fetch` constraint as the rest of the site. Open `/data/build-catalog.html`.

> **The base URL field is the whole game.** It pre-fills from wherever you opened the page, so
> running locally it will say `http://localhost:3000`. **Replace it with the public URL before
> downloading** — `https://<username>.github.io/mcp-demo-trailgear`. A CSV full of `localhost`
> URLs imports without a single error and then returns nothing from every zone, because every
> item fails the eligibility rule. This is the most expensive mistake available in Phase 2.

Regenerate whenever `products.json` changes, and commit the outputs so the import file and the live site are always the same vintage. **Never hand-edit the CSVs.**

The same derivation logic lives in `assets/js/datalayer.js`. The two must agree — the IDs and URLs tracked by the sitemap must match the imported catalog exactly, or zones render empty with no visible explanation. If the image extension ever changes from `.svg`, change it in both files together.

### 2.4 Load into MCP

1. Import `mcp_categories.csv` **first** — the relationship needs the categories to exist.
2. Import `mcp_products.csv`, mapping `id` as the unique key and `categoryId` to the Category relationship.
3. Spot-check three items in the Catalog UI: image renders in the preview, URL is clickable, absolute, and **points at the published site** — not localhost — and price is numeric.

> **Alternative if the import UI fights back.** MCP creates catalog items automatically from the sitemap as pages are viewed. Skip the import, complete Phase 3, then walk all 20 PDPs once (Phase 5.1) and let the sitemap build the catalog. Slower, but it makes ID mismatch structurally impossible. The CSV route is faster and gives you items that have never been viewed — which recommendations need. Doing both is the belt-and-braces option and costs about ten minutes.
>
> **If you take this route, walk the PDPs on the published HTTPS site, never on localhost** — for exactly the reason in *Local vs hosted*.

**Checkpoint:** 20 products, 4 categories, no mapping errors, TG-008 showing inventory 0, and a spot-checked URL that opens the real site in a new tab.

---

## Phase 3 — Web SDK and sitemap

**Everything in this phase should be done against the published HTTPS site.** See *Local vs hosted*.

### 3.1 Beacon

The beacon is **not** pasted into the five HTML files. `datalayer.js` injects it, after `window.TG`
is complete, which is what guarantees the ordering in Phase 1.2. There is one line to configure,
at the top of `assets/js/datalayer.js`:

```js
window.TG_CONFIG = {
  beaconUrl: "https://cdn.evgnet.com/beacon/<account>/<dataset>/scripts/evergage.min.js",
  baseUrl: null   // leave null on the published site; see Local vs hosted
};
```

While `beaconUrl` is `null` the site runs normally with no tracking, which is the correct state
for Phase 1 and 2 work.

Verify in the Network tab that the beacon returns 200 on all five pages.

### 3.2 Sitemap

Tracking in MCP is **declarative**. Rather than calling tracking functions from your own JS, you author a sitemap in the **Sitemap Editor inside the Visual Editor extension**, and the beacon delivers it to the browser. Events are not sent to Personalization at all unless `initSitemap()` is called.

Keep a copy at `docs/sitemap.js` for version control, but the console copy is the one that runs.

Shape, using the `SalesforceInteractions` namespace:

```js
SalesforceInteractions.init({
  // omit cookieDomain on github.io — see Phase 1.7
}).then(() => {
  const tg = () => window.TG || {};

  const sitemapConfig = {
    global: {
      onActionEvent: (actionEvent) => actionEvent
    },
    pageTypeDefault: {
      name: "default",
      interaction: { name: "Other Page" }
    },
    pageTypes: [
      {
        name: "home",
        isMatch: () => tg().pageType === "home",
        interaction: { name: "Home Page" }
      },
      {
        name: "catalog",
        isMatch: () => tg().pageType === "catalog",
        interaction: { name: "Category Page" }
      },
      {
        name: "product",
        // The !!tg().product guard matters: product.html?id=NONSENSE still has
        // pageType "product" but no resolved product, and the resolvers below
        // would throw. Same pattern as the order page.
        isMatch: () => tg().pageType === "product" && !!tg().product,
        interaction: {
          name: SalesforceInteractions.CatalogObjectInteractionName.ViewCatalogObject,
          catalogObject: {
            type: "Product",
            id: () => tg().product.id,
            attributes: {
              name:            () => tg().product.name,
              url:             () => tg().product.url,
              imageUrl:        () => tg().product.imageUrl,
              description:     () => tg().product.description,
              price:           () => tg().product.price,
              brand:           () => tg().product.brand,
              inventoryCount:  () => tg().product.inventoryCount
            },
            relatedCatalogObjects: {
              Category: () => [ tg().product.categoryId ]
            }
          }
        },
        listeners: [
          SalesforceInteractions.listener("click", "#add-to-cart-btn", () => {
            SalesforceInteractions.sendEvent({
              interaction: {
                name: "Add To Cart",
                lineItem: {
                  catalogObjectType: "Product",
                  catalogObjectId: tg().product.id,
                  price: tg().product.price,
                  quantity: 1
                }
              }
            });
          })
        ]
      },
      {
        name: "cart",
        isMatch: () => tg().pageType === "cart",
        interaction: { name: "View Cart" }
      },
      {
        name: "order",
        isMatch: () => tg().pageType === "order" && !!tg().order,
        interaction: {
          name: "Purchase",
          order: {
            id: () => tg().order.id,
            totalValue: () => tg().order.total,
            lineItems: () => tg().order.lineItems.map(li => ({
              catalogObjectType: "Product",
              catalogObjectId: li.id,
              price: li.price,
              quantity: li.quantity
            }))
          }
        }
      }
    ]
  };

  SalesforceInteractions.initSitemap(sitemapConfig);
});
```

**Verify three things against the instance's own SDK reference before relying on the above verbatim**, because these differ across namespaces and versions:

- the exact enum/constant for the view-catalog-object interaction name;
- whether custom attributes belong in `attributes: {}` or at the root of the catalog object — unmapped attributes are dropped silently;
- the line item and order field names, and whether the instance uses `CartConfig` (SalesforceInteractions) or `OrderConfig` + `LineItem` (Evergage).

The **structure** — one page type per page, a catalog object on the PDP, a click listener for add-to-cart, an order on the confirmation page — is stable regardless of namespace.

### 3.3 Debugging

- `SalesforceInteractions.setLoggingLevel("trace")` logs every event and every failure to the console. It applies to **every visitor on that dataset**, so remove it before the demo.
- `SalesforceInteractions.getCurrentPage()` returns which page type matched — the first thing to check when an event does not appear.
- The Sitemap Editor shows all page types and which one matched on the current page.
- `window.TG` in the console shows exactly what the sitemap will read. If `window.TG.product` is `null` on a PDP, the problem is the page, not the sitemap.

**Checkpoint:** in Event Stream / Live Activity, a manual walk of the **published site** produces Home Page → Category Page → View Product (with the correct catalog ID) → Add To Cart → View Cart → Purchase, in order, with no duplicates.

---

## Phase 4 — Recommendations and campaigns (step by step)

> **This phase was rewritten.** The first version described the finished state without saying how
> to reach it. This version is a build guide for someone who knows Salesforce CRM but not
> Personalization. The design is unchanged: three zones, two recipes, one segment. What's new is
> the steps and the sources. Work through 4.1 → 4.9 **in order**, because each step depends on
> the one before it.

### 4.0 Before you start

#### How the pieces connect

Nothing appears in a zone until five things exist and reference each other:

```
 (4.1) sitemap          declares content zone  "pdp_recs" → #mcp-zone-pdp
          │
          │  a template is tagged with the zone names it is allowed to render into
          ▼
 (4.5) web template ───────────┐        (4.2–4.4) Einstein Recipe
       TS + Handlebars + JS    │                  "which items, in what order"
                               ▼                   │
 (4.7) web campaign  =  zone + template + recipe ◄─┘  + audience ◄── (4.6) segment (banner only)
          │
          │  (4.8) test with ?evergageTestMessages=…      (4.9) publish
          ▼
 on each page load the beacon asks: which published campaigns apply here?  →  template renders into the zone
```

#### Translation table for a CRM developer

| Personalization term | Nearest CRM equivalent | What it actually is |
|---|---|---|
| **Sitemap** | A trigger handler for page loads | JavaScript config the beacon runs on every page: page types, events and content zones. You built it in Phase 3 |
| **Content zone** | A region on a Lightning page | A named CSS selector declared in the sitemap. Web campaigns can only render into declared zones |
| **Web template** | An LWC plus its Apex controller | Four tabs: server-side TypeScript (fetches data, e.g. recommendations), Handlebars (markup), client-side JS (puts it in the DOM), CSS |
| **Einstein Recipe** | A saved query with ranking | Recommendation logic: *ingredients* (where candidates come from), *exclusions/inclusions* (filters), *boosters* (affinity re-ranking), *variations* (spread) |
| **Segment** | A list view re-evaluated on every event | A rule-based group of visitors. Membership updates in real time |
| **Web campaign** | A Lightning page assignment plus the component's property panel | Decides who sees which template, in which zone, with which settings (for example, which recipe) |
| **Experience** | A page variant | One version of a campaign. Two or more experiences make an A/B test |
| **Control group** | An A/B hold-out | Visitors deliberately shown nothing so lift can be measured. **If you're in it, the zone is empty** |

#### Two products, two sets of docs — don't mix them

This build uses **Marketing Cloud Personalization** (formerly Interaction Studio, and before that
Evergage). Its developer docs live under `developer.salesforce.com/docs/marketing/personalization/`.
Salesforce also sells a newer, Data Cloud-native product called **Salesforce Personalization**,
documented under `developer.salesforce.com/docs/marketing/einstein-personalization/`. The two look
alike (both have an "Example Sitemap" page, for instance), but the second one's instructions don't
apply here. **Check the URL before following anything.**

#### How to read the markers

- ✅ **Confirmed:** backed by a source listed in Appendix D, or seen in the demo instance
  (Appendix B lists what was confirmed there).
- ⚠️ **Check as you build:** the feature is documented, but the exact button label or layout
  hasn't been seen yet, and these move between releases. Use the linked help article. When you
  find the real label, record it in `HANDOVER.md` so the next person doesn't have to hunt for it.

#### The cold-start constraint (still governs every choice)

A brand-new dataset with one visitor has no behavioural data and no completed model runs.
Anything that learns from **other** visitors (co-browse, co-buy, trending) returns nothing or
generic output. Three things work from the very first session:

- the visitor's **own** history (recently viewed);
- **catalog attributes** (same category);
- **segments** built on the current visitor's behaviour.

Everything promised for the demo is built from those three.

---

### 4.1 Declare content zones in the sitemap (code change, ~10 minutes)

**Why.** The Phase 3 sitemap tracks events but declares no content zones. Web templates find
their target element **by zone name, through the sitemap**. Salesforce's own recommendations template
calls `SalesforceInteractions.mcis.getContentZoneSelector(context.contentZone)`. If no zone is
declared, there's nothing to render into, and you get no error at all. ✅

**Where.** The Sitemap Editor in the Visual Editor extension, where you authored Phase 3.2.

**Steps.**

1. Open the published site in Chrome and open the Sitemap Editor.
2. Add a `contentZones` array to the `home` and `product` page types. Change nothing else:

   ```js
   {
     name: "home",
     isMatch: () => tg().pageType === "home",
     interaction: { name: "Home Page" },
     contentZones: [
       { name: "home_banner", selector: "#mcp-zone-banner" },
       { name: "home_recs",   selector: "#mcp-zone-home" }
     ]
   },
   // ... catalog page type unchanged ...
   {
     name: "product",
     isMatch: () => tg().pageType === "product" && !!tg().product,
     interaction: { /* unchanged */ },
     contentZones: [
       { name: "pdp_recs", selector: "#mcp-zone-pdp" }
     ],
     listeners: [ /* unchanged */ ]
   },
   ```

3. **Save** the sitemap ✅. The Sitemap Editor has no publish step, so saving is all there is.
   Web templates do have one (see 4.5).
4. Copy the saved sitemap into `docs/sitemap.js` and commit it.

**Rules** ✅
- Every zone needs a `name`. `selector` is optional only for templates that draw over the whole
  page, such as pop-ups. Web campaigns that render into an element need the selector. Every zone
  here is a div, so every zone gets one.
- Zones can be declared on a page type (as above) or globally in `global.contentZones`. Per page
  type is right here, because `pdp_recs` only exists on product pages.
- The **name** is what you'll pick later in the template and campaign editors. Choose it now and
  don't rename it, because campaigns reference it by name.
- The zone divs are already in the initial HTML (Phase 1.3). The template also waits for its
  element to exist (`DisplayUtils.pageElementLoaded`), so there's nothing to change in the page
  markup.

**Check.** You can't fully verify this step yet. The real check comes in 4.5: `home_banner`,
`home_recs` and `pdp_recs` must appear in the template's content-zone list. If they're missing,
the sitemap change isn't live.

---

### 4.2 Recipe A — "More in this category" (PDP zone)

**Goal.** On `product.html?id=X`, show other in-stock products from X's category, and never X
itself.

**Where.** MCP UI → **Einstein Recipes** ✅, a top-level menu item.

**What you're configuring** ✅
- **Ingredients** are where candidate items come from. A recipe can combine several, each with
  a weight.
- **Exclusions and inclusions** are filters. An exclusion keeps everything *except* what it
  names. An inclusion drops everything *except* what it names, so one badly scoped inclusion can
  empty a recipe.
- **Boosters** push items matching the visitor's affinities (e.g. brand) up the list.
- **Variations** widen the spread of what visitors see.

**Steps.**

1. **New recipe.** Name it `TG - PDP - Same category` and set the item type to **Product**.
2. **Ingredient: Any Eligible Item** ✅ (enabled on the demo dataset). It needs no behavioural
   data, so it works on a cold dataset. It supplies the candidates, and steps 3–5 narrow them
   down.
3. **Same category.** Add the built-in rule that restricts results to the same category as the
   item being viewed ✅. Salesforce's own example is a customer viewing a hat who then sees only
   other hats. This works because Phase 2 made Category a related catalog object. ⚠️ exact label.
4. **Exclude the item being viewed.** ⚠️ label.
5. **Exclude items in the visitor's cart.** ⚠️ label. Be aware ✅ that MCP keeps cart contents on
   the profile indefinitely unless the site manages them, and this site never clears the cart
   after a purchase. On an old profile, something bought weeks ago can still count as "in cart".
   Demoing in a fresh incognito window avoids this.
6. **Out-of-stock items: no rule needed.** TG-008 (inventory 0) is already ineligible under the
   Phase 2.1 eligibility rule.
7. **Boosters: none yet.** Add a brand-affinity booster once everything else works ✅. Boosters
   exist, but the label is ⚠️.
8. **Save** ⚠️, and enable the recipe if it has an on/off state.

**Number of items.** The template sets how many items appear, not the recipe. Salesforce's
recommendations template asks for 4 (`maximumNumberOfProducts = 4`, see 4.5).

**Why this recipe belongs on the PDP only.** "Same category as the item being viewed" needs a
*context item*, and only the product page supplies one. It's the only page type that tracks a
catalog object (`ViewCatalogObject`, Phase 3.2). On the home page there's nothing to compare
against. This is reasoning from how the sitemap works, not a quote from the docs.

---

### 4.3 Recipe B — "Recently viewed" (home zone)

1. **New recipe.** Name it `TG - Home - Recently viewed` and set the item type to **Product**.
2. **Primary ingredient: Recently Viewed** ⚠️ label (the name comes from practitioner sources,
   Appendix D). It uses the visitor's own history, so it works from the first session.
3. **Fallback ingredient: Any Eligible Item** ✅ (see 4.2 step 2), weighted well below Recently
   Viewed ✅ (ingredients carry weights). It then only fills the slots Recently Viewed can't, which
   is why a first-time visitor sees products instead of an empty box.
4. **Don't exclude recently viewed items**, because they're the point of this zone. Excluding cart
   items is optional.
5. **Save.**

---

### 4.4 Test both recipes before building on them

Personalization has a recipe test feature ✅ (*Test an Einstein Recipe*) and a troubleshooting
guide ✅ (*Troubleshoot an Einstein Recipe*). The controls are ⚠️, but the expected results are
fixed by the catalog:

| Recipe | Test with | Expect | Must never appear |
|---|---|---|---|
| A — same category | context item `TG-001` (footwear) | TG-002, TG-003, TG-004, TG-005 | TG-001 |
| A — same category | context item `TG-011` (gear) | TG-012, TG-013, TG-014, TG-015 | TG-011 |
| A — same category | context item `TG-006` (apparel) | TG-007, TG-009, TG-010 — **only 3** | TG-006, **TG-008** |
| B — recently viewed | a visitor with no history | fallback items | TG-008 |

**The apparel result is expected, not a bug.** Apparel has five products. One is being viewed and
TG-008 is ineligible, which leaves three. This is the out-of-stock talking point, and it's visible
in the zone. The first version of this plan claimed every category fills four slots exactly; that
holds everywhere except apparel.

**If a test returns nothing,** check the Phase 2.1 eligibility rule first. The usual cause is
catalog items with `localhost` or relative `url`/`imageUrl` values. After that, work through
*Troubleshoot an Einstein Recipe*.

---

### 4.5 Templates — start from Salesforce's global templates

Don't write templates from scratch for this demo. Personalization ships **global web
templates** ✅, and two of them match this build:

| Global template | Renders | Tag with zones |
|---|---|---|
| **Einstein Product Recommendations** | a row of products from a chosen recipe | `home_recs`, `pdp_recs` |
| **Banner with Call-To-Action** | a banner with text, image and link | `home_banner` |

**Steps.**

1. MCP UI → **Web → Web Templates** ✅. Both global templates are already on the demo
   dataset ✅.
2. Open **Einstein Product Recommendations**, set its content zones to `home_recs` and `pdp_recs`,
   then save and **publish** the template ✅. Unlike the sitemap, templates have a Publish step,
   and campaigns can only use published templates. The template's own header comment says: *"Set
   the content zone(s) to that defined in your Sitemap."* ✅
3. Do the same for **Banner with Call-To-Action**, with `home_banner`.
4. If a global template won't let you change its zones ⚠️, create a new web template and paste in
   the four files from the public archive in Appendix D (`serverside.ts`, `handlebars.hbs`,
   `clientside.js`, `css.css`), one file per editor tab.

**Why the tagging matters** ✅ When you build a campaign you pick the zone first, and the editor then
offers only **published** templates that are **tagged with that zone**. An untagged template simply
doesn't appear.

#### What's inside the recommendations template (read before you debug it)

The code below is quoted from the archive of Salesforce's global templates (Appendix D).

**Server-side (TypeScript)** runs on Personalization's servers, not in the browser, and calls the
recipe:

```ts
import { RecommendationsConfig, recommend } from "recs";
// ...
@hidden(true)
maximumNumberOfProducts: 2 | 4 | 6 | 8 = 4;

@title("Recommendations Block Title")
header: string = "Title Text";

@title(" ")
recsConfig: RecommendationsConfig = new RecommendationsConfig()
    .restrictItemType("Product")
    .restrictMaxResults(this.maximumNumberOfProducts);

run(context: CampaignComponentContext) {
    this.recsConfig.maxResults = this.maximumNumberOfProducts;
    return {
        itemType: this.recsConfig.itemType,
        products: recommend(context, this.recsConfig)
    };
}
```

Each decorated property becomes a field in the campaign editor, much like the `@api` properties an
LWC exposes to App Builder through its `.js-meta.xml`. `recsConfig` is the **recipe picker**, and
`run()` returns the data the Handlebars template receives.

**Handlebars** reads every catalog field as `attributes.<field>.value`. These are the fields you
imported in Phase 2, which is why the eligibility rule matters. Abridged:

```handlebars
{{#each products}}
<article class="evg-product-rec" data-evg-item-id="{{id}}" data-evg-item-type="{{../itemType}}">
    <a href="{{attributes.url.value}}">
        <img class="evg-product-img" src="{{attributes.imageUrl.value}}" alt="{{attributes.name.value}}"/>
    </a>
    ... ${{~attributes.price.value~}} ...
</article>
{{/each}}
```

If you ever customise the template, keep the `data-evg-item-id` / `data-evg-item-type`
attributes, which identify each item for campaign statistics ⚠️.

**Client-side (JavaScript)** runs in the browser and puts the HTML into the zone:

```js
function apply(context, template) {
    const contentZoneSelector = SalesforceInteractions.mcis.getContentZoneSelector(context.contentZone);
    return SalesforceInteractions.DisplayUtils
        .bind(buildBindId(context))
        .pageElementLoaded(contentZoneSelector)   // waits for the zone div to exist
        .then((element) => {
            const html = template(context);
            SalesforceInteractions.cashDom(element).html(html);   // replaces the zone's contents
        });
}
```

The same file also defines `reset`, which removes what was rendered, and `control`. For
control-group visitors, `control` only tags the zone and renders **nothing**, so an empty zone can
mean the campaign is working as designed.

**Two cosmetic quirks, fine to leave for a demo:**
- Price renders with a literal `$` from the Handlebars, while the site shows `£`. Fixing it needs
  your own copy of the template (step 4).
- The template prints its own heading, and the page already has an `<h2>` above each zone. In each
  campaign, **clear "Recommendations Block Title"** (the heading only renders `{{#if header}}`) ✅,
  and untick **"Show product description"** to keep the cards compact.

---

### 4.6 Segment — "Footwear browsers" (for the banner)

**Where.** MCP UI → **Segments** ⚠️ menu path → **New Segment** ✅.

**Steps.** These follow *Create a Segment*; the category and rule names were confirmed in the demo
instance ✅.
1. Click **New Segment** and enter the Segment Name `TG - Footwear browsers`.
2. **Select Category: Items.** The full category list is Campaigns, Actions, Subscriptions,
   Visits, Locations, Metrics, Gears and Items. **Items** is the one with rules about catalog
   items.
3. **Rule: Item Action Count.** Set it to the Category **Footwear**, **at least 2** times, in
   the **last 1 day**.
4. **Save.**

**Why "last 1 day" is fine.** The design says "in the current session", but the rule counts in
days. Each demo run starts in a fresh incognito window, which is a brand-new anonymous visitor
with no history, so for the demo "last 1 day" and "this session" behave the same.

**It counts actions, not distinct products** (inferred from the rule's name). Refreshing the same
boot page twice will probably qualify a visitor too. That's harmless in the demo, but don't be
surprised by it.

**Timing** ✅ Segment membership is evaluated in real time, so there's no batch job to wait for. The
visitor joins on their second footwear product view and sees the banner on the **next load of
the home page**, which is where the banner zone is.

---

### 4.7 Campaigns — one per zone

Build three small campaigns rather than one big one, so that when something breaks you know which
it is.

| Campaign | Zone | Template | Fields to set | Audience |
|---|---|---|---|---|
| `TG - PDP recs` | `pdp_recs` | Einstein Product Recommendations | recipe `TG - PDP - Same category`; clear block title; untick description | everyone |
| `TG - Home recs` | `home_recs` | Einstein Product Recommendations | recipe `TG - Home - Recently viewed`; clear block title; untick description | everyone |
| `TG - Footwear banner` | `home_banner` | Banner with Call-To-Action | headline; image `https://<username>.github.io/mcp-demo-trailgear/assets/img/TG-001.svg`; link `https://<username>.github.io/mcp-demo-trailgear/catalog.html?category=footwear` | segment `TG - Footwear browsers` |

**Steps for each campaign.** The editor's layout hasn't been seen yet ⚠️, so check each step
against what's on screen (and see *Set Up the Visual Editor*).

1. **New web campaign** from the MCP menu ✅, named as in the table.
2. Keep the single default **experience**.
3. **Add the template to the experience** ⚠️: choose the **zone first**, then the template. Only
   templates tagged with that zone are offered ✅. If the list is empty, go back to 4.5 (tagging)
   or 4.1 (zone not live).
4. **Fill in the fields** from the table. The recipe picker is the `recsConfig` field from 4.5.
5. **Audience.** On the banner campaign only, add a rule on **segment membership** ⚠️ for
   `TG - Footwear browsers`. The two recommendation campaigns need no rule, because their zones only
   exist on their own page types (4.1).
6. **Set the control group to 0% for the demo** ⚠️ (see *A/B Test Campaigns*). The control group
   is the share of visitors MCP deliberately shows nothing, so that it can measure whether the
   campaign makes a difference. Look for a percentage split or a "control" setting, and set it to
   0. A visitor who lands in the control group goes down the template's `control` path and sees
   an empty zone. That's correct behaviour, and it looks exactly like a fault.
7. **Save. Don't publish yet.**

---

### 4.8 Test campaigns without publishing

Add `evergageTestMessages=<CAMPAIGN_ID>` to the page URL ✅. The campaign then behaves as if it
were published, for you alone, and **still applies all of its rules**. What you see is what a real
visitor who qualifies would see.

```
https://<username>.github.io/mcp-demo-trailgear/product.html?id=TG-001&evergageTestMessages=<CAMPAIGN_ID>
https://<username>.github.io/mcp-demo-trailgear/index.html?evergageTestMessages=<CAMPAIGN_ID>
```

- The campaign ID is shown in the campaign editor ⚠️.
- There's also **experience testing** (`evergageTestMessages=<EXPERIENCE_ID>`) ✅. It forces one
  experience and **ignores** the rules, which is handy for checking the banner's look before you
  qualify for the segment.
- The extra parameter doesn't pollute the catalog. The sitemap sends `window.TG.product.url`,
  which is rebuilt from the product ID rather than copied from the address bar.
- Campaign statistics **are** recorded during testing ✅, so expect your test views in the numbers.
- The *Campaign Debugger* page in Appendix D documents further testing tools.

**If a test shows nothing, check in this order:**
1. **Control group.** Are you in it? ✅ Salesforce's docs warn about this explicitly. Set it to 0%
   (4.7 step 6).
2. **Tagging.** Is the template tagged with this zone (4.5)?
3. **Zone.** Is it in the **live** sitemap (4.1)?
4. **Recipe.** Does it return items in its own test (4.4)?
5. **Banner only.** Are you actually in the segment yet? Use experience testing to bypass the
   segment rule.

---

### 4.9 Publish and verify

1. Publish all three campaigns ⚠️.
2. In one window, open **Reports → Activity → Event Stream** ✅.
3. In a **fresh incognito** window, go to the published site (no test parameter) and walk this path:

| Step | `home_recs` | `home_banner` | `pdp_recs` |
|---|---|---|---|
| 1. Home, first visit | fallback products | empty | — |
| 2. Open TG-001 | — | — | TG-002, TG-003, TG-004, TG-005 |
| 3. Open TG-003 | — | — | TG-001, TG-002, TG-004, TG-005 |
| 4. Back to home | includes TG-001 and TG-003 | **banner visible** | — |
| 5. Open TG-006 (apparel) | — | — | TG-007, TG-009, TG-010 (3 items, never TG-008) |

**Checkpoint:** on a fresh incognito visit to the published site, both recommendation zones render
before any history exists. The banner appears only after the second footwear view, and TG-008
never appears. The old checkpoint said all *three* zones render with no history, which can't be
true of a segment-targeted banner.

---

## Phase 5 — Validate

### 5.1 Catalog walk

Visit all 20 PDPs once, **on the published site**. This confirms every item tracks with the
right ID and back-fills anything the import missed. Watch **Reports → Activity → Event Stream** ✅
as you go: each visit should produce a View Product event carrying that product's ID. You can do
this any time after Phase 3. Doing it before 4.4 means the recipe tests run against a catalog you
know is complete.

### 5.2 End-to-end validation

| Check | Where |
|---|---|
| Beacon returns 200 on all 5 pages | Network tab |
| Correct page type matched per page | `getCurrentPage()` (Phase 3.3) |
| `window.TG` correct on each page | Console |
| Events appear in near real time | **Reports → Activity → Event Stream** |
| View Product carries the correct catalog ID | Event Stream |
| Catalog URLs point at the published site, not localhost | Catalog UI |
| Purchase fires once, with line items and total | Event Stream |
| Refreshing thank-you does **not** re-fire | Event Stream |
| Zones `home_banner`, `home_recs`, `pdp_recs` listed | Template content-zone list (4.5) |
| Recipe tests match the 4.4 table | Recipe test (4.4) |
| Each campaign renders with `evergageTestMessages` | Live site (4.8) |
| Control group at 0% on all three campaigns | Campaign editor (4.7) |
| Both recommendation zones render for a visitor with no history | Live site, incognito |
| Banner appears only after the second footwear view | Live site, incognito |
| Apparel PDP shows 3 items; TG-008 never appears anywhere | Live site |
| Category affinity builds after 3 same-category views | Visitor profile ⚠️ (optional talking point) |

**The demo is complete when** visitor activity shows in the Event Stream in near real time, both
recommendation zones render catalog-backed content for a visitor with no history, and the banner
appears for a visitor who has just joined the segment.

---

## Phase 6 — Demo script (~7 minutes)

**Set-up, ten minutes before:**
- All three campaigns published (4.9), with control groups at 0%.
- Any `setLoggingLevel` call removed from the sitemap (Phase 3.3).
- **Window 1:** Reports → Activity → Event Stream.
- **Window 2:** a **fresh incognito** window on the published home page. MCP profiles persist, so
  every run needs a new incognito window, or the second run behaves differently from the first.
- **Window 3 (optional):** a window already warmed with browsing history, for "known visitor"
  moments.

1. **Fresh visitor, home page.** "Recommended for you" shows fallback products and the banner zone
   is empty. In window 1, the Home Page event has just arrived: the "we know someone is here from
   the first page view" moment.
2. **Open two footwear PDPs, TG-001 then TG-003.** Point at "More in this category": it shows only
   footwear, and never the boot you're looking at. Show the View Product events landing with their
   IDs.
3. **Return home.** The footwear banner has appeared (real-time segment), and Recently Viewed now
   includes both boots. This is the payoff, and it's fully deterministic.
4. **Open an apparel PDP (TG-006).** Only three recommendations show. The missing fourth is the
   out-of-stock puffer, TG-008. Nobody wrote a rule for it; inventory 0 makes it ineligible.
5. **Add to cart, checkout.** Show the Purchase event with its line items and order total.
6. **Close on the extension point:** same catalog, same profile, now available to email, mobile
   and server-side channels. This is where it stops being a website demo.

If a recommendation zone misbehaves live, lead with the banner and Recently Viewed, which don't
depend on models. Don't debug in front of the audience; Appendix A is for afterwards.

---

## Appendix A — Troubleshooting

| Symptom | Most likely cause |
|---|---|
| No products anywhere on the site | Page opened as a `file://` URL. Serve over HTTP — Phase 1.5. The page will now say so itself |
| Products load locally but not on Pages | GitHub Pages CDN cache, ~10 minutes; or `.nojekyll` missing |
| No events at all | `beaconUrl` still `null`; `initSitemap()` never called; `init()` promise rejected; `cookieDomain` set to `github.io`; or the domain is not allow-listed on the dataset |
| Beacon fails to load locally | Protocol-relative `//cdn.evgnet.com` resolving to `http:` on a local HTTP page. Write `https:` explicitly |
| Events fire but no page type matches | `window.TG` not yet populated — check `window.TG` and `TG_READY` in the console. Do **not** add a beacon `<script>` tag to the HTML to "fix" this; that is what causes it |
| PDP throws in the sitemap resolvers | `?id=` does not resolve to a product. Guard with `&& !!tg().product` — Phase 3.2 |
| View Product tracked but no catalog data | Custom attributes not created in the UI first; unmapped attributes are dropped silently |
| Catalog items show `localhost` URLs | Tracking was enabled while browsing locally. Re-import the CSVs with the public base URL — see *Local vs hosted* |
| **Campaign never renders, no errors anywhere** | Zone not declared in the live sitemap (4.1); template not tagged with the zone (4.5); or the zone name is spelled differently in the two places |
| Template missing from the campaign's template list | Template not tagged with that zone, or the template itself not published (4.5) |
| Renders with `evergageTestMessages` but not without | Campaign not published (4.9) |
| Renders for a colleague but not for you, or vice versa | One of you is in the control group. Set it to 0% (4.7) |
| Zone empty despite a correct recipe | Items ineligible (missing, relative or `localhost` `url`/`imageUrl`); an inclusion that's too narrow; or the recipe never passed its own test (4.4) |
| Apparel PDP shows 3 items, not 4 | Expected: TG-008 is ineligible (4.4) |
| Any other zone shows 1–2 items instead of 4 | No fallback ingredient on the recipe, or an inclusion that's too narrow |
| Banner doesn't appear after two footwear views | You're still on a PDP (the banner zone is on home); the segment rule doesn't match Category; the banner campaign isn't published; or you're in the control group |
| Heading appears twice above a zone | "Recommendations Block Title" not cleared in the campaign (4.5) |
| Prices show `$` instead of `£` | The global template hard-codes it. Cosmetic (4.5) |
| An item bought weeks ago is excluded as "in cart" | Cart contents persist on the profile (4.2 step 5). Use incognito |
| Recommendations identical for everyone | Expected on a cold dataset: the fallback is doing its job, not a fault |
| Campaign stats inflated before the demo | Test views are counted (4.8) |
| Demo behaves differently than in rehearsal | Existing visitor profile with accumulated affinity; use incognito |
| A doc page's steps don't match your UI at all | You may be reading *Salesforce Personalization* (Data Cloud) docs rather than Marketing Cloud Personalization (4.0) |

## Appendix B — Instance facts and open questions

**Confirmed in the demo instance (30 September 2026)**

| Question | Answer |
|---|---|
| Is Any Eligible Item enabled? | Yes (4.2, 4.3) |
| Where are recipes? | **Einstein Recipes**, a top-level menu item (4.2) |
| Where are templates? | **Web → Web Templates** (4.5) |
| Are the global templates present? | Yes: **Einstein Product Recommendations** and **Banner with Call-To-Action** (4.5) |
| Does the sitemap need publishing? | No: the Sitemap Editor only saves. Web templates do have a Publish step (4.1, 4.5) |
| Segment categories | Campaigns, Actions, Subscriptions, Visits, Locations, Metrics, Gears, Items (4.6) |
| Rule for "2+ footwear views" | **Items → Item Action Count**: Category Footwear, at least 2 times, in the last N days (4.6) |
| Can web campaigns be created from the MCP menu? | Yes (4.7) |
| Who can publish? | You; it's a demo instance, so no sign-off is needed |

**Still open: check these as you build**
- Can content zones be set on the global templates directly, or do they need copying into your own templates first (4.5 step 4)?
- The campaign editor's layout, the audience/segment rule label, the control-group setting, and where the campaign ID is shown (4.7, 4.8).
- The recipe editor's labels for "same category", "exclude the item being viewed" and "exclude items in cart" (4.2). You're building the recipes yourself, so record the labels in `HANDOVER.md` as you go.
- Whether Category drives affinity. Check it during 5.2 by opening your own visitor profile after the footwear walk. It only matters for an optional talking point.

**Carried over from Phases 0–3, if still open**
- Namespace in use, and the exact catalog-object interaction constant.
- Whether custom attributes are mapped inside `attributes: {}` or at the object root.
- The catalog import UI's expected column headers, and whether relationships import by ID or by name.
- **Whether `localhost` can be added to the dataset's allowed domains**, and whether they are comfortable with that on a shared dataset.

## Appendix C — Out of scope

Server-side and edge personalisation; real payment processing; multi-environment tag management; identity resolution and login-based profile stitching; SFMC email/SMS channel integration (Journey Builder and similar); collaborative recipes (Co-Browse, Co-Buy, Trending) and the synthetic traffic they would need to learn from. **Web channel only.**

## Appendix D — Sources

**How these were checked.** `developer.salesforce.com` refused automated fetching (HTTP 403), and
`help.salesforce.com` returns only a loading screen to anything that isn't a browser (tested). So
the ✅ facts from those two sites were taken from their search-indexed text, not a full read. The
template code in 4.5 was read directly from the source files. Menu paths and labels marked ✅ in the
steps were seen in the demo instance (Appendix B). All of these pages open normally in a browser;
read the relevant one before each step.

**Personalization developer guide** (developer.salesforce.com)

| Page | Used for |
|---|---|
| [Content Zones](https://developer.salesforce.com/docs/marketing/personalization/guide/content-zones.html) | 4.1: `contentZones` array, name required, selector optional (glass-pane templates) |
| [Server-Side Campaigns and Content Zones](https://developer.salesforce.com/docs/marketing/personalization/guide/contentzones.html) | 4.1, 4.5: web campaigns need the zone selector; templates tagged with zones; published tagged templates offered per zone |
| [The Personalization Sitemap](https://developer.salesforce.com/docs/marketing/personalization/guide/personalization-sitemap.html) | Background on the sitemap |
| [Example Sitemaps](https://developer.salesforce.com/docs/marketing/personalization/guide/example-sitemaps.html) | Reference sitemaps, including where `contentZones` sit |
| [Sitemap Event Validation](https://developer.salesforce.com/docs/marketing/personalization/guide/sitemap-event-validation.html) | 4.9, 5.x: Event Stream at Reports → Activity → Event Stream |
| [Personalization Template System](https://developer.salesforce.com/docs/marketing/personalization/guide/personalization-template-system.html) | 4.5: template anatomy (server-side, client-side, Handlebars, CSS) |
| [Recommendations](https://developer.salesforce.com/docs/marketing/personalization/guide/recommendations.html) | 4.5: `import { RecommendationsConfig, recommend } from "recs"` |
| [Template Server TypeScript](https://developer.salesforce.com/docs/marketing/personalization/guide/template-server-typescript.html) | 4.5: decorators such as `@title`, `@hidden` |
| [Web Template Handlebars](https://developer.salesforce.com/docs/marketing/personalization/guide/web-template-handlebars.html) | 4.5: Handlebars in templates |
| [Get Started with Global Web Templates](https://developer.salesforce.com/docs/marketing/personalization/guide/get-started-global-web-templates.html) | 4.5: global templates |
| [Web Template Building Best Practices](https://developer.salesforce.com/docs/marketing/personalization/guide/web-template-building-best-practices.html) | Reading before customising a template |
| [Campaign Debugger](https://developer.salesforce.com/docs/marketing/personalization/guide/campaign-debugger.html) | 4.8: `evergageTestMessages`; campaign vs experience testing |
| [Example Sitemap — *Salesforce Personalization*](https://developer.salesforce.com/docs/marketing/einstein-personalization/guide/example-sitemap.html) | 4.0: the **other** product's docs, to recognise and avoid |

**Salesforce Help** (help.salesforce.com)

| Article | Used for |
|---|---|
| [Einstein Recipes](https://help.salesforce.com/s/articleView?id=mktg.mc_pers_einstein_recipe.htm&language=en_US&type=5) / [About Einstein Recipes](https://help.salesforce.com/s/articleView?id=mktg.mc_pers_einstein_recipe_about.htm&language=en_US&type=5) | 4.2: recipe components |
| [Create an Einstein Recipe](https://help.salesforce.com/s/articleView?id=sf.mc_pers_einstein_recipe_create.htm&language=en_US&type=5) | 4.2, 4.3: menu path and creation steps |
| [Einstein Recipe Ingredients](https://help.salesforce.com/s/articleView?id=sf.mc_pers_einstein_recipe_ingredient.htm&language=en_US&type=5) | 4.2, 4.3: ingredient list (confirm names here) |
| [Exclusions and Inclusions in Einstein Recipes](https://help.salesforce.com/s/articleView?id=sf.mc_pers_einstein_recipe_exclusion_inclusion.htm&language=en_US&type=5) | 4.2: exclusion vs inclusion semantics; same-category example; cart persistence |
| [Boosters in Einstein Recipes](https://help.salesforce.com/s/articleView?id=sf.mc_pers_einstein_recipe_booster.htm&language=en_US&type=5) | 4.2 step 7 |
| [Test an Einstein Recipe](https://help.salesforce.com/s/articleView?id=sf.mc_pers_einstein_recipe_test.htm&language=en_US&type=5) | 4.4 |
| [Troubleshoot an Einstein Recipe](https://help.salesforce.com/s/articleView?id=mktg.mc_pers_einstein_recipe_troubleshoot.htm&language=en_US&type=5) | 4.4 |
| [Create a Segment](https://help.salesforce.com/s/articleView?id=mktg.mc_pers_segment_create.htm&language=en_US&type=5) | 4.6: New Segment → Select Category → Rule; real-time membership |
| [Segment Categories and Rules](https://help.salesforce.com/s/articleView?language=en_US&id=mktg.mc_pers_segment_category_rule.htm&type=5) | 4.6: the rule you need |
| [Use Segments](https://help.salesforce.com/s/articleView?id=sf.mc_pers_segment_use.htm&language=en_US&type=5) | 4.7: segment targeting |
| [Set Up the Visual Editor](https://help.salesforce.com/s/articleView?id=mktg.mc_pers_web_campaign_visual_editor.htm&language=en_US&type=5) | 4.7: campaign editor |
| [Test a Web Campaign](https://help.salesforce.com/s/articleView?id=sf.mc_pers_web_campaign_test.htm&language=en_US&type=5) / [Test a Campaign Experience](https://help.salesforce.com/s/articleView?id=sf.mc_pers_web_campaign_experience_test.htm&language=en_US&type=5) | 4.8 |
| [A/B Test Campaigns](https://help.salesforce.com/s/articleView?language=en_US&id=mktg.mc_pers_web_campaign_a_b_test.htm&type=5) | 4.7 step 6: control groups |

**Trailhead**

| Unit | Used for |
|---|---|
| [Explore Einstein Recipes and Einstein Decisions](https://trailhead.salesforce.com/content/learn/modules/einstein-recipes-and-decisions-quick-look/explore-einstein-recipes-and-einstein-decisions) | 4.2: the four recipe components, in Salesforce's own words |

**Community and third-party**

| Source | Used for |
|---|---|
| [MateuszDabrowski/mcp-campaign-templates](https://github.com/MateuszDabrowski/mcp-campaign-templates): archive of Salesforce's Global Templates. See [Einstein Product Recommendations](https://github.com/MateuszDabrowski/mcp-campaign-templates/tree/main/Global%20Templates/SalesforceInteractions/Einstein%20Product%20Recommendations) and [Banner with Call-To-Action](https://github.com/MateuszDabrowski/mcp-campaign-templates/tree/main/Global%20Templates/SalesforceInteractions/Banner%20with%20Call-To-Action) | 4.5: all quoted template code, read directly. A community copy, so compare it with the version in your instance |
| [Mateusz Dąbrowski — MCP Serverside Code Context](https://mateuszdabrowski.pl/docs/salesforce/marketing-cloud-personalization/serverside-code-context/) | Further reading on what `context` holds in server-side code |
| [Credera — Einstein Recipes Explained](https://credera.com/insights/whats-cooking-einstein-recipes-explained) and [JourneyBlazers — Einstein Recipes](https://journeyblazers.com/einstein-recipes-transparent-trainable-and-zero-code-machine-learning-algorithms-2/) | 4.3: the ingredient name Recently Viewed, and that ingredients carry weights. Practitioner overviews, not official |

---

*Drafted with AI assistance. Phases 4 onward were revised in September 2026 against the sources in
Appendix D. Review with hands-on access to the MCP instance before execution, and treat the ⚠️ items
as unconfirmed until you've seen them in your own UI. The code here is a starting point to check
against the instance, not something to run unread.*
