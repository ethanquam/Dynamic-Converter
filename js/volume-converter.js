(function () {
  "use strict";

  const METERS_PER_FOOT = 0.3048;
  const M3_PER_CU_FT = METERS_PER_FOOT ** 3;
  const M3_PER_CU_YD = (3 * METERS_PER_FOOT) ** 3;

  const FIELDS = {
    cubicMeters: {
      inputId: "input-cu-meters",
      parse: parseDecimal,
      format: (m3) => formatDecimal(m3),
    },
    cubicFeet: {
      inputId: "input-cu-feet",
      parse: (text) => parseDecimal(text, (v) => v * M3_PER_CU_FT),
      format: (m3) => formatDecimal(m3 / M3_PER_CU_FT),
    },
    cubicYards: {
      inputId: "input-cu-yards",
      parse: (text) => parseDecimal(text, (v) => v * M3_PER_CU_YD),
      format: (m3) => formatDecimal(m3 / M3_PER_CU_YD),
    },
  };

  let activeField = null;
  let isUpdating = false;
  let currentCubicMeters = 0;

  const statusLine = document.getElementById("volume-status-line");

  function parseDecimal(text, toCubicMeters = (v) => v) {
    const trimmed = text.trim();
    if (!trimmed) return { cubicMeters: 0, empty: true };

    const normalized = trimmed.replace(/,/g, "");
    const value = Number(normalized);
    if (!Number.isFinite(value)) {
      return { error: "Enter a valid decimal number." };
    }

    return { cubicMeters: toCubicMeters(value) };
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
      cubicMeters: "cubic meters",
      cubicFeet: "cubic feet",
      cubicYards: "cubic yards",
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
    document
      .querySelectorAll("#volume-converter-grid .measure-row")
      .forEach((el) => {
        el.classList.toggle("is-active", el.dataset.field === sourceKey);
      });

    if (!text.trim()) {
      row.classList.remove("has-error");
      isUpdating = true;
      currentCubicMeters = 0;
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
    currentCubicMeters = parsed.cubicMeters;

    isUpdating = true;
    Object.entries(FIELDS).forEach(([key, cfg]) => {
      if (key === sourceKey) return;
      const target = document.getElementById(cfg.inputId);
      target.value = cfg.format(currentCubicMeters);
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
      if (!e.relatedTarget || !e.relatedTarget.closest("#volume-converter-grid .measure-row")) {
        document
          .querySelectorAll("#volume-converter-grid .measure-row")
          .forEach((el) => el.classList.remove("is-active"));
      }
    });
  });
})();
