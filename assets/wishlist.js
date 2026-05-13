(function () {
  const body = document.body;
  if (!body) return;

  const wishlistBaseUrl = body.dataset.wishlistEndpoint || "/apps/wishlist/proxy";
  const loginUrl = body.dataset.accountLoginUrl || "/account/login";
  const wishlistUrl = body.dataset.accountWishlistUrl || "/account#wishlist";
  const accountContainer = document.querySelector("[data-account-wishlist]");
  const mobileColumnsStorageKey = "wog-mobile-wishlist-columns";
  const wishlistVariantStorageKeyPrefix = "wog-wishlist-variants:";
  const wishlistFeedbackResetDelay = 2200;
  const wishlistMinimumSpinnerDuration = 800;
  const wishlistSuccessStateDuration = 600;
  const wishlistBounceDuration = 280;
  const wishlistToastDuration = 2200;

  let wishlistIds = new Set();
  let isAuthenticated = body.dataset.customerLoggedIn === "true";
  const wishlistVariantCache = new Map();
  let wishlistToastTimeout = null;
  function getButtons() {
    return Array.from(document.querySelectorAll("[data-wishlist-button]"));
  }

  function setButtonState(button, active) {
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  function playWishlistBounce(button) {
    if (!button?.closest(".product-wishlist-mobile-slot")) return;
    button.classList.remove("is-bouncing");
    window.setTimeout(() => {
      button.classList.add("is-bouncing");
      window.setTimeout(() => {
        button.classList.remove("is-bouncing");
      }, wishlistBounceDuration);
    }, 10);
  }

  function showWishlistToast() {
    if (!window.matchMedia("(min-width: 750px)").matches) return;

    const headerWishlistButton = document.querySelector(".header__icon--wishlist");
    if (!headerWishlistButton) return;

    let toast = document.querySelector("[data-wishlist-toast]");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "wishlist-toast";
      toast.dataset.wishlistToast = "true";
      toast.textContent = "Artikel toegevoegd aan verlanglijst";
      document.body.appendChild(toast);
    }

    const buttonRect = headerWishlistButton.getBoundingClientRect();
    toast.style.top = `${buttonRect.bottom + 10}px`;
    toast.style.left = `${Math.max(16, buttonRect.right - toast.offsetWidth)}px`;

    toast.classList.remove("is-visible");
    window.clearTimeout(wishlistToastTimeout);

    window.requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });

    wishlistToastTimeout = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, wishlistToastDuration);
  }

  function escapeAttribute(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function normalizeSizeValue(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function parseWishlistVariants(item) {
    if (!item) return [];
    try {
      const variants = JSON.parse(item.dataset.productVariants || "[]");
      return Array.isArray(variants) ? variants : [];
    } catch {
      return [];
    }
  }

  function readWishlistVariantStorage(handle) {
    if (!handle) return [];
    try {
      const storedValue = window.localStorage.getItem(`${wishlistVariantStorageKeyPrefix}${handle}`);
      if (!storedValue) return [];
      const parsed = JSON.parse(storedValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeWishlistVariantStorage(handle, variants) {
    if (!handle || !Array.isArray(variants) || !variants.length) return;
    try {
      window.localStorage.setItem(`${wishlistVariantStorageKeyPrefix}${handle}`, JSON.stringify(variants));
    } catch {}
  }

  function setWishlistVariants(item, variants) {
    if (!item || !Array.isArray(variants)) return [];
    const normalizedVariants = variants.filter((variant) => variant?.id && variant?.size);
    item.dataset.productVariants = JSON.stringify(normalizedVariants);

    const handle = item.dataset.productHandle || "";
    if (handle) {
      wishlistVariantCache.set(handle, normalizedVariants);
      writeWishlistVariantStorage(handle, normalizedVariants);
    }

    return normalizedVariants;
  }

  function getVariantSizeLabel(variant) {
    const selectedOptions = Array.isArray(variant?.selectedOptions) ? variant.selectedOptions : [];
    const namedOption = selectedOptions.find((option) => /size|maat/i.test(option?.name || ""));
    if (namedOption?.value) return namedOption.value;

    const optionValues = [variant?.option1, variant?.option2, variant?.option3]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const matchingOption = optionValues.find((value) => /^(xxs|xs|s|m|l|xl|xxl|xxxl|3xl|4xl|5xl)$/i.test(value));
    if (matchingOption) return matchingOption;

    const title = String(variant?.title || "").trim();
    if (title && title.toLowerCase() !== "default title") return title;

    return "";
  }

  function normalizeFetchedWishlistVariants(product) {
    return (product?.variants || [])
      .map((variant) => ({
        id: Number(variant.id),
        title: variant.title,
        available: Boolean(variant.available),
        size: getVariantSizeLabel(variant),
      }))
      .filter((variant) => variant.id && variant.size);
  }

  async function ensureWishlistVariants(item) {
    if (!item) return [];

    const existingVariants = parseWishlistVariants(item);
    if (existingVariants.length) return existingVariants;

    const handle = item.dataset.productHandle || "";
    if (!handle) return [];

    if (wishlistVariantCache.has(handle)) {
      return setWishlistVariants(item, wishlistVariantCache.get(handle));
    }

    const storedVariants = readWishlistVariantStorage(handle);
    if (storedVariants.length) {
      wishlistVariantCache.set(handle, storedVariants);
      return setWishlistVariants(item, storedVariants);
    }

    if (item._variantRequest) {
      return item._variantRequest;
    }

    item._variantRequest = fetch(`/products/${handle}.js`, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Productgegevens konden niet worden geladen.");
        }
        return response.json();
      })
      .then((product) => {
        const fetchedVariants = normalizeFetchedWishlistVariants(product);
        return setWishlistVariants(item, fetchedVariants);
      })
      .catch((error) => {
        console.warn("[wishlist variants]", error);
        return [];
      })
      .finally(() => {
        item._variantRequest = null;
      });

    return item._variantRequest;
  }

  function getSelectedWishlistVariant(item, requestedSize) {
    const normalizedRequestedSize = normalizeSizeValue(requestedSize || item?.dataset.selectedSize);
    if (!normalizedRequestedSize) return null;

    return (
      parseWishlistVariants(item).find((variant) => normalizeSizeValue(variant.size) === normalizedRequestedSize) || null
    );
  }

  function getWishlistFeedbackElement(item) {
    return item?.querySelector("[data-wishlist-feedback]") || null;
  }

  function clearWishlistFeedback(item) {
    const feedback = getWishlistFeedbackElement(item);
    if (!feedback) return;
    feedback.textContent = "";
    feedback.hidden = true;
    feedback.classList.remove("is-error", "is-success");
  }

  function showWishlistFeedback(item, message, type = "error") {
    const feedback = getWishlistFeedbackElement(item);
    if (!feedback) return;

    if (feedback._hideTimeout) {
      window.clearTimeout(feedback._hideTimeout);
      feedback._hideTimeout = null;
    }

    feedback.textContent = message;
    feedback.hidden = !message;
    feedback.classList.toggle("is-error", type === "error");
    feedback.classList.toggle("is-success", type === "success");

    if (message && type !== "success") {
      feedback._hideTimeout = window.setTimeout(() => {
        clearWishlistFeedback(item);
      }, wishlistFeedbackResetDelay);
    }
  }

  function setWishlistCartButtonState(button, state = "idle") {
    if (!button) return;

    if (button._stateTimeout) {
      window.clearTimeout(button._stateTimeout);
      button._stateTimeout = null;
    }

    button.dataset.state = state;
    button.classList.toggle("is-loading", state === "loading");
    button.classList.toggle("is-success", state === "success");
    button.classList.toggle("is-error", state === "error");

    if (state === "loading" || state === "success") {
      button.disabled = true;
      if (state === "loading") {
        button.setAttribute("aria-busy", "true");
      } else {
        button.removeAttribute("aria-busy");
      }
      return;
    }

    button.disabled = false;
    button.removeAttribute("aria-busy");

    if (state === "error") {
      button._stateTimeout = window.setTimeout(() => {
        setWishlistCartButtonState(button, "idle");
      }, 900);
    }
  }

  async function addWishlistVariantToCart(button) {
    const item = button.closest("[data-wishlist-item]");
    if (!item || button.disabled) return;

    const selectedSize = item.dataset.selectedSize || "";
    if (!selectedSize) {
      setWishlistCartButtonState(button, "error");
      showWishlistFeedback(item, "Selecteer eerst een maat.", "error");
      return;
    }

    const variants = (await ensureWishlistVariants(item)) || [];
    if (!variants.length) {
      setWishlistCartButtonState(button, "error");
      showWishlistFeedback(item, "Productgegevens konden niet worden geladen.", "error");
      return;
    }

    const selectedVariant = getSelectedWishlistVariant(item, selectedSize);
    if (!selectedVariant) {
      setWishlistCartButtonState(button, "error");
      showWishlistFeedback(item, "Deze maat is niet beschikbaar.", "error");
      return;
    }

    if (!selectedVariant.available) {
      setWishlistCartButtonState(button, "error");
      showWishlistFeedback(item, "Deze maat is uitverkocht.", "error");
      return;
    }

    clearWishlistFeedback(item);
    setWishlistCartButtonState(button, "loading");

    try {
      const addToCartPromise = fetch(`${routes.cart_add_url}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          items: [
            {
              id: selectedVariant.id,
              quantity: 1,
            },
          ],
        }),
      }).then((response) => response.json());
      const minimumSpinnerDelay = new Promise((resolve) => {
        window.setTimeout(resolve, wishlistMinimumSpinnerDuration);
      });

      const [payload] = await Promise.all([addToCartPromise, minimumSpinnerDelay]);

      if (payload?.status) {
        if (typeof publish === "function" && typeof PUB_SUB_EVENTS !== "undefined") {
          publish(PUB_SUB_EVENTS.cartError, {
            source: "wishlist",
            productVariantId: selectedVariant.id,
            errors: payload.errors || payload.description,
            message: payload.message,
          });
        }

        throw new Error(payload.description || payload.message || "Toevoegen aan winkelwagen mislukt.");
      }

      if (typeof publish === "function" && typeof PUB_SUB_EVENTS !== "undefined") {
        publish(PUB_SUB_EVENTS.cartUpdate, {
          source: "wishlist",
          productVariantId: selectedVariant.id,
          cartData: payload,
        });
      }

      setWishlistCartButtonState(button, "success");
      clearWishlistFeedback(item);

      await new Promise((resolve) => {
        window.setTimeout(resolve, wishlistSuccessStateDuration);
      });

      await new Promise((resolve) => {
        document.dispatchEvent(
          new CustomEvent("wog:wishlist-cart-added", {
            detail: {
              trigger: button,
              cartData: payload,
              productVariantId: selectedVariant.id,
              onComplete: resolve,
            },
          })
        );
      });
      clearWishlistFeedback(item);
      setWishlistCartButtonState(button, "idle");
    } catch (error) {
      console.warn("[wishlist cart]", error);
      setWishlistCartButtonState(button, "error");
      showWishlistFeedback(item, error.message || "Toevoegen aan winkelwagen mislukt.", "error");
    }
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
        const variants = escapeAttribute(JSON.stringify(product.variants || []));
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
            <button type="button" class="account-wishlist__cart-trigger" data-wishlist-cart-trigger data-state="idle" aria-label="Toevoegen aan winkelwagen">
              <span class="account-wishlist__cart-center" aria-hidden="true">
                <span class="account-wishlist__cart-icon account-wishlist__cart-icon--cart" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <g transform="translate(-6.1 -6.1) scale(1.58)">
                      <path d="M12 18.2V8.6" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/>
                      <path d="M7.2 10.2h9.6v6.4a1.5 1.5 0 0 1-1.5 1.5h-6.6a1.5 1.5 0 0 1-1.5-1.5z" stroke="currentColor" stroke-width="0.8" stroke-linejoin="round"/>
                      <path d="M6.7 8.1h10.6a.9.9 0 0 1 .9.9v1.2H5.8V9a.9.9 0 0 1 .9-.9z" stroke="currentColor" stroke-width="0.8" stroke-linejoin="round"/>
                      <path d="M12 8.1h-2.1c-.95 0-1.6-.56-1.6-1.33 0-.77.63-1.32 1.46-1.32.92 0 1.63.57 2.24 1.64.61-1.07 1.32-1.64 2.24-1.64.83 0 1.46.55 1.46 1.32 0 .77-.65 1.33-1.6 1.33H12z" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </g>
                  </svg>
                </span>
                <span class="account-wishlist__cart-icon account-wishlist__cart-icon--spinner" aria-hidden="true">
                  <span class="account-wishlist__cart-spinner"></span>
                </span>
                <span class="account-wishlist__cart-icon account-wishlist__cart-icon--check" aria-hidden="true">
                  <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
                    <path d="M4.8 10.2 8.1 13.5 15.3 6.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </span>
            </button>
          </div>
          <p class="account-wishlist__feedback" data-wishlist-feedback hidden aria-live="polite"></p>
        `;

        return `
          <article class="account-wishlist__item" data-wishlist-item data-product-id="${product.id}" data-product-handle="${product.handle || ""}" data-product-variants="${variants}">
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
      const isNowActive = wishlistIds.has(productId);
      syncButtons();
      if (isNowActive) {
        playWishlistBounce(button);
      }
      renderAccountWishlistProducts(payload?.wishlist?.products || []);
    } catch (error) {
      console.warn("[wishlist]", error);
      renderAccountWishlistState("Je wishlist-koppeling is bijna klaar. De opgeslagen producten verschijnen hier zodra de app-verbinding actief is.");
    }
  }

  async function toggleWishlist(button) {
    const productId = Number(button.dataset.productId);
    if (!productId) return;

    const wasActive = button.classList.contains("is-active");

    if (!wasActive) {
      setButtonState(button, true);
      playWishlistBounce(button);
    }

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
      const isNowActive = wishlistIds.has(productId);
      syncButtons();
      if (!wasActive && isNowActive) {
        showWishlistToast();
      }
      if (!wasActive && !isNowActive) {
        setButtonState(button, false);
      }
      renderAccountWishlistProducts(payload?.wishlist?.products || []);
    } catch (error) {
      console.warn("[wishlist]", error);
      if (!wasActive) {
        setButtonState(button, false);
      }
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
        const item = sizeOption.closest("[data-wishlist-item]");
        const picker = sizeOption.closest(".account-wishlist__size-picker");
        const label = picker?.querySelector(".account-wishlist__size-summary-label");
        const value = sizeOption.dataset.sizeValue || sizeOption.textContent?.trim();
        const selectedVariant = getSelectedWishlistVariant(item, value);
        if (label && value) label.textContent = value;
        picker?.querySelectorAll(".account-wishlist__size-option").forEach((button) => {
          const isSelected = button === sizeOption;
          button.classList.toggle("is-selected", isSelected);
          button.setAttribute("aria-pressed", String(isSelected));
        });
        if (item && value) {
          item.dataset.selectedSize = value;
          item.dataset.selectedVariantId = selectedVariant?.id ? String(selectedVariant.id) : "";
          item.dataset.selectedVariantAvailable = selectedVariant?.available ? "true" : "false";
          clearWishlistFeedback(item);
        }
        if (picker) picker.open = false;
        return;
      }

      const cartTrigger = event.target.closest("[data-wishlist-cart-trigger]");
      if (cartTrigger) {
        event.preventDefault();
        event.stopPropagation();
        addWishlistVariantToCart(cartTrigger);
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
