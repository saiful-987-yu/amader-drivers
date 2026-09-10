/**
 * search.js — small, reusable search helpers shared by the
 * driver-list search box and the global quick-search screen.
 * Kept separate from drivers.js so the matching logic can be
 * unit-tested or reused (e.g. if a future screen needs local
 * filtering of an already-loaded driver list without another
 * network/API call).
 */
(function (window, Utils) {
  "use strict";

  const Search = {};

  /** True if a driver record matches a free-text query on name or phone. */
  Search.matches = function (driver, query) {
    if (!query) return true;
    const q = Utils.clean(query).toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const nameMatch = (driver.name || "").toLowerCase().includes(q);
    const phoneMatch = qDigits && (driver.phone || "").replace(/\D/g, "").includes(qDigits);
    return nameMatch || phoneMatch;
  };

  /** Filter an already-loaded list locally, avoiding a repeat network call. */
  Search.filterLocal = function (list, query) {
    if (!query) return list;
    return list.filter((driver) => Search.matches(driver, query));
  };

  window.Search = Search;
})(window, window.Utils);
