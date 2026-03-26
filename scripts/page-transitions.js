(() => {
  const docEl = document.documentElement;
  const transitionStateKey = "odg:page-transition";
  const prefetchedDocuments = new Set();
  const warmedImages = new Set();
  const warmedScripts = new Set();
  const warmedConnections = new Set();
  const reducedMotionQuery = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );
  const hamburgerMenuQuery = window.matchMedia("(max-width: 960px)");
  const sameOrigin = window.location.origin;
  let readyFrame = 0;

  const TRANSITION_IN_MS = 360;
  const MOBILE_TRANSITION_IN_MS = 300;
  const NAVIGATE_DELAY_MS = 180;
  const MOBILE_NAVIGATE_DELAY_MS = 135;

  function hasHamburgerMenuLayout() {
    return hamburgerMenuQuery.matches;
  }

  function syncMotionShell() {
    docEl.classList.add("has-motion-shell");

    if (
      document.readyState === "complete" ||
      document.readyState === "interactive"
    ) {
      markReady();
      return;
    }

    docEl.classList.add("is-booting");
    docEl.classList.remove("is-ready");
  }

  function isSameDocument(url) {
    return (
      url.origin === window.location.origin &&
      url.pathname === window.location.pathname &&
      url.search === window.location.search
    );
  }

  function looksLikeDocument(url) {
    if (url.origin !== sameOrigin) return false;
    const leaf = url.pathname.split("/").pop() || "";
    return (
      !leaf.includes(".") ||
      leaf.endsWith(".html") ||
      leaf.endsWith(".htm")
    );
  }

  function toDocumentUrl(url) {
    const normalized = new URL(url.href);
    normalized.hash = "";
    return normalized;
  }

  function getInternalUrl(link) {
    if (!(link instanceof HTMLAnchorElement)) return null;
    const rawHref = link.getAttribute("href");
    if (
      !rawHref ||
      rawHref.startsWith("#") ||
      rawHref.startsWith("javascript:")
    ) {
      return null;
    }
    try {
      const url = new URL(link.href, window.location.href);
      if (!looksLikeDocument(url)) return null;
      return url;
    } catch {
      return null;
    }
  }

  function isModifiedClick(event, link) {
    return (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      link.hasAttribute("download") ||
      (link.target && link.target !== "_self")
    );
  }

  function warmImage(src) {
    if (!src || warmedImages.has(src)) return;
    warmedImages.add(src);
    const image = new Image();
    image.decoding = "async";
    image.loading = "eager";
    image.src = src;
    image.decode?.().catch(() => {});
  }

  function hasScript(src) {
    return [...document.scripts].some((script) => {
      if (!script.src) return false;

      try {
        return new URL(script.src, window.location.href).href === src;
      } catch {
        return false;
      }
    });
  }

  function warmConnection(src) {
    let origin = "";

    try {
      origin = new URL(src, window.location.href).origin;
    } catch {
      return;
    }

    if (!origin || origin === sameOrigin || warmedConnections.has(origin)) {
      return;
    }

    warmedConnections.add(origin);

    const hint = document.createElement("link");
    hint.rel = "preconnect";
    hint.href = origin;
    hint.crossOrigin = "anonymous";
    document.head.append(hint);
  }

  function warmScript(src) {
    if (!src || warmedScripts.has(src) || hasScript(src)) return;
    warmedScripts.add(src);
    warmConnection(src);

    let isCrossOrigin = false;

    try {
      isCrossOrigin = new URL(src, window.location.href).origin !== sameOrigin;
    } catch {
      isCrossOrigin = false;
    }

    const hint = document.createElement("link");
    hint.rel = "prefetch";
    hint.as = "script";
    hint.href = src;
    if (isCrossOrigin) {
      hint.crossOrigin = "anonymous";
    }
    document.head.append(hint);
  }

  function warmDocumentAssets(markup, url) {
    const parsed = new DOMParser().parseFromString(markup, "text/html");
    parsed
      .querySelectorAll(
        'img[src], link[rel="preload"][as="image"][href]'
      )
      .forEach((node, index) => {
        if (index > 7) return;
        const attr = node.tagName === "IMG" ? "src" : "href";
        const raw = node.getAttribute(attr);
        if (!raw) return;
        try {
          warmImage(new URL(raw, url).href);
        } catch {
          /* noop */
        }
      });
    parsed
      .querySelectorAll(
        'script[src], link[rel="preload"][as="script"][href]'
      )
      .forEach((node, index) => {
        if (index > 3) return;
        const attr = node.tagName === "SCRIPT" ? "src" : "href";
        const raw = node.getAttribute(attr);
        if (!raw) return;
        try {
          warmScript(new URL(raw, url).href);
        } catch {
          /* noop */
        }
      });
  }

  async function prefetchDocument(url) {
    if (!url) return;
    const documentUrl = toDocumentUrl(url);
    if (prefetchedDocuments.has(documentUrl.href)) return;
    prefetchedDocuments.add(documentUrl.href);

    const hint = document.createElement("link");
    hint.rel = "prefetch";
    hint.as = "document";
    hint.href = documentUrl.href;
    document.head.append(hint);

    try {
      const response = await fetch(documentUrl.href, {
        credentials: "same-origin",
      });
      if (!response.ok) return;
      warmDocumentAssets(await response.text(), documentUrl);
    } catch {
      /* noop */
    }
  }

  function clearLockedGeometry() {
    docEl.style.removeProperty("--route-document-height");
    document.body?.style.removeProperty("min-height");
  }

  function lockCurrentGeometry() {
    const documentHeight = Math.ceil(
      Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      )
    );
    docEl.style.setProperty(
      "--route-document-height",
      `${documentHeight}px`
    );
    document.body.style.minHeight = `${documentHeight}px`;
    return { documentHeight };
  }

  function armNavigation(link, url) {
    const { documentHeight } = lockCurrentGeometry();

    sessionStorage.setItem(
      transitionStateKey,
      JSON.stringify({
        from: window.location.pathname,
        to: url.pathname,
        height: documentHeight,
        at: Date.now(),
      })
    );

    link.classList.add("is-routing-link");
    if (link.classList.contains("cta-read")) {
      link.classList.add("is-opening");
    }

    docEl.classList.add("is-routing");
    docEl.classList.remove("is-ready", "is-entering");
    prefetchDocument(url);

    const delay = reducedMotionQuery.matches
      ? 0
      : hasHamburgerMenuLayout()
        ? MOBILE_NAVIGATE_DELAY_MS
        : NAVIGATE_DELAY_MS;
    window.setTimeout(() => {
      window.location.assign(url.href);
    }, delay);
  }

  function restoreArrivalState() {
    const rawState = sessionStorage.getItem(transitionStateKey);
    if (!rawState) return;
    sessionStorage.removeItem(transitionStateKey);

    try {
      const state = JSON.parse(rawState);
      if (state?.to !== window.location.pathname) return;
      if (Date.now() - state.at > 4000) return;
      docEl.classList.add("is-entering");
    } catch {
      /* noop */
    }
  }

  function markReady() {
    cancelAnimationFrame(readyFrame);
    readyFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        docEl.classList.remove("is-booting", "is-routing", "is-entering");
        docEl.classList.add("is-ready");
        window.setTimeout(
          clearLockedGeometry,
          reducedMotionQuery.matches
            ? 0
            : (hasHamburgerMenuLayout()
                ? MOBILE_TRANSITION_IN_MS
                : TRANSITION_IN_MS) + 60
        );
      });
    });
  }

  function wireIntentPrefetch() {
    document.querySelectorAll("a[href]").forEach((link) => {
      const url = getInternalUrl(link);
      if (!url || isSameDocument(url)) return;

      const warm = () => prefetchDocument(url);
      link.addEventListener("mouseenter", warm, { passive: true });
      link.addEventListener("focus", warm, { passive: true });
      link.addEventListener("pointerdown", warm, { passive: true });
      link.addEventListener("touchstart", warm, {
        passive: true,
        once: true,
      });
    });
  }

  function primeLikelyDestinations() {
    const seen = new Set();
    document.querySelectorAll("a[href]").forEach((link) => {
      const url = getInternalUrl(link);
      if (!url || isSameDocument(url) || seen.has(url.href)) return;
      seen.add(toDocumentUrl(url).href);
      prefetchDocument(url);
    });
  }

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest("a[href]");
      if (!link) return;
      const url = getInternalUrl(link);
      if (!url || (isSameDocument(url) && url.hash)) return;
      if (isModifiedClick(event, link)) return;
      event.preventDefault();
      armNavigation(link, url);
    },
    true
  );

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      clearLockedGeometry();
      docEl.classList.remove("is-routing", "is-entering");
    }
    markReady();
  });

  window.addEventListener("load", markReady, { once: true });

  if (typeof hamburgerMenuQuery.addEventListener === "function") {
    hamburgerMenuQuery.addEventListener("change", syncMotionShell);
  } else if (typeof hamburgerMenuQuery.addListener === "function") {
    hamburgerMenuQuery.addListener(syncMotionShell);
  }

  syncMotionShell();
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(primeLikelyDestinations, { timeout: 1400 });
  } else {
    window.setTimeout(primeLikelyDestinations, 700);
  }

  restoreArrivalState();
  wireIntentPrefetch();
  markReady();

  window.ODGTransitions = Object.assign(window.ODGTransitions || {}, {
    prefetch(href) {
      try {
        prefetchDocument(new URL(href, window.location.href));
      } catch {
        /* noop */
      }
    },
    swap(update) {
      if (typeof update !== "function") return Promise.resolve();
      if (reducedMotionQuery.matches) {
        update();
        return Promise.resolve();
      }
      docEl.classList.add("is-local-swapping");
      update();
      return new Promise((resolve) => {
        window.setTimeout(() => {
          docEl.classList.remove("is-local-swapping");
          resolve();
        }, 320);
      });
    },
    prefersReducedMotion() {
      return reducedMotionQuery.matches;
    },
  });
})();
