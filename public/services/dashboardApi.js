(function () {
  const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;
  const JSON_HEADERS = { "Content-Type": "application/json" };

  function cloneHeaders(headers) {
    if (!headers) return {};
    if (headers instanceof Headers) {
      const entries = {};
      headers.forEach((value, key) => {
        entries[key] = value;
      });
      return entries;
    }
    return { ...headers };
  }

  function withJsonHeaders(options = {}) {
    const next = { ...options };
    if (next.body && !(next.body instanceof FormData) && !(next.body instanceof Blob)) {
      const headers = cloneHeaders(next.headers);
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = JSON_HEADERS["Content-Type"];
      }
      next.headers = headers;
      if (typeof next.body !== "string") {
        next.body = JSON.stringify(next.body);
      }
    }
    return next;
  }

  function normalizeBase(base) {
    if (!base) return "";
    const trimmed = String(base).trim();
    if (!trimmed) return "";
    if (trimmed === "/") return "";
    return trimmed.replace(/\/+$/, "");
  }

  function resolveConfiguredBases() {
    if (typeof window === "undefined") {
      return [""];
    }

    const bases = new Set();
    const { location, document } = window;

    const globalBase = window.__DASHBOARD_API_BASE__;
    if (typeof globalBase === "string") {
      normalizeBase(globalBase)
        .split(",")
        .map((b) => normalizeBase(b))
        .filter(Boolean)
        .forEach((b) => bases.add(b));
    }

    const datasetBase =
      document?.documentElement?.dataset?.apiBase ||
      document?.body?.dataset?.apiBase ||
      "";
    if (datasetBase) {
      datasetBase
        .split(",")
        .map((b) => normalizeBase(b))
        .filter(Boolean)
        .forEach((b) => bases.add(b));
    }

    const metaBase = document
      ?.querySelector("meta[name='dashboard-api-base']")
      ?.getAttribute("content");
    if (metaBase) {
      normalizeBase(metaBase)
        .split(",")
        .map((b) => normalizeBase(b))
        .filter(Boolean)
        .forEach((b) => bases.add(b));
    }

    if (location?.origin) {
      bases.add(normalizeBase(location.origin));
    }

    if (
      location &&
      (location.hostname === "localhost" || location.hostname.startsWith("127.")) &&
      location.port &&
      location.port !== "5000"
    ) {
      const fallback = `${location.protocol}//${location.hostname}:5000`;
      bases.add(normalizeBase(fallback));
    }

    if (!bases.size) {
      bases.add("");
    }

    return Array.from(bases);
  }

  function buildRequestUrl(base, path) {
    if (!base || ABSOLUTE_URL_PATTERN.test(path)) {
      return path;
    }

    const cleanedBase = normalizeBase(base);
    const cleanedPath = path.startsWith("/") ? path.slice(1) : path;
    return `${cleanedBase}/${cleanedPath}`;
  }

  function shouldRetry(status) {
    if (status === undefined || status === null) {
      return true;
    }
    if (status === 404 || status === 503 || status === 502 || status === 0) {
      return true;
    }
    if (status >= 500) {
      return true;
    }
    return false;
  }

  async function fetchWithBaseCandidates(path, options = {}) {
    const merged = withJsonHeaders(options);
    let lastError = null;
    const bases = resolveConfiguredBases();

    for (let index = 0; index < bases.length; index += 1) {
      const base = bases[index];
      const url = buildRequestUrl(base, path);

      try {
        const response = await fetch(url, merged);
        let data = null;

        try {
          data = await response.clone().json();
        } catch (error) {
          data = null;
        }

        if (!response.ok) {
          const message =
            (data && typeof data.error === "string" && data.error) ||
            `Request failed (${response.status})`;
          const requestError = new Error(message);
          requestError.status = response.status;
          requestError.data = data;
          requestError.url = url;
          lastError = requestError;

          if (index < bases.length - 1 && shouldRetry(response.status)) {
            continue;
          }

          throw requestError;
        }

        return data;
      } catch (error) {
        lastError = error;
        if (index === bases.length - 1) {
          throw error;
        }
      }
    }

    throw lastError || new Error("Request failed");
  }

  function requestJson(path, options = {}) {
    if (ABSOLUTE_URL_PATTERN.test(path)) {
      return fetchWithBaseCandidates(path, options);
    }

    const sanitizedPath = path.startsWith("/") ? path : `/${path}`;
    return fetchWithBaseCandidates(sanitizedPath, options);
  }

  async function getSheetList() {
    return requestJson("/sheets");
  }

  async function getSheetState(sheetName) {
    return requestJson("/sheet", {
      method: "POST",
      body: {
        action: "get-state",
        sheetName,
      },
    });
  }

  async function updateSheetCell(sheetName, cell, value) {
    return requestJson("/sheet", {
      method: "POST",
      body: {
        action: "update-cell",
        sheetName,
        cell,
        value,
      },
    });
  }

  if (typeof window !== "undefined") {
    window.dashboardApi = {
      getSheetList,
      getSheetState,
      updateSheetCell,
      requestJson,
    };
  }
})();
