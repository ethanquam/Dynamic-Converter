(function () {
  "use strict";

  const STORAGE_KEY = "dynamic-converter-nav-collapsed";
  const MOBILE_QUERY = "(max-width: 820px)";

  const topNavEl = document.getElementById("app-top-nav");
  const bodyEl = document.getElementById("app-top-nav-body");
  const toggleBtn = document.getElementById("app-top-nav-toggle");
  const labelExpandedEl = document.querySelector(".app-top-nav-toggle-label--expanded");
  const labelCollapsedEl = document.querySelector(".app-top-nav-toggle-label--collapsed");

  let collapsed = false;

  function isMobileNav() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function syncUi() {
    if (!topNavEl || !toggleBtn) return;

    const active = isMobileNav() && collapsed;

    topNavEl.classList.toggle("is-collapsed", active);
    document.body.classList.toggle("is-nav-collapsed", active);
    toggleBtn.setAttribute("aria-expanded", active ? "false" : "true");

    if (labelExpandedEl) labelExpandedEl.hidden = active;
    if (labelCollapsedEl) labelCollapsedEl.hidden = !active;

    toggleBtn.title = active ? "Show navigation" : "Hide navigation";
  }

  function setCollapsed(nextCollapsed, persist) {
    collapsed = Boolean(nextCollapsed);
    syncUi();

    if (persist !== false) {
      try {
        if (collapsed) {
          sessionStorage.setItem(STORAGE_KEY, "1");
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      } catch (_) {
        /* ignore */
      }
    }
  }

  function toggleCollapsed() {
    if (!isMobileNav()) return;
    setCollapsed(!collapsed);
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleCollapsed);
  }

  window.matchMedia(MOBILE_QUERY).addEventListener("change", () => {
    syncUi();
  });

  try {
    collapsed = sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch (_) {
    collapsed = false;
  }

  syncUi();
})();
