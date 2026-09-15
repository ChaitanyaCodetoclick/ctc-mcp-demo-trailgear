/* TrailGear Outfitters - rendering, cart, order handoff (PLAN 1.3 / 1.4).
 *
 * Deliberately fires NO Personalization events. All tracking is declarative and
 * lives in the sitemap (PLAN 3.2); this file only maintains window.TG's inputs
 * and paints the page.
 */
(function () {
  "use strict";

  var CART_KEY = "tg_cart"; // localStorage: [{ id, quantity }]
  var ORDER_KEY = "tg_order"; // sessionStorage: the order object
  var CURRENCY = "£"; // display only; never reaches the catalog

  // ------------------------------------------------------------------- utils

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function money(n) {
    return CURRENCY + Number(n).toFixed(2);
  }
  function round2(n) {
    return Math.round(n * 100) / 100;
  }
  function param(name) {
    return new URLSearchParams(window.location.search).get(name);
  }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // -------------------------------------------------------------------- cart

  function getCart() {
    try {
      var raw = window.localStorage.getItem(CART_KEY);
      var cart = raw ? JSON.parse(raw) : [];
      return Array.isArray(cart) ? cart : [];
    } catch (e) {
      return [];
    }
  }

  function setCart(cart) {
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {
      console.error("[TG] could not persist cart:", e);
    }
    paintCartCount();
  }

  function addToCart(id, quantity) {
    var cart = getCart();
    var line = cart.filter(function (l) {
      return l.id === id;
    })[0];
    if (line) line.quantity += quantity || 1;
    else cart.push({ id: id, quantity: quantity || 1 });
    setCart(cart);
  }

  function setQuantity(id, quantity) {
    var cart = getCart().filter(function (l) {
      return l.id !== id || quantity > 0;
    });
    cart.forEach(function (l) {
      if (l.id === id) l.quantity = quantity;
    });
    setCart(cart);
  }

  function cartCount() {
    return getCart().reduce(function (sum, l) {
      return sum + l.quantity;
    }, 0);
  }

  // Joins the stored cart against the catalog. Price is looked up rather than
  // stored, so a cart saved before a price change can never carry a stale one
  // into the order's line items.
  function cartLines() {
    var products = window.TG.products || [];
    return getCart()
      .map(function (line) {
        var product = products.filter(function (p) {
          return p.id === line.id;
        })[0];
        return product ? { product: product, quantity: line.quantity } : null;
      })
      .filter(Boolean);
  }

  function cartTotal(lines) {
    return round2(
      lines.reduce(function (sum, l) {
        return sum + l.product.price * l.quantity;
      }, 0)
    );
  }

  function paintCartCount() {
    var badge = $("#cart-count");
    if (badge) badge.textContent = String(cartCount());
  }

  // ------------------------------------------------------------ product card

  function productCard(product) {
    var card = el("a", "card");
    card.href = "product.html?id=" + encodeURIComponent(product.id);

    var img = el("img", "card-img");
    img.src = "assets/img/" + product.id + ".svg";
    img.alt = product.name;
    img.loading = "lazy";
    card.appendChild(img);

    var body = el("div", "card-body");
    body.appendChild(el("p", "card-cat", product.categoryName));
    body.appendChild(el("h3", "card-name", product.name));
    body.appendChild(el("p", "card-brand", product.brand));
    body.appendChild(el("p", "card-price", money(product.price)));
    if (product.inventoryCount === 0) {
      body.appendChild(el("p", "badge-oos", "Out of stock"));
    }
    card.appendChild(body);
    return card;
  }

  function renderGrid(container, products) {
    container.textContent = "";
    if (!products.length) {
      container.appendChild(el("p", "empty", "No products found."));
      return;
    }
    products.forEach(function (p) {
      container.appendChild(productCard(p));
    });
  }

  // ------------------------------------------------------------------- pages

  function renderHome() {
    var grid = $("#featured-grid");
    if (grid) renderGrid(grid, (window.TG.products || []).slice(0, 4));
  }

  function renderCatalog() {
    var grid = $("#product-grid");
    if (!grid) return;

    var selected = param("category");
    var products = window.TG.products || [];
    var filtered = selected
      ? products.filter(function (p) {
          return p.categoryId === selected;
        })
      : products;

    var heading = $("#catalog-heading");
    if (heading) {
      heading.textContent = selected
        ? window.TG.categories[selected] || selected
        : "All products";
    }

    Array.prototype.forEach.call(document.querySelectorAll(".cat-filter"), function (link) {
      var isActive = (link.dataset.category || "") === (selected || "");
      link.classList.toggle("active", isActive);
    });

    renderGrid(grid, filtered);
  }

  function renderProduct() {
    var detail = $("#product-detail");
    var button = $("#add-to-cart-btn");
    var product = window.TG.product;

    if (!detail) return;
    detail.textContent = "";

    if (!product) {
      detail.appendChild(
        el("p", "empty", "That product does not exist. Try the catalog.")
      );
      if (button) button.hidden = true;
      return;
    }

    document.title = product.name + " | TrailGear Outfitters";

    var img = el("img", "detail-img");
    img.src = "assets/img/" + product.id + ".svg";
    img.alt = product.name;
    detail.appendChild(img);

    var info = el("div", "detail-info");
    info.appendChild(el("p", "card-cat", product.categoryName));
    info.appendChild(el("h1", "detail-name", product.name));
    info.appendChild(el("p", "card-brand", product.brand));
    info.appendChild(el("p", "detail-price", money(product.price)));
    info.appendChild(el("p", "detail-desc", product.description));
    info.appendChild(
      el(
        "p",
        "detail-stock",
        product.inventoryCount === 0
          ? "Out of stock"
          : product.inventoryCount + " in stock"
      )
    );
    info.appendChild(el("p", "detail-sku", "SKU " + product.id));
    detail.appendChild(info);

    if (button) {
      button.hidden = false;
      button.disabled = product.inventoryCount === 0;
      button.textContent =
        product.inventoryCount === 0 ? "Out of stock" : "Add to cart";
    }
  }

  function renderCart() {
    var container = $("#cart-items");
    var summary = $("#cart-summary");
    var checkout = $("#checkout-btn");
    if (!container) return;

    var lines = cartLines();
    container.textContent = "";

    if (!lines.length) {
      container.appendChild(el("p", "empty", "Your cart is empty."));
      if (summary) summary.textContent = "";
      if (checkout) checkout.disabled = true;
      return;
    }

    lines.forEach(function (line) {
      var row = el("div", "cart-row");

      var img = el("img", "cart-img");
      img.src = "assets/img/" + line.product.id + ".svg";
      img.alt = line.product.name;
      row.appendChild(img);

      var info = el("div", "cart-info");
      var link = el("a", "cart-name", line.product.name);
      link.href = "product.html?id=" + encodeURIComponent(line.product.id);
      info.appendChild(link);
      info.appendChild(el("p", "cart-sku", line.product.id));
      info.appendChild(el("p", "cart-price", money(line.product.price)));
      row.appendChild(info);

      var controls = el("div", "cart-controls");
      var qty = el("input", "cart-qty");
      qty.type = "number";
      qty.min = "1";
      qty.value = String(line.quantity);
      qty.setAttribute("aria-label", "Quantity for " + line.product.name);
      qty.addEventListener("change", function () {
        setQuantity(line.product.id, Math.max(1, parseInt(qty.value, 10) || 1));
        renderCart();
      });
      controls.appendChild(qty);

      var remove = el("button", "link-btn", "Remove");
      remove.type = "button";
      remove.addEventListener("click", function () {
        setQuantity(line.product.id, 0);
        renderCart();
      });
      controls.appendChild(remove);
      row.appendChild(controls);

      container.appendChild(row);
    });

    if (summary) {
      summary.textContent = "";
      summary.appendChild(el("span", "total-label", "Total"));
      summary.appendChild(el("span", "total-value", money(cartTotal(lines))));
    }
    if (checkout) checkout.disabled = false;
  }

  // PLAN 1.4: build the order, hand it over via sessionStorage, clear the cart,
  // redirect. No Personalization event fires here - the purchase interaction is
  // the confirmation page's job, so a failed redirect can never bank a sale.
  function checkout() {
    var lines = cartLines();
    if (!lines.length) return;

    var order = {
      id: "TG-ORDER-" + Date.now(),
      total: cartTotal(lines),
      lineItems: lines.map(function (l) {
        return {
          id: l.product.id,
          price: l.product.price,
          quantity: l.quantity
        };
      })
    };

    try {
      window.sessionStorage.setItem(ORDER_KEY, JSON.stringify(order));
      window.localStorage.removeItem(CART_KEY);
    } catch (e) {
      console.error("[TG] could not hand off order:", e);
      return;
    }
    window.location.href = "thankyou.html";
  }

  function renderThankYou() {
    var container = $("#order-summary");
    if (!container) return;
    container.textContent = "";

    // Read sessionStorage directly rather than window.TG.order: the data layer
    // withholds TG.order on a refresh to suppress a duplicate purchase event,
    // but the customer should still see their confirmation.
    var order = null;
    try {
      var raw = window.sessionStorage.getItem(ORDER_KEY);
      if (raw) order = JSON.parse(raw);
    } catch (e) {
      /* fall through to the empty state */
    }

    if (!order) {
      container.appendChild(el("p", "empty", "No recent order to show."));
      return;
    }

    container.appendChild(el("p", "order-id", "Order " + order.id));

    var products = window.TG.products || [];
    order.lineItems.forEach(function (li) {
      var product = products.filter(function (p) {
        return p.id === li.id;
      })[0];
      var row = el("div", "order-row");
      row.appendChild(
        el("span", "order-name", (product ? product.name : li.id) + " x" + li.quantity)
      );
      row.appendChild(el("span", "order-line-total", money(li.price * li.quantity)));
      container.appendChild(row);
    });

    var total = el("div", "order-row order-total");
    total.appendChild(el("span", "total-label", "Order total"));
    total.appendChild(el("span", "total-value", money(order.total)));
    container.appendChild(total);

    if (!window.TG.order) {
      console.info("[TG] order already tracked - purchase interaction suppressed.");
    }
  }

  // -------------------------------------------------------------------- boot

  paintCartCount();

  window.TG_READY.then(function () {
    var renderers = {
      home: renderHome,
      catalog: renderCatalog,
      product: renderProduct,
      cart: renderCart,
      order: renderThankYou
    };
    var render = renderers[window.TG.pageType];
    if (render) render();

    // Wired after render so the button exists and the product has resolved. The
    // Add To Cart *event* is the sitemap's listener on this same element
    // (PLAN 3.2); this handler only mutates localStorage.
    var addBtn = document.querySelector("#add-to-cart-btn");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        if (!window.TG.product || window.TG.product.inventoryCount === 0) return;
        addToCart(window.TG.product.id, 1);
        addBtn.textContent = "Added";
        window.setTimeout(function () {
          addBtn.textContent = "Add to cart";
        }, 1200);
      });
    }

    var checkoutBtn = document.querySelector("#checkout-btn");
    if (checkoutBtn) checkoutBtn.addEventListener("click", checkout);

    paintCartCount();
  });
})();
