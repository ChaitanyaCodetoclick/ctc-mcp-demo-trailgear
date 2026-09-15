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

---

## Phase 0 — Prerequisites

**Gate: do not start Phase 3 until every item below is confirmed.** Several of these are hard blockers — in particular, catalog attributes must exist in the MCP UI before a sitemap can reference them.

Confirm with whoever owns the MCP instance:

1. **Account name and dataset name.** Both appear in the Gears URL in the MCP UI (e.g. `https://<account>.<instance>.evergage.com/`). Use a **non-production / demo dataset** — this exercise generates junk profiles.
2. **Beacon script URL**, of the form `//cdn.evgnet.com/beacon/<account>/<dataset>/scripts/evergage.min.js`.
3. **Namespace.** New builds should use the `SalesforceInteractions` namespace (`interaction`, `catalogObject`, `CartConfig`). The older `Evergage` namespace (`action`, `catalog`, `OrderConfig`, `LineItem`) is still supported and much published example code uses it. **Pick one and do not mix** — the object shapes differ.
4. **Personalization Visual Editor browser extension** installed, and confirmed able to connect to the account/dataset. The Sitemap Editor lives inside it; without it there is no practical way to author or debug the sitemap.
5. **Site domain registered** on the dataset's web channel / allowed domains.
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
│   └── img/                 # 20 placeholder images, ~400x400, named <id>.jpg
├── data/
│   ├── products.json        # SINGLE SOURCE OF TRUTH
│   └── build_catalog.py     # generates the MCP import files
├── docs/
│   └── sitemap.js           # version-controlled copy of the sitemap (Phase 3)
└── README.md
```

### 1.2 The page-level data layer

**Do not let the sitemap scrape the DOM** for product ID, price or category. DOM scraping is the most brittle part of any MCP implementation and breaks the moment someone edits the markup. Instead, every page publishes a small stable object *before* the beacon initialises:

```html
<!-- product.html, written by app.js as soon as the product resolves -->
<script>
window.TG = {
  pageType: "product",
  product: {
    id: "TG-001",
    name: "Summit Trail Hiking Boots",
    url: "https://<username>.github.io/mcp-demo-trailgear/product.html?id=TG-001",
    imageUrl: "https://<username>.github.io/mcp-demo-trailgear/assets/img/TG-001.jpg",
    description: "Waterproof, breathable hiking boots built for rocky terrain.",
    price: 129.99,
    categoryId: "footwear",
    brand: "TrailGear",
    inventoryCount: 12
  }
};
</script>
```

`window.TG.pageType` is set on all five pages — one of `home`, `catalog`, `product`, `cart`, `order`. This makes sitemap `isMatch` logic trivial and independent of URL structure.

**Ordering matters:** `datalayer.js` must run before the beacon initialises, or no page type will match.

### 1.3 Page requirements

| Page | Must contain |
|---|---|
| `index.html` | nav; `<div id="mcp-zone-home"></div>`; `<div id="mcp-zone-banner"></div>` |
| `catalog.html` | `<div id="product-grid">` populated from `data/products.json`; cards link to `product.html?id=TG-0xx` |
| `product.html` | `<div id="product-detail">`; `<div id="mcp-zone-pdp"></div>`; `<button id="add-to-cart-btn">` |
| `cart.html` | `<div id="cart-items">` rendered from `localStorage`; `<button id="checkout-btn">` |
| `thankyou.html` | order summary read from `sessionStorage` |

Zone divs must be **present in the initial HTML**, not created by JS after the beacon runs, or campaigns will have nothing to target. Give each a fixed `min-height` so the page does not jump when personalised content lands.

### 1.4 Cart and order handoff

- **Add to cart** → push to `localStorage.tg_cart`.
- **Checkout button** → build an order object, write it to `sessionStorage.tg_order`, clear `localStorage.tg_cart`, redirect to `thankyou.html`. **Fire no MCP event here.**
- **`thankyou.html` on load** → read `sessionStorage.tg_order`, expose it as `window.TG.order`, let the sitemap fire the purchase interaction, then write the order ID into `localStorage.tg_last_order_sent`.
- **Idempotency:** before exposing the order, compare its ID against `tg_last_order_sent`. If it matches, do not expose it. This stops a page refresh from double-firing the purchase.

Order object shape:

```js
{
  id: "TG-ORDER-" + Date.now(),
  total: 219.98,
  lineItems: [ { id: "TG-001", price: 129.99, quantity: 1 },
               { id: "TG-011", price: 159.99, quantity: 1 } ]
}
```

### 1.5 Publish

```bash
git init && git add . && git commit -m "TrailGear MCP demo site"
git branch -M main
git remote add origin https://github.com/<username>/mcp-demo-trailgear.git
git push -u origin main
```

Then: **Settings → Pages → Deploy from branch → `main` / root**.

### 1.6 GitHub Pages specifics

- **Add `.nojekyll`** at the repo root. Without it, Pages runs Jekyll, which ignores paths beginning with `_` and can surprise you.
- **Published assets are CDN-cached for roughly 10 minutes.** After editing `products.json`, a hard refresh may still serve the old copy. During build, fetch it with a cache-buster (`products.json?v=<timestamp>`); remove before demoing.
- `github.io` is on the Public Suffix List, so the tracking cookie scopes to `<username>.github.io` only. That works — but do **not** set `cookieDomain: "github.io"` in `init()`. It will be rejected and tracking will silently fail. Omit `cookieDomain` entirely, or set the full host.
- **Demo in Chrome.** Safari's ITP caps JS-set first-party cookies at around 7 days, so a profile built earlier in the week may be gone by demo day.

**Checkpoint:** all five pages load over HTTPS (required by the web SDK), `window.TG` is correct on each when inspected in the console, the cart round-trips, and `thankyou.html` shows a sane order.

---

## Phase 2 — Product catalog

### 2.1 Data model

| MCP object | Fields |
|---|---|
| **Product** (standard) | `id`, `name`, `url`, `imageUrl`, `description`, `price`; custom: `brand`, `inventoryCount` |
| **Category** (standard, related) | `id`, `name`, `url` — related to Product via the categories relationship |

Model category as a **related catalog object**, not a flat string attribute. The relationship is what drives category affinity and "same category" recipes. Brand stays a custom attribute, which makes it usable as an affinity booster.

**Eligibility rule — memorise this.** For a product to be returned by a recipe it must have a name, ID, URL, image URL, price, and an inventory that is either null or non-zero. An item missing any one of these is dropped from recommendations **silently**. This is why URLs must be absolute and why zero-inventory items disappear from zones without any rule being written.

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

Five items per category matters: after excluding the item being viewed, a category-scoped recipe still fills a 4-slot carousel. Fewer categories' worth of stock and the zone looks broken.

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

Note what is **not** stored: `url` and `imageUrl`. Both are derived from `id` and `BASE_URL` at build time, so they can never drift and can never accidentally be relative.

### 2.3 Generator — `data/build_catalog.py`

```python
#!/usr/bin/env python3
"""Single source of truth -> MCP import files. Never hand-edit the CSVs."""
import csv, json, pathlib

BASE = "https://<username>.github.io/mcp-demo-trailgear"
HERE = pathlib.Path(__file__).parent
CATS = {"footwear": "Footwear", "apparel": "Apparel",
        "gear": "Gear", "accessories": "Accessories"}

products = json.loads((HERE / "products.json").read_text())

def product_url(pid):  return f"{BASE}/product.html?id={pid}"
def image_url(pid):    return f"{BASE}/assets/img/{pid}.jpg"

with open(HERE / "mcp_products.csv", "w", newline="") as f:
    w = csv.DictWriter(f, ["id", "name", "url", "imageUrl", "description",
                           "price", "brand", "inventoryCount", "categoryId"])
    w.writeheader()
    for p in products:
        w.writerow({**p,
                    "url": product_url(p["id"]),
                    "imageUrl": image_url(p["id"])})

with open(HERE / "mcp_categories.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["id", "name", "url"])
    for cid, name in CATS.items():
        w.writerow([cid, name, f"{BASE}/catalog.html?category={cid}"])

print(f"Wrote {len(products)} products, {len(CATS)} categories.")
```

Run it whenever `products.json` changes. Commit the outputs so the import file and the live site are always the same vintage. The same derivation logic must be used by `app.js` when building `window.TG` — the IDs and URLs tracked by the sitemap must match the catalog exactly, or zones will render empty with no visible explanation.

### 2.4 Load into MCP

1. Import `mcp_categories.csv` **first** — the relationship needs the categories to exist.
2. Import `mcp_products.csv`, mapping `id` as the unique key and `categoryId` to the Category relationship.
3. Spot-check three items in the Catalog UI: image renders in the preview, URL is clickable and absolute, price is numeric.

> **Alternative if the import UI fights back.** MCP creates catalog items automatically from the sitemap as pages are viewed. Skip the import, complete Phase 3, then walk all 20 PDPs once (Phase 5.1) and let the sitemap build the catalog. Slower, but it makes ID mismatch structurally impossible. The CSV route is faster and gives you items that have never been viewed — which recommendations need. Doing both is the belt-and-braces option and costs about ten minutes.

**Checkpoint:** 20 products, 4 categories, no mapping errors, TG-008 showing inventory 0.

---

## Phase 3 — Web SDK and sitemap

### 3.1 Beacon

One line in `<head>` of all five pages, **above** `datalayer.js`:

```html
<script src="//cdn.evgnet.com/beacon/<account>/<dataset>/scripts/evergage.min.js"></script>
```

With no build step this is copy-pasted five times. Verify all five.

### 3.2 Sitemap

Tracking in MCP is **declarative**. Rather than calling tracking functions from your own JS, you author a sitemap in the **Sitemap Editor inside the Visual Editor extension**, and the beacon delivers it to the browser. Events are not sent to Personalization at all unless `initSitemap()` is called.

Keep a copy at `docs/sitemap.js` for version control, but the console copy is the one that runs.

Shape, using the `SalesforceInteractions` namespace:

```js
SalesforceInteractions.init({
  // omit cookieDomain on github.io — see Phase 1.6
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
        isMatch: () => tg().pageType === "product",
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

**Checkpoint:** in Event Stream / Live Activity, a manual walk produces Home Page → Category Page → View Product (with the correct catalog ID) → Add To Cart → View Cart → Purchase, in order, with no duplicates.

---

## Phase 4 — Recommendations and campaigns

Build in this order: reliable first, impressive later.

**The cold-start constraint governs every choice here.** A brand-new dataset with one visitor has no behavioural data and no completed model runs. Behavioural recipes — Trending, Most Popular, Similar Items, Customers Also Viewed — will return nothing or fall back to generic output. Anything promised for the demo must work without behavioural history.

Recipes are composed of **ingredients** (the algorithms), **exclusions** (filters), **boosters** (affinity-based prioritisation) and **fallbacks**.

### 4.1 Zone B, PDP — "More in this category" (works immediately)

- **Ingredient:** rules-based — items sharing the current item's category.
- **Exclusions:** the item currently being viewed; items already in the cart; zero-inventory items (which removes TG-008 automatically).
- **Fallback:** *Any Eligible Item*. This ingredient exists precisely to fill slots when there is not enough data for the primary ingredient. It respects existing exclusions and inclusions, and absent other rules returns a random eligible set.
- **Slots:** 4. Five items per category minus the current one fills exactly.

### 4.2 Zone A, home — "Recently viewed" (works from the first session)

Session-based, needs no model run, and demonstrates the value proposition immediately: browse three products, return home, see them. Add *Any Eligible Item* as fallback so a first-time visitor sees products rather than an empty box.

### 4.3 Banner — segment-driven personalisation (the reliable centrepiece)

Create a segment: visitors with two or more product views where category = Footwear in the current session. Create a simple web campaign that renders a banner into `#mcp-zone-banner` for visitors in that segment.

This is the part of the demo that always works — one visitor, one session, no model runs, visible before/after. Lead with it.

### 4.4 Optional stretch — a collaborative recipe

Only attempt this if Phase 5.2 seeding is done and the models have had time to run. Collaborative filtering has trending built in and defaults to trending results when there is no user or item activity in the configured lookback period — which on a fresh dataset means generic output or total reliance on the fallback. Treat any collaborative recipe as a bonus, never as the thing you promised to show.

### 4.5 Rendering

Recommendations reach the page through a **web campaign** using an item template that targets the zone selector. Common failure points:

- The campaign must be **published**. A draft campaign is visible in the Visual Editor and invisible everywhere else.
- The template's target selector must match the zone div exactly (`#mcp-zone-pdp`).
- The item template must use `imageUrl` and `url` from the catalog. Missing images or relative URLs make items ineligible, and the zone appears empty even when the recipe is correct.

**Checkpoint:** all three zones render on a fresh incognito visit, before any browsing history exists.

---

## Phase 5 — Seed and validate

**5.1 Catalog walk.** Visit all 20 PDPs once. Confirms every item tracks with the right ID and back-fills anything the import missed.

**5.2 Optional traffic seeding.** If you want collaborative recipes, run a short Playwright or Puppeteer script: 50–100 sessions, fresh browser context each, 3–5 product views per session with a category bias, some adding to cart, a few purchasing. Run it a day before the demo, not an hour before.

**5.3 End-to-end validation.**

| Check | Where |
|---|---|
| Beacon returns 200 on all 5 pages | Network tab |
| Correct page type matched per page | `getCurrentPage()` |
| Events appear in near real time | Event Stream / Live Activity |
| View Product carries the correct catalog ID | Visitor profile |
| Purchase fires once, with line items and total | Visitor profile |
| Refreshing thank-you does **not** re-fire | Visitor profile |
| Category affinity builds after 3 same-category views | Visitor profile |
| All three zones render populated | Live site, incognito |
| TG-008 never appears in a zone | Live site |

**The demo is complete when** visitor activity is visible in MCP in near real time and all three zones render live catalog-backed content for a visitor with no history.

---

## Phase 6 — Demo script (~7 minutes)

Run in a **fresh incognito window** every time — MCP profiles persist, so a second run behaves differently from the first. Have a second window already warmed with browsing history so you can switch between "new visitor" and "known visitor" without waiting.

1. **Fresh visitor, home page.** Zones show fallback content. Point out the visitor profile appearing in real time — the "we know someone is here from the first millisecond" moment.
2. **Browse three footwear PDPs.** Show events landing live in the visitor profile. Show category affinity forming.
3. **Return to home.** Recently Viewed is populated; the footwear banner has appeared. This is the payoff, and it is fully deterministic.
4. **On a PDP,** point at the category zone: the out-of-stock puffer never appears. Recommendations respect inventory without anyone writing a rule.
5. **Add to cart, checkout.** Show the purchase interaction with line items and order value.
6. **Close on the extension point:** same catalog, same profile, now available to email, mobile and server-side channels — where this stops being a website demo.

If a recommendation zone misbehaves live, fall back to the segment banner. It is the one that does not depend on models.

---

## Appendix A — Troubleshooting

| Symptom | Most likely cause |
|---|---|
| No events at all | `initSitemap()` never called; `init()` promise rejected; or `cookieDomain` set to `github.io` |
| Events fire but no page type matches | `window.TG` set after the beacon initialises — move `datalayer.js` above the beacon |
| View Product tracked but no catalog data | Custom attributes not created in the UI first; unmapped attributes are dropped silently |
| Zone empty despite a correct recipe | Campaign in draft; wrong target selector; or items ineligible (missing or relative `url`/`imageUrl`, zero inventory) |
| Zone renders 1–2 items instead of 4 | No fallback ingredient on the recipe |
| Recommendations identical for everyone | Expected on a cold dataset — the fallback doing its job, not a fault |
| Demo behaves differently than in rehearsal | Existing visitor profile with accumulated affinity; use incognito |
| Site edits not appearing | GitHub Pages CDN cache, ~10 minutes |

## Appendix B — Confirm with the instance owner

- Namespace in use, and the exact catalog-object interaction constant.
- Whether custom attributes are mapped inside `attributes: {}` or at the object root.
- The catalog import UI's expected column headers, and whether relationships import by ID or by name.
- Which recommendation ingredients are enabled on this dataset — some require Einstein features to be provisioned.
- Model run cadence, if attempting Phase 4.4.

## Appendix C — Out of scope

Server-side and edge personalisation; real payment processing; multi-environment tag management; identity resolution and login-based profile stitching; SFMC email/SMS channel integration (Journey Builder and similar). **Web channel only.**

---

*Drafted with AI assistance. Review with hands-on access to the MCP instance before execution — the sitemap and catalog code above is a starting point to validate against the instance's own SDK reference, not something to run unread.*
