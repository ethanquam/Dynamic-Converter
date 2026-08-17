(function () {
  "use strict";

  const SURVEY_HASHES = new Set([
    "survey",
    "point-distance-heading",
    "plane-grade-heading",
  ]);

  function pageElements() {
    return {
      converters: {
        page: document.getElementById("page-converters"),
        header: document.getElementById("header-converters"),
        nav: document.getElementById("nav-converters"),
        title: "Dynamic Converter v1",
      },
      survey: {
        page: document.getElementById("page-survey"),
        header: document.getElementById("header-survey"),
        nav: document.getElementById("nav-survey"),
        title: "Survey Tools & Plane Adjustments · Dynamic Converter v1",
      },
    };
  }

  function currentPageName() {
    const hash = (location.hash || "#converters").replace(/^#/, "").toLowerCase();
    return SURVEY_HASHES.has(hash) ? "survey" : "converters";
  }

  function setVisible(element, visible) {
    if (!element) return;
    element.hidden = !visible;
    element.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function showPage(name, options = {}) {
    const pages = pageElements();
    const config = pages[name];
    if (!config || !config.page) return;

    Object.entries(pages).forEach(([key, entry]) => {
      const active = key === name;
      setVisible(entry.page, active);
      setVisible(entry.header, active);
      setVisible(entry.nav, active);
    });

    document.querySelectorAll("[data-page-link]").forEach((link) => {
      const active = link.dataset.pageLink === name;
      link.classList.toggle("is-current", active);
      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    document.title = config.title;

    const heading = config.header?.querySelector("h1");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }

    if (options.updateHash !== false) {
      const targetHash = `#${name === "survey" ? "survey" : "converters"}`;
      if (location.hash !== targetHash) {
        history.replaceState(null, "", targetHash);
      }
      window.scrollTo(0, 0);
    }
  }

  document.addEventListener("click", (event) => {
    const pageLink = event.target.closest("[data-page-link]");
    if (pageLink) {
      event.preventDefault();
      showPage(pageLink.dataset.pageLink, { updateHash: true });
      return;
    }

    const sectionLink = event.target.closest(".app-nav-link[href^='#']");
    if (!sectionLink) return;

    const href = sectionLink.getAttribute("href");
    const hash = href.replace(/^#/, "").toLowerCase();
    if (!SURVEY_HASHES.has(hash)) return;

    event.preventDefault();

    if (hash === "survey") {
      showPage("survey", { updateHash: true });
      return;
    }

    if (currentPageName() !== "survey") {
      showPage("survey", { updateHash: false });
    }

    if (location.hash !== href) {
      history.replaceState(null, "", href);
    }

    const target = document.getElementById(hash);
    if (target) {
      target.scrollIntoView({ block: "start" });
    }
  });

  window.addEventListener("hashchange", () => showPage(currentPageName(), { updateHash: false }));
  showPage(currentPageName(), { updateHash: false });
})();
