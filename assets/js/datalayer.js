/* TrailGear Outfitters - page data layer.
 *
 * Builds window.TG before the Personalization beacon initialises, so the
 * sitemap never has to scrape the DOM (PLAN 1.2). Loaded in <head> on every
 * page with a data-page-type attribute:
 *
 *   <script src="assets/js/datalayer.js" data-page-type="product"></script>
 *
 * The beacon is injected from here, AFTER window.TG is complete, rather than
 * being a hand-pasted <script> tag on five pages. That makes the ordering
 * failure in PLAN Appendix A ("window.TG set after the beacon initialises")
 * structurally impossible, and leaves one place to configure Phase 3.
 */
(function () {
  "use strict";

  var CONFIG = (window.TG_CONFIG = {
    // PHASE 3: beacon URL, of the form
    //   "//cdn.evgnet.com/beacon/<account>/<dataset>/scripts/evergage.min.js"
    // Leave null until account + dataset are confirmed (PLAN Phase 0.1-0.2).
    // While null, the site runs normally with no tracking.
    beaconUrl: '//cdn.evgnet.com/beacon/revolvesoftechllc/revotrixnew/scripts/evergage.min.js',

    // null => derived from window.location. Derivation means the absolute URLs
    // written into window.TG can never drift from wherever the site is served,
    // and can never accidentally be relative (PLAN 2.1 eligibility rule).
    // Override only if the catalog must point somewhere other than the host
    // currently being browsed.
    baseUrl: null
  });

  var CATEGORIES = {
    footwear: "Footwear",
    apparel: "Apparel",
    gear: "Gear",
    accessories: "Accessories"
  };

  // ---------------------------------------------------------------- base URL

  function deriveBaseUrl() {
    if (CONFIG.baseUrl) return CONFIG.baseUrl.replace(/\/+$/, "");
    // Strip the filename: /repo/product.html -> /repo, /repo/ -> /repo
    var path = window.location.pathname.replace(/\/[^\/]*$/, "");
    return window.location.origin + path.replace(/\/+$/, "");
  }

  var BASE_URL = deriveBaseUrl();

  // The single derivation of url/imageUrl for the whole site. The catalog CSV
  // generator (data/build-catalog.html) repeats exactly this logic. If the two
  // ever disagree, recommendation zones render empty with no explanation.
  function productUrl(id) {
    return BASE_URL + "/product.html?id=" + encodeURIComponent(id);
  }
  function imageUrl(id) {
    return BASE_URL + "/assets/img/" + encodeURIComponent(id) + ".svg";
  }
  function categoryUrl(id) {
    return BASE_URL + "/catalog.html?category=" + encodeURIComponent(id);
  }

  // ----------------------------------------------------------- page identity

  var script = document.currentScript;
  var pageType = (script && script.getAttribute("data-page-type")) || "default";

  var TG = (window.TG = {
    pageType: pageType, // home | catalog | product | cart | order
    baseUrl: BASE_URL,
    categories: CATEGORIES,
    products: null, // populated from data/products.json
    product: null, // product pages only
    order: null, // order page only, and only when it should be tracked
    loadError: null, // human-readable reason the catalog failed to load
    productUrl: productUrl,
    imageUrl: imageUrl,
    categoryUrl: categoryUrl
  });

  // ------------------------------------------------------------------- order

  // PLAN 1.4 idempotency: the purchase interaction must not re-fire when the
  // confirmation page is refreshed. window.TG.order is the thing the sitemap
  // tracks, so withholding it is what suppresses the duplicate. The order is
  // left in sessionStorage regardless, so the page can still render a summary.
  function exposeOrder() {
    var raw;
    try {
      raw = window.sessionStorage.getItem("tg_order");
    } catch (e) {
      return null;
    }
    if (!raw) return null;

    var order;
    try {
      order = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    if (!order || !order.id) return null;

    var lastSent = null;
    try {
      lastSent = window.localStorage.getItem("tg_last_order_sent");
    } catch (e) {
      /* storage unavailable - fall through and expose */
    }
    if (lastSent === order.id) return null; // already tracked; this is a refresh

    // Marked as sent immediately. The sitemap resolvers read the in-memory
    // window.TG.order, so the flag only ever needs to guard future page loads.
    try {
      window.localStorage.setItem("tg_last_order_sent", order.id);
    } catch (e) {
      /* non-fatal */
    }
    return order;
  }

  if (pageType === "order") {
    TG.order = exposeOrder();
  }

  // ----------------------------------------------------------------- catalog

  function enrich(p) {
    return {
      id: p.id,
      name: p.name,
      url: productUrl(p.id),
      imageUrl: imageUrl(p.id),
      description: p.description,
      price: p.price,
      categoryId: p.categoryId,
      categoryName: CATEGORIES[p.categoryId] || p.categoryId,
      brand: p.brand,
      inventoryCount: p.inventoryCount
    };
  }

  function currentProductId() {
    return new URLSearchParams(window.location.search).get("id");
  }

  function injectBeacon() {
    if (!CONFIG.beaconUrl) return;
    var s = document.createElement("script");
    s.src = CONFIG.beaconUrl;
    s.async = false;
    document.head.appendChild(s);
  }

  // TG_READY resolves once window.TG is final. app.js waits on it before
  // rendering; nothing else should need it.
  window.TG_READY = fetch("data/products.json", { cache: "no-cache" })
    .then(function (res) {
      if (!res.ok) throw new Error("products.json " + res.status);
      return res.json();
    })
    .then(function (list) {
      TG.products = list.map(enrich);
      if (pageType === "product") {
        var id = currentProductId();
        TG.product =
          TG.products.filter(function (p) {
            return p.id === id;
          })[0] || null;
      }
    })
    .catch(function (err) {
      // By far the most common cause is the page being opened straight from
      // disk, where the browser blocks fetch() outright. Recorded on window.TG
      // so app.js can say so on the page: an empty grid is indistinguishable
      // from an empty catalog, which is the worst symptom this could have.
      TG.loadError =
        window.location.protocol === "file:"
          ? "This page was opened directly from disk (a file:// URL). Browsers " +
            "block fetch() on file:// origins, so data/products.json cannot be " +
            "read. Serve the repo over http:// instead - see README.md."
          : "Could not load data/products.json (" + err.message + ").";
      console.error("[TG] catalog load failed:", TG.loadError, err);
      TG.products = [];
    })
    .then(function () {
      injectBeacon();
      return TG;
    });
})();
