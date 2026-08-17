(function () {
  "use strict";

  const STORAGE_KEY = "dynamic-converter-scroll-lock";
  const toggleBtn = document.getElementById("scroll-lock-toggle");
  const floatEl = document.getElementById("scroll-lock-float");
  const labelIdleEl = document.querySelector(".scroll-lock-float-label-text--idle");
  const labelLockedEl = document.querySelector(".scroll-lock-float-label-text--locked");
  const iconUnlockEl = document.getElementById("scroll-lock-icon-unlock");
  const iconLockEl = document.getElementById("scroll-lock-icon-lock");

  let locked = false;
  let scrollY = 0;

  function syncUi() {
    if (!toggleBtn) return;

    toggleBtn.classList.toggle("is-locked", locked);
    toggleBtn.setAttribute("aria-pressed", locked ? "true" : "false");
    toggleBtn.setAttribute(
      "aria-label",
      locked ? "Unlock screen position" : "Lock screen position"
    );
    toggleBtn.title = locked ? "Unlock screen position" : "Lock screen position";

    if (floatEl) {
      floatEl.classList.toggle("is-locked", locked);
    }

    document.documentElement.classList.toggle("is-scroll-locked", locked);

    if (labelIdleEl) labelIdleEl.hidden = locked;
    if (labelLockedEl) labelLockedEl.hidden = !locked;

    if (iconUnlockEl) iconUnlockEl.hidden = locked;
    if (iconLockEl) iconLockEl.hidden = !locked;
  }

  function lockScroll() {
    if (locked) return;
    scrollY = window.scrollY;
    locked = true;
    document.body.classList.add("is-scroll-locked");
    document.body.style.top = `-${scrollY}px`;
    syncUi();
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch (_) {
      /* ignore */
    }
  }

  function unlockScroll() {
    if (!locked) return;
    locked = false;
    document.body.classList.remove("is-scroll-locked");
    document.body.style.top = "";
    syncUi();
    window.scrollTo(0, scrollY);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      /* ignore */
    }
  }

  function toggleScrollLock() {
    if (locked) {
      unlockScroll();
    } else {
      lockScroll();
    }
  }

  function resetLockedViewportTop() {
    if (!locked) return;
    scrollY = 0;
    document.body.style.top = "0px";
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleScrollLock);
  }

  window.addEventListener("hashchange", resetLockedViewportTop);
  document.addEventListener("click", (event) => {
    if (!locked) return;
    if (event.target.closest("[data-page-link], .app-nav-link[href^='#']")) {
      resetLockedViewportTop();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && locked) {
      unlockScroll();
    }
  });

  try {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") {
      lockScroll();
    } else {
      syncUi();
    }
  } catch (_) {
    syncUi();
  }
})();
