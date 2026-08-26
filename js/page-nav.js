(function () {
  "use strict";

  const PAGE_DEFAULT_HASH = {
    converters: "converters",
    convenience: "convenience",
    survey: "survey",
  };

  const PAGE_HASHES = {
    converters: new Set([
      "converters",
      "distance-converter-heading",
      "slope-converter-heading",
      "area-converter-heading",
      "volume-converter-heading",
      "construction-calc-heading",
      "pythagorean-heading",
    ]),
    convenience: new Set([
      "convenience",
      "convenience-intro-heading",
      "temperature-converter-heading",
      "travel-distance-converter-heading",
      "cooking-fluid-converter-heading",
      "cooking-weight-converter-heading",
      "data-size-converter-heading",
    ]),
    survey: new Set(["survey", "point-distance-heading", "plane-grade-heading"]),
  };

  function pageElements() {
    return {
      converters: {
        page: document.getElementById("page-converters"),
        header: null,
        sectionHeadingId: "distance-converter-heading",
        nav: document.getElementById("nav-converters"),
        title: "Construction Converters & Calculators · Dynamic Converter v1",
      },
      convenience: {
        page: document.getElementById("page-convenience"),
        header: null,
        sectionHeadingId: "convenience-intro-heading",
        nav: document.getElementById("nav-convenience"),
        title: "Convenience Converters · Dynamic Converter v1",
      },
      survey: {
        page: document.getElementById("page-survey"),
        header: null,
        sectionHeadingId: "point-distance-heading",
        nav: document.getElementById("nav-survey"),
        title: "Survey Tools & Plane Adjustments · Dynamic Converter v1",
      },
    };
  }

  function pageForHash(hash) {
    if (PAGE_HASHES.survey.has(hash)) return "survey";
    if (PAGE_HASHES.convenience.has(hash)) return "convenience";
    return "converters";
  }

  function currentPageName() {
    const hash = (location.hash || "#converters").replace(/^#/, "").toLowerCase();
    return pageForHash(hash);
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

    const heading =
      config.header?.querySelector("h1") ||
      (config.sectionHeadingId && document.getElementById(config.sectionHeadingId));
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }

    if (options.updateHash !== false) {
      const targetHash = `#${PAGE_DEFAULT_HASH[name] || PAGE_DEFAULT_HASH.converters}`;
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
    const targetPage = pageForHash(hash);

    if (hash === PAGE_DEFAULT_HASH.converters || hash === PAGE_DEFAULT_HASH.convenience || hash === PAGE_DEFAULT_HASH.survey) {
      event.preventDefault();
      showPage(targetPage, { updateHash: true });
      return;
    }

    if (!PAGE_HASHES.survey.has(hash) && !PAGE_HASHES.convenience.has(hash) && !PAGE_HASHES.converters.has(hash)) {
      return;
    }

    event.preventDefault();

    if (currentPageName() !== targetPage) {
      showPage(targetPage, { updateHash: false });
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
