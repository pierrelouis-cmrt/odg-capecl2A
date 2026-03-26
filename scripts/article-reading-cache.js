(() => {
  const STORAGE_KEY = "odg:article-reading-progress:v1";

  function getStorage() {
    try {
      const storage = window.localStorage;
      const probeKey = `${STORAGE_KEY}:probe`;
      storage.setItem(probeKey, "1");
      storage.removeItem(probeKey);
      return storage;
    } catch {
      return null;
    }
  }

  const storage = getStorage();

  function getArticleKey(pathname = window.location.pathname) {
    const leaf = pathname.split("/").pop();
    return leaf || "article";
  }

  function normalizeChapter(chapter, total) {
    const parsed = Number.parseInt(chapter, 10);

    if (Number.isNaN(parsed) || parsed < 0) {
      return null;
    }

    if (typeof total !== "number" || total <= 0) {
      return parsed;
    }

    return Math.min(parsed, total - 1);
  }

  function normalizeViewMode(viewMode) {
    return viewMode === "full" || viewMode === "chapter" ? viewMode : null;
  }

  function readState() {
    if (!storage) return {};

    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return {};

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeState(state) {
    if (!storage) return;

    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* noop */
    }
  }

  window.ODGArticleReadingCache = {
    getArticleKey,
    load({ articleKey, total } = {}) {
      const key = getArticleKey(articleKey);
      const entry = readState()[key];
      if (!entry || typeof entry !== "object") return null;

      const chapter = normalizeChapter(entry.chapter, total);
      const viewMode = normalizeViewMode(entry.viewMode);

      if (chapter === null && viewMode === null) return null;

      return {
        chapter,
        viewMode,
      };
    },
    save({ articleKey, chapter, total, viewMode } = {}) {
      const normalizedChapter = normalizeChapter(chapter, total);
      if (normalizedChapter === null) return;

      const key = getArticleKey(articleKey);
      const state = readState();

      state[key] = {
        chapter: normalizedChapter,
        viewMode: normalizeViewMode(viewMode) ?? "chapter",
        updatedAt: Date.now(),
      };

      writeState(state);
    },
  };
})();
