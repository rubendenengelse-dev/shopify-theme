(function () {
  const body = document.body;
  if (!body) return;

  const wishlistBaseUrl = body.dataset.wishlistEndpoint || "/apps/wishlist/proxy";
  const loginUrl = body.dataset.accountLoginUrl || "/account/login";
  const wishlistUrl = body.dataset.accountWishlistUrl || "/account#wishlist";
  const accountContainer = document.querySelector("[data-account-wishlist]");
  const mobileColumnsStorageKey = "wog-mobile-wishlist-columns";

  let wishlistIds = new Set();
  let isAuthenticated = body.dataset.customerLoggedIn === "true";
  function getButtons() {
    return Array.from(document.querySelectorAll("[data-wishlist-button]"));
  }

  function setButtonState(button, active) {
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  function syncButtons() {
    getButtons().forEach((button) => {
      const productId = Number(button.dataset.productId);
      setButtonState(button, wishlistIds.has(productId));
    });
  }

  function renderAccountWishlistState(message, count) {
    if (!accountContainer) return;

    const meta = count > 0 ? `<span class="account-wishlist__meta">${count} opgeslagen producten</span>` : "";
    accountContainer.innerHTML = `
      <div class="account-wishlist__card">
        <h2 class="account-wishlist__title">Wishlist</h2>
        <p class="account-wishlist__text">${message}</p>
        ${meta}
      </div>
    `;
  }

  function formatPrice(price) {
    if (!price?.amount || !price?.currencyCode) return "";

    try {
      const rawAmount = String(price.amount).trim();
      let numericAmount = Number(rawAmount);

      if (Number.isFinite(numericAmount) && numericAmount >= 1000) {
        const looksLikeCents =
          /^[0-9]+$/.test(rawAmount) ||
          /^[0-9]+\.0+$/.test(rawAmount) ||
          /^[0-9]+,0+$/.test(rawAmount);

        if (looksLikeCents) {
          numericAmount = numericAmount / 100;
        }
      }

      return new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: price.currencyCode,
      }).format(numericAmount);
    } catch {
      return `${price.amount} ${price.currencyCode}`;
    }
  }

  function renderAccountWishlistProducts(products = []) {
    if (!accountContainer) return;

    if (!products.length) {
      renderAccountWishlistState("Je hebt nog geen producten aan je wishlist toegevoegd.", 0);
      return;
    }

    const items = products
      .map((product) => {
        const image = product.image
          ? `
            <div class="account-wishlist__item-media">
              <button
                type="button"
                class="wishlist-button wishlist-button--card account-wishlist__remove is-active"
                data-wishlist-button
                data-product-id="${product.id}"
                data-product-handle="${product.handle || ""}"
                aria-label="Verwijder uit wishlist"
                aria-pressed="true"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 20.2 4.85 13.2a4.77 4.77 0 0 1 0-6.82 4.94 4.94 0 0 1 6.92 0L12 6.61l.23-.23a4.94 4.94 0 0 1 6.92 0 4.77 4.77 0 0 1 0 6.82Z"></path>
                </svg>
              </button>
              <img src="${product.image.url}" alt="${product.image.alt || product.title}" loading="lazy">
            </div>
          `
          : "";

        const price = product.price ? `<p class="account-wishlist__item-price">${formatPrice(product.price)}</p>` : "";
        const sizeSelector = `
          <div class="account-wishlist__purchase-row">
            <details class="account-wishlist__size-picker">
              <summary class="account-wishlist__size-summary">
                <span class="account-wishlist__size-summary-label">Maat selecteren</span>
                <svg viewBox="0 0 12 12" focusable="false" aria-hidden="true">
                  <path d="M2.75 4.25 6 7.5l3.25-3.25" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </summary>
              <div class="account-wishlist__size-options" role="list">
                <button type="button" class="account-wishlist__size-option" data-size-value="XS">XS</button>
                <button type="button" class="account-wishlist__size-option" data-size-value="S">S</button>
                <button type="button" class="account-wishlist__size-option" data-size-value="M">M</button>
                <button type="button" class="account-wishlist__size-option" data-size-value="L">L</button>
                <button type="button" class="account-wishlist__size-option" data-size-value="XL">XL</button>
                <button type="button" class="account-wishlist__size-option" data-size-value="XXL">XXL</button>
              </div>
            </details>
            <button type="button" class="account-wishlist__cart-trigger" aria-label="Toevoegen aan winkelwagen">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <g transform="translate(-6.1 -6.1) scale(1.58)">
                  <path d="M12 18.2V8.6" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/>
                  <path d="M7.2 10.2h9.6v6.4a1.5 1.5 0 0 1-1.5 1.5h-6.6a1.5 1.5 0 0 1-1.5-1.5z" stroke="currentColor" stroke-width="0.8" stroke-linejoin="round"/>
                  <path d="M6.7 8.1h10.6a.9.9 0 0 1 .9.9v1.2H5.8V9a.9.9 0 0 1 .9-.9z" stroke="currentColor" stroke-width="0.8" stroke-linejoin="round"/>
                  <path d="M12 8.1h-2.1c-.95 0-1.6-.56-1.6-1.33 0-.77.63-1.32 1.46-1.32.92 0 1.63.57 2.24 1.64.61-1.07 1.32-1.64 2.24-1.64.83 0 1.46.55 1.46 1.32 0 .77-.65 1.33-1.6 1.33H12z" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>
                </g>
              </svg>
            </button>
          </div>
        `;

        return `
          <article class="account-wishlist__item">
            <a class="account-wishlist__item-link" href="${product.url}">
              ${image}
              <p class="account-wishlist__item-title">${product.title}</p>
              ${price}
            </a>
            ${sizeSelector}
          </article>
        `;
      })
      .join("");

    accountContainer.innerHTML = `
      <div class="account-wishlist__layout" id="wishlist">
        <div class="account-wishlist__main">
          <div class="account-wishlist__intro">
            <h2 class="account-wishlist__heading">Jouw verlanglijstje</h2>
            <p class="account-wishlist__count">${products.length} producten</p>
          </div>
          <div class="account-wishlist__mobile-toolbar" aria-label="Productweergave">
            <div class="account-wishlist__mobile-toggle" role="group" aria-label="Aantal kolommen">
              <button
                class="account-wishlist__mobile-toggle-button is-active"
                type="button"
                data-wishlist-mobile-columns="2"
                aria-label="Toon producten in 2 kolommen"
                aria-pressed="true"
              >
                <span class="account-wishlist__mobile-toggle-icon" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
              </button>
              <button
                class="account-wishlist__mobile-toggle-button"
                type="button"
                data-wishlist-mobile-columns="1"
                aria-label="Toon producten in 1 kolom"
                aria-pressed="false"
              >
                <span class="account-wishlist__mobile-toggle-icon" aria-hidden="true"><span></span></span>
              </button>
            </div>
          </div>
          <div class="account-wishlist__grid">
            ${items}
          </div>
          <div class="account-wishlist__actions">
            <a href="#wishlist" class="account-wishlist__clear" data-wishlist-clear>
              <span class="account-wishlist__clear-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
                  <path d="M7.5 3.75h5m-6.5 2h8m-6.75 0v7.25m2.75-7.25v7.25m2.75-7.25v7.25M6.5 5.75l.35 8.1a1.2 1.2 0 0 0 1.2 1.15h3.9a1.2 1.2 0 0 0 1.2-1.15l.35-8.1" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <span>Verwijder alles</span>
            </a>
          </div>
        </div>
      </div>
    `;

    syncMobileColumns();
  }

  function syncMobileColumns() {
    const layout = accountContainer?.querySelector(".account-wishlist__layout");
    if (!layout) return;

    const buttons = Array.from(layout.querySelectorAll("[data-wishlist-mobile-columns]"));
    if (!buttons.length) return;

    const setColumns = (columns) => {
      const nextColumns = columns === "1" ? "1" : "2";
      layout.dataset.mobileColumns = nextColumns;
      buttons.forEach((button) => {
        const isActive = button.dataset.wishlistMobileColumns === nextColumns;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });

      try {
        window.localStorage.setItem(mobileColumnsStorageKey, nextColumns);
      } catch (error) {}
    };

    let storedColumns = "2";
    try {
      storedColumns = window.localStorage.getItem(mobileColumnsStorageKey) || "2";
    } catch (error) {}

    setColumns(storedColumns);

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        setColumns(button.dataset.wishlistMobileColumns);
      });
    });
  }

  async function fetchWishlist() {
    try {
      const response = await fetch(wishlistBaseUrl, {
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });

      if (response.status === 401) {
        isAuthenticated = false;
        renderAccountWishlistState("Log in om je wishlist op al je apparaten te bewaren.");
        syncButtons();
        return;
      }

      if (!response.ok) throw new Error("Wishlist request failed");

      const payload = await response.json();
      if (payload?.authenticated === false) {
        isAuthenticated = false;
        wishlistIds = new Set();
        syncButtons();
        renderAccountWishlistState("Log in om je wishlist op al je apparaten te bewaren.");
        return;
      }

      isAuthenticated = true;
      const productIds = payload?.wishlist?.productIds || [];
      wishlistIds = new Set(productIds.map((id) => Number(id)).filter(Boolean));
      syncButtons();
      renderAccountWishlistProducts(payload?.wishlist?.products || []);
    } catch (error) {
      console.warn("[wishlist]", error);
      renderAccountWishlistState("Je wishlist-koppeling is bijna klaar. De opgeslagen producten verschijnen hier zodra de app-verbinding actief is.");
    }
  }

  async function toggleWishlist(button) {
    const productId = Number(button.dataset.productId);
    if (!productId) return;

    button.disabled = true;

    try {
      const response = await fetch(`${wishlistBaseUrl}/toggle`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ productId }),
      });

      if (response.status === 401) {
        isAuthenticated = false;
        window.location.href = loginUrl;
        return;
      }

      if (!response.ok) throw new Error("Wishlist toggle failed");

      const payload = await response.json();
      if (payload?.authenticated === false) {
        isAuthenticated = false;
        window.location.href = loginUrl;
        return;
      }

      isAuthenticated = true;
      const productIds = payload?.wishlist?.productIds || [];
      wishlistIds = new Set(productIds.map((id) => Number(id)).filter(Boolean));
      syncButtons();
      renderAccountWishlistProducts(payload?.wishlist?.products || []);
    } catch (error) {
      console.warn("[wishlist]", error);
      if (!isAuthenticated && accountContainer) {
        renderAccountWishlistState("Log in om je wishlist op al je apparaten te bewaren.");
      }
    } finally {
      button.disabled = false;
    }
  }

  async function clearWishlistItems(button) {
    button.disabled = true;

    try {
      const response = await fetch(`${wishlistBaseUrl}/clear`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error("Wishlist clear failed");

      const payload = await response.json();
      if (payload?.authenticated === false) {
        isAuthenticated = false;
        window.location.href = loginUrl;
        return;
      }

      isAuthenticated = true;
      wishlistIds = new Set();
      syncButtons();
      renderAccountWishlistProducts(payload?.wishlist?.products || []);
    } catch (error) {
      console.warn("[wishlist]", error);
    } finally {
      button.disabled = false;
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest("[data-wishlist-button]");
      if (button) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleWishlist(button);
        return;
      }

      const clearButton = event.target.closest("[data-wishlist-clear]");
      if (clearButton) {
        event.preventDefault();
        clearWishlistItems(clearButton);
        return;
      }

      const sizeOption = event.target.closest(".account-wishlist__size-option");
      if (sizeOption) {
        event.preventDefault();
        event.stopPropagation();
        const picker = sizeOption.closest(".account-wishlist__size-picker");
        const label = picker?.querySelector(".account-wishlist__size-summary-label");
        const value = sizeOption.dataset.sizeValue || sizeOption.textContent?.trim();
        if (label && value) label.textContent = value;
        picker?.querySelectorAll(".account-wishlist__size-option").forEach((button) => {
          const isSelected = button === sizeOption;
          button.classList.toggle("is-selected", isSelected);
          button.setAttribute("aria-pressed", String(isSelected));
        });
        if (picker) picker.open = false;
        return;
      }

    },
    true
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      const button = event.target.closest("[data-wishlist-button]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      const button = event.target.closest("[data-wishlist-button]");
      if (!button) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      toggleWishlist(button);
    },
    true
  );

  fetchWishlist();
})();
