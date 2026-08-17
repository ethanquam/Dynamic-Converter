(function () {
  "use strict";

  const METERS_PER_FOOT = 0.3048;
  const M2_PER_SQ_FT = METERS_PER_FOOT ** 2;
  const M2_PER_SQ_YD = (3 * METERS_PER_FOOT) ** 2;
  const M2_PER_ACRE = 43560 * M2_PER_SQ_FT;

  const FIELDS = {
    squareMeters: {
      inputId: "input-sq-meters",
      parse: parseDecimal,
      format: (m2) => formatDecimal(m2),
    },
    squareFeet: {
      inputId: "input-sq-feet",
      parse: (text) => parseDecimal(text, (v) => v * M2_PER_SQ_FT),
      format: (m2) => formatDecimal(m2 / M2_PER_SQ_FT),
    },
    squareYards: {
      inputId: "input-sq-yards",
      parse: (text) => parseDecimal(text, (v) => v * M2_PER_SQ_YD),
      format: (m2) => formatDecimal(m2 / M2_PER_SQ_YD),
    },
    acres: {
      inputId: "input-acres",
      parse: (text) => parseDecimal(text, (v) => v * M2_PER_ACRE),
      format: (m2) => formatDecimal(m2 / M2_PER_ACRE),
    },
  };

  let activeField = null;
  let isUpdating = false;
  let currentSquareMeters = 0;

  const statusLine = document.getElementById("area-status-line");

  function parseDecimal(text, toSquareMeters = (v) => v) {
    const trimmed = text.trim();
    if (!trimmed) return { squareMeters: 0, empty: true };

    const normalized = trimmed.replace(/,/g, "");
    const value = Number(normalized);
    if (!Number.isFinite(value)) {
      return { error: "Enter a valid decimal number." };
    }

    return { squareMeters: toSquareMeters(value) };
  }

  function formatDecimal(value, maxDecimals = 10) {
    if (!Number.isFinite(value)) return "";
    return String(Number(value.toFixed(maxDecimals)));
  }

  function setStatus(message, isError = false) {
    statusLine.textContent = message;
    statusLine.hidden = !message;
    statusLine.classList.toggle("is-error", isError);
  }

  function labelFor(key) {
    const labels = {
      squareMeters: "square meters",
      squareFeet: "square feet",
      squareYards: "square yards",
      acres: "acres",
    };
    return labels[key] || key;
  }

  function updateFromField(sourceKey) {
    if (isUpdating) return;

    const field = FIELDS[sourceKey];
    const input = document.getElementById(field.inputId);
    const row = input.closest(".measure-row");
    const text = input.value;

    activeField = sourceKey;
    document.querySelectorAll("#area-converter-grid .measure-row").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.field === sourceKey);
    });

    if (!text.trim()) {
      row.classList.remove("has-error");
      isUpdating = true;
      currentSquareMeters = 0;
      Object.entries(FIELDS).forEach(([key, cfg]) => {
        if (key === sourceKey) return;
        document.getElementById(cfg.inputId).value = "";
      });
      isUpdating = false;
      setStatus("");
      return;
    }

    const parsed = field.parse(text);
    if (parsed.error) {
      row.classList.add("has-error");
      setStatus(parsed.error, true);
      return;
    }

    row.classList.remove("has-error");
    currentSquareMeters = parsed.squareMeters;

    isUpdating = true;
    Object.entries(FIELDS).forEach(([key, cfg]) => {
      if (key === sourceKey) return;
      const target = document.getElementById(cfg.inputId);
      target.value = cfg.format(currentSquareMeters);
      target.closest(".measure-row").classList.remove("has-error");
    });
    isUpdating = false;

    setStatus(`Converted from ${labelFor(sourceKey)}.`);
  }

  Object.keys(FIELDS).forEach((key) => {
    const input = document.getElementById(FIELDS[key].inputId);
    input.addEventListener("input", () => updateFromField(key));
    input.addEventListener("focus", () => {
      activeField = key;
      input.closest(".measure-row").classList.add("is-active");
    });
    input.addEventListener("blur", (e) => {
      if (!e.relatedTarget || !e.relatedTarget.closest("#area-converter-grid .measure-row")) {
        document
          .querySelectorAll("#area-converter-grid .measure-row")
          .forEach((el) => el.classList.remove("is-active"));
      }
    });
  });

  function setFromSquareMeters(squareMeters) {
    if (!Number.isFinite(squareMeters)) return;

    currentSquareMeters = squareMeters;
    activeField = "squareMeters";
    isUpdating = true;

    document.querySelectorAll("#area-converter-grid .measure-row").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.field === "squareMeters");
      el.classList.remove("has-error");
    });

    Object.entries(FIELDS).forEach(([key, cfg]) => {
      document.getElementById(cfg.inputId).value = cfg.format(squareMeters);
    });

    isUpdating = false;
    setStatus("Loaded from construction calculator.");

    const section = document.getElementById("area-converter-heading");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  window.AreaConverter = { setFromSquareMeters };
})();
