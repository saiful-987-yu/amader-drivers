/**
 * api.js — the ONLY module that knows how driver/market/vehicle
 * data is fetched or submitted. Everything else calls Api.*
 * and does not care whether data came from Google Sheets (via
 * the Apps Script backend) or from local demo data.
 *
 * Two modes:
 *   - REAL MODE: window.NOBI_CONFIG.API_BASE_URL is set to a
 *     deployed Google Apps Script Web App URL. Every call is
 *     a real network request (see google-apps-script/Code.gs
 *     for the matching backend operations).
 *   - DEMO MODE: API_BASE_URL is null. The app runs entirely
 *     against sample data kept in localStorage, so the full
 *     experience (search, registration, login, availability)
 *     can be tested with no Google Sheet connected.
 *
 * No Google credentials of any kind exist in this file or
 * anywhere else in the frontend.
 *
 * CACHING / PRELOADING
 * ---------------------
 * Markets, Vehicle Categories, and the full Driver directory
 * are each fetched at most once per cache window and reused
 * everywhere. cachedCall() caches the in-flight PROMISE (not
 * just the resolved value), so two near-simultaneous callers
 * (e.g. Api.preload() and a view rendering at the same time)
 * always share one network request instead of firing two.
 * Api.peek*() lets a view check "is this already loaded?"
 * synchronously, so navigating Market -> Vehicle -> Driver List
 * can render instantly with no loading flash once the initial
 * preload has settled.
 */
(function (window, Utils) {
  "use strict";

  const CONFIG = window.NOBI_CONFIG || {};
  const IS_DEMO = !CONFIG.API_BASE_URL;
  const TIMEOUT_MS = CONFIG.REQUEST_TIMEOUT_MS || 12000;
  const CACHE_TTL = CONFIG.CACHE_TTL_MS || 5 * 60 * 1000;

  // key -> { time, promise, settled, value }
  const cache = new Map();

  function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("TIMEOUT")), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function realCall(operation, payload) {
    const url = CONFIG.API_BASE_URL + "?op=" + encodeURIComponent(operation);
    const response = await withTimeout(fetch(url, {
      method: "POST",
      // text/plain avoids a CORS preflight against Apps Script Web Apps.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload || {})
    }), TIMEOUT_MS);
    if (!response.ok) throw new Error("HTTP_" + response.status);
    const data = await response.json();
    if (data && data.ok === false) {
      const err = new Error(data.errorCode || "API_ERROR");
      err.code = data.errorCode;
      throw err;
    }
    return data && data.result;
  }

  function cacheKey(op, payload) {
    return op + ":" + JSON.stringify(payload || {});
  }

  /**
   * Cache the in-flight promise (not just the eventual value) so
   * concurrent callers for the same op+payload always share one
   * network request — this is what makes Api.preload() safe to
   * fire alongside a view's own fetch without doubling requests.
   */
  function cachedCall(op, payload, ttl) {
    const key = cacheKey(op, payload);
    const effectiveTtl = ttl != null ? ttl : CACHE_TTL;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.time < effectiveTtl) {
      return hit.promise;
    }
    const entry = { time: Date.now(), promise: null, settled: false, value: undefined };
    entry.promise = call(op, payload).then((value) => {
      entry.settled = true;
      entry.value = value;
      return value;
    }).catch((err) => {
      // Don't let a failed request poison the cache — allow retry.
      cache.delete(key);
      throw err;
    });
    cache.set(key, entry);
    return entry.promise;
  }

  /** Synchronous peek: returns the cached value if already settled and fresh, else undefined. */
  function peek(op, payload, ttl) {
    const key = cacheKey(op, payload);
    const effectiveTtl = ttl != null ? ttl : CACHE_TTL;
    const hit = cache.get(key);
    if (hit && hit.settled && Date.now() - hit.time < effectiveTtl) return hit.value;
    return undefined;
  }

  function invalidateCache(prefix) {
    Array.from(cache.keys()).forEach((key) => {
      if (!prefix || key.startsWith(prefix)) cache.delete(key);
    });
  }

  // ---------------------------------------------------------
  // DEMO MODE BACKEND — mirrors the shape of the real API so
  // switching to a real Google Sheet later requires no UI code
  // changes. See google-apps-script/Code.gs for the real
  // implementation of every operation used here.
  // ---------------------------------------------------------
  const DemoStore = (function () {
    const KEYS = {
      markets: "nobi.demo.markets",
      vehicles: "nobi.demo.vehicles",
      drivers: "nobi.demo.drivers",
      pending: "nobi.demo.pending",
      users: "nobi.demo.users",
      session: "nobi.demo.session"
    };

    function seedIfEmpty() {
      if (!Utils.storage.get(KEYS.markets)) {
        Utils.storage.set(KEYS.markets, [
          { id: "M001", slug: "nobi-bazar", nameEn: "Nobi Bazar", nameBn: "নবী বাজার", status: "active", sortOrder: 1 },
          { id: "M002", slug: "bangla-bazar", nameEn: "Bangla Bazar", nameBn: "বাংলা বাজার", status: "active", sortOrder: 2 }
        ]);
      }
      if (!Utils.storage.get(KEYS.vehicles)) {
        Utils.storage.set(KEYS.vehicles, [
          { id: "C001", slug: "cng", nameEn: "CNG", nameBn: "সিএনজি", icon: "cng", status: "active", sortOrder: 1 },
          { id: "C002", slug: "auto", nameEn: "Auto", nameBn: "অটো", icon: "auto", status: "active", sortOrder: 2 },
          { id: "C003", slug: "van", nameEn: "Van", nameBn: "ভ্যান", icon: "van", status: "active", sortOrder: 3 },
          { id: "C004", slug: "other", nameEn: "Other", nameBn: "অন্যান্য", icon: "other", status: "active", sortOrder: 4 }
        ]);
      }
      if (!Utils.storage.get(KEYS.drivers)) {
        Utils.storage.set(KEYS.drivers, [
          { driverId: "D001", name: "Mohammad Karim", phone: "01711000001", altPhone: "", vehicleType: "cng", vehicleNumber: "DHA-CNG-1123", marketSlug: "nobi-bazar", serviceArea: "Nobi Bazar & surrounding roads", experience: "6", imageUrl: "", vehicleImageUrl: "", username: "karim.driver", status: "active", availability: "active" },
          { driverId: "D002", name: "Abdur Rahman", phone: "01711000002", altPhone: "01911000002", vehicleType: "cng", vehicleNumber: "DHA-CNG-2245", marketSlug: "nobi-bazar", serviceArea: "Nobi Bazar to Station Road", experience: "3", imageUrl: "", vehicleImageUrl: "", username: "rahman.driver", status: "active", availability: "inactive" },
          { driverId: "D003", name: "Jamal Uddin", phone: "01711000003", altPhone: "", vehicleType: "auto", vehicleNumber: "DHA-AUTO-0091", marketSlug: "nobi-bazar", serviceArea: "Nobi Bazar Market Area", experience: "8", imageUrl: "", vehicleImageUrl: "", username: "jamal.driver", status: "active", availability: "active" },
          { driverId: "D004", name: "Selina Begum", phone: "01711000004", altPhone: "", vehicleType: "van", vehicleNumber: "DHA-VAN-0456", marketSlug: "nobi-bazar", serviceArea: "Nobi Bazar & nearby villages", experience: "4", imageUrl: "", vehicleImageUrl: "", username: "selina.driver", status: "active", availability: "active" },
          { driverId: "D005", name: "Farid Hossain", phone: "01711000005", altPhone: "", vehicleType: "auto", vehicleNumber: "DHA-AUTO-0154", marketSlug: "bangla-bazar", serviceArea: "Bangla Bazar Ghat Road", experience: "5", imageUrl: "", vehicleImageUrl: "", username: "farid.driver", status: "active", availability: "active" }
        ]);
      }
      if (!Utils.storage.get(KEYS.pending)) Utils.storage.set(KEYS.pending, []);
      if (!Utils.storage.get(KEYS.users)) {
        // Demo passwords are stored only for the purposes of this local,
        // no-backend demo. In real mode, passwords never reach the
        // frontend — see Code.gs, which hashes and checks them server-side.
        Utils.storage.set(KEYS.users, [
          { username: "karim.driver", phone: "01711000001", password: "demo1234", driverId: "D001" },
          { username: "rahman.driver", phone: "01711000002", password: "demo1234", driverId: "D002" },
          { username: "jamal.driver", phone: "01711000003", password: "demo1234", driverId: "D003" },
          { username: "selina.driver", phone: "01711000004", password: "demo1234", driverId: "D004" },
          { username: "farid.driver", phone: "01711000005", password: "demo1234", driverId: "D005" }
        ]);
      }
    }

    seedIfEmpty();

    return {
      keys: KEYS,
      markets: () => Utils.storage.get(KEYS.markets, []),
      vehicles: () => Utils.storage.get(KEYS.vehicles, []),
      drivers: () => Utils.storage.get(KEYS.drivers, []),
      pending: () => Utils.storage.get(KEYS.pending, []),
      users: () => Utils.storage.get(KEYS.users, []),
      saveDrivers: (list) => Utils.storage.set(KEYS.drivers, list),
      savePending: (list) => Utils.storage.set(KEYS.pending, list),
      saveUsers: (list) => Utils.storage.set(KEYS.users, list)
    };
  })();

  /** True if a driver record matches a free-text query on name or phone. */
  function matchesQuery(driver, query) {
    if (!query) return true;
    const q = String(query).trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const nameMatch = (driver.name || "").toLowerCase().includes(q);
    const phoneMatch = qDigits && (driver.phone || "").replace(/\D/g, "").includes(qDigits);
    return nameMatch || phoneMatch;
  }

  async function demoCall(operation, payload) {
    // Small artificial delay so loading states are visible even in demo mode.
    await new Promise((resolve) => setTimeout(resolve, 260));
    switch (operation) {
      case "getMarkets":
        return DemoStore.markets().filter((m) => m.status === "active").sort((a, b) => a.sortOrder - b.sortOrder);

      case "getVehicleCategories":
        return DemoStore.vehicles().filter((v) => v.status === "active").sort((a, b) => a.sortOrder - b.sortOrder);

      case "getDrivers": {
        // Always returns the full active-driver directory (unfiltered).
        // Market/vehicle/search filtering happens client-side against
        // this single cached list — see Api.getDrivers below.
        const { marketSlug, vehicleSlug, query } = payload || {};
        let list = DemoStore.drivers().filter((d) => d.status === "active");
        if (marketSlug) list = list.filter((d) => d.marketSlug === marketSlug);
        if (vehicleSlug) list = list.filter((d) => d.vehicleType === vehicleSlug);
        if (query) list = list.filter((d) => matchesQuery(d, query));
        return list.map(publicDriverFields);
      }

      case "registerDriver": {
        const users = DemoStore.users();
        const drivers = DemoStore.drivers();
        const pending = DemoStore.pending();
        const phoneDigits = (payload.phone || "").replace(/\D/g, "");
        const dup = users.some((u) => (u.phone || "").replace(/\D/g, "") === phoneDigits) ||
          drivers.some((d) => (d.phone || "").replace(/\D/g, "") === phoneDigits) ||
          pending.some((p) => (p.phone || "").replace(/\D/g, "") === phoneDigits);
        if (dup) {
          const err = new Error("DUPLICATE_PHONE");
          err.code = "DUPLICATE_PHONE";
          throw err;
        }
        const usernameTaken = users.some((u) => u.username === payload.username) ||
          pending.some((p) => p.username === payload.username);
        if (usernameTaken) {
          const err = new Error("DUPLICATE_USERNAME");
          err.code = "DUPLICATE_USERNAME";
          throw err;
        }
        const applicationId = "APP-" + Utils.uid();
        pending.push(Object.assign({}, payload, {
          applicationId,
          applicationStatus: "pending",
          submittedDate: new Date().toISOString()
        }));
        DemoStore.savePending(pending);
        return { applicationId };
      }

      case "login": {
        const users = DemoStore.users();
        const pending = DemoStore.pending();
        const drivers = DemoStore.drivers();
        const idInput = (payload.identifier || "").trim().toLowerCase();
        const isPending = pending.some((p) =>
          (p.username || "").toLowerCase() === idInput ||
          (p.phone || "").replace(/\D/g, "") === idInput.replace(/\D/g, ""));
        const user = users.find((u) =>
          (u.username || "").toLowerCase() === idInput ||
          (u.phone || "").replace(/\D/g, "") === idInput.replace(/\D/g, ""));
        if (user && user.password === payload.password) {
          const driver = drivers.find((d) => d.driverId === user.driverId);
          const token = "demo-token-" + Utils.uid();
          Utils.storage.set(demoSessionKey(token), { driverId: user.driverId });
          return { token, driver: driverProfileFields(driver) };
        }
        if (isPending) {
          const err = new Error("PENDING_APPROVAL");
          err.code = "PENDING_APPROVAL";
          throw err;
        }
        const err = new Error("INVALID_CREDENTIALS");
        err.code = "INVALID_CREDENTIALS";
        throw err;
      }

      case "getProfile": {
        const session = getDemoSession(payload.token);
        if (!session) throw sessionError();
        const driver = DemoStore.drivers().find((d) => d.driverId === session.driverId);
        if (!driver) throw sessionError();
        return driverProfileFields(driver);
      }

      case "updateAvailability": {
        const session = getDemoSession(payload.token);
        if (!session) throw sessionError();
        const drivers = DemoStore.drivers();
        const idx = drivers.findIndex((d) => d.driverId === session.driverId);
        if (idx === -1) throw sessionError();
        drivers[idx].availability = payload.availability === "active" ? "active" : "inactive";
        DemoStore.saveDrivers(drivers);
        return driverProfileFields(drivers[idx]);
      }

      default:
        throw new Error("UNKNOWN_OPERATION");
    }
  }

  function demoSessionKey(token) {
    return "nobi.demo.session." + token;
  }
  function getDemoSession(token) {
    if (!token) return null;
    return Utils.storage.get(demoSessionKey(token), null);
  }
  function sessionError() {
    const err = new Error("SESSION_EXPIRED");
    err.code = "SESSION_EXPIRED";
    return err;
  }

  /** Fields that are safe to expose on the public driver directory. */
  function publicDriverFields(d) {
    return {
      driverId: d.driverId,
      name: d.name,
      phone: d.phone,
      altPhone: d.altPhone || "",
      vehicleType: d.vehicleType,
      vehicleNumber: d.vehicleNumber,
      marketSlug: d.marketSlug,
      serviceArea: d.serviceArea,
      experience: d.experience,
      imageUrl: d.imageUrl || "",
      vehicleImageUrl: d.vehicleImageUrl || "",
      availability: d.availability
    };
  }

  /** Fields visible on the logged-in driver's own profile (still no password). */
  function driverProfileFields(d) {
    if (!d) return null;
    return Object.assign(publicDriverFields(d), {
      accountStatus: d.status,
      username: d.username
    });
  }

  async function call(operation, payload) {
    return IS_DEMO ? demoCall(operation, payload) : realCall(operation, payload);
  }

  /** Active drivers first, then a stable alphabetical order within each group. */
  function sortDrivers(list) {
    return list.slice().sort((a, b) => {
      const aActive = a.availability === "active" ? 0 : 1;
      const bActive = b.availability === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (a.name || "").localeCompare(b.name || "");
    });
  }

  // ---------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------
  const Api = { isDemo: IS_DEMO };

  Api.getMarkets = () => cachedCall("getMarkets", {});
  Api.getVehicleCategories = () => cachedCall("getVehicleCategories", {});

  /**
   * The full active-driver directory, fetched (and cached) as ONE
   * request regardless of market/vehicle/search — every other
   * driver-list view below filters this single cached list
   * client-side instead of making a new network request per click.
   */
  Api.getDriverDirectory = () => cachedCall("getDrivers", {});

  Api.getDrivers = async (marketSlug, vehicleSlug, query) => {
    let list = await Api.getDriverDirectory();
    if (marketSlug) list = list.filter((d) => d.marketSlug === marketSlug);
    if (vehicleSlug) list = list.filter((d) => d.vehicleType === vehicleSlug);
    if (query) list = list.filter((d) => matchesQuery(d, query));
    return sortDrivers(list);
  };

  // Synchronous cache peeks — used by views to skip the loading
  // skeleton entirely when data has already been preloaded.
  Api.peekMarkets = () => peek("getMarkets", {});
  Api.peekVehicleCategories = () => peek("getVehicleCategories", {});
  Api.peekDriverDirectory = () => peek("getDrivers", {});

  /**
   * Kick off the initial load + background preload chain:
   * Markets first (needed immediately for the homepage), then,
   * as soon as that succeeds, Vehicle Categories and the Driver
   * directory start loading in the background without blocking
   * anything. Safe to call once at startup — later calls just
   * reuse the same cached promises.
   */
  Api.preload = function () {
    return Api.getMarkets().then((markets) => {
      Api.getVehicleCategories().catch(() => {});
      Api.getDriverDirectory().catch(() => {});
      return markets;
    });
  };

  Api.registerDriver = (formData) => call("registerDriver", formData)
    .then((res) => {
      invalidateCache("getDrivers");
      return res;
    });

  Api.login = (identifier, password) => call("login", { identifier, password });
  Api.getProfile = (token) => call("getProfile", { token });
  Api.updateAvailability = (token, availability) =>
    call("updateAvailability", { token, availability }).then((res) => {
      invalidateCache("getDrivers");
      return res;
    });

  window.Api = Api;
})(window, window.Utils);
