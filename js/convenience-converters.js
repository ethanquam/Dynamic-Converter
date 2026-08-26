(function () {
  "use strict";

  const M_PER_MILE = 1609.344;
  const M_PER_KM = 1000;
  const M_PER_NMI = 1852;

  const ML_PER_TSP = 4.92892159375;
  const ML_PER_TBSP = 14.78676478125;
  const ML_PER_FL_OZ = 29.5735295625;
  const ML_PER_CUP = 236.5882365;
  const ML_PER_PINT = 473.176473;
  const ML_PER_QUART = 946.352946;
  const ML_PER_GALLON = 3785.411784;
  const ML_PER_LITER = 1000;

  const G_PER_OZ = 28.349523125;
  const G_PER_LB = 453.59237;
  const G_PER_KG = 1000;

  const BYTES_PER_KB = 1000;
  const BYTES_PER_MB = BYTES_PER_KB ** 2;
  const BYTES_PER_GB = BYTES_PER_KB ** 3;
  const BYTES_PER_TB = BYTES_PER_KB ** 4;
  const BYTES_PER_KIB = 1024;
  const BYTES_PER_MIB = BYTES_PER_KIB ** 2;
  const BYTES_PER_GIB = BYTES_PER_KIB ** 3;
  const BYTES_PER_TIB = BYTES_PER_KIB ** 4;

  function parseDecimal(text) {
    const trimmed = text.trim();
    if (!trimmed) return { empty: true };

    const normalized = trimmed.replace(/,/g, "");
    const value = Number(normalized);
    if (!Number.isFinite(value)) {
      return { error: "Enter a valid decimal number." };
    }

    return { value };
  }

  function formatDecimal(value, maxDecimals = 8) {
    if (!Number.isFinite(value)) return "";
    return String(Number(value.toFixed(maxDecimals)));
  }

  function createConverter({ gridSelector, statusId, fields, labels }) {
    const statusLine = document.getElementById(statusId);
    const grid = document.querySelector(gridSelector);
    if (!grid || !statusLine) return;

    let isUpdating = false;
    let currentBase = 0;

    function setStatus(message, isError = false) {
      statusLine.textContent = message;
      statusLine.hidden = !message;
      statusLine.classList.toggle("is-error", isError);
    }

    function updateFromField(sourceKey) {
      if (isUpdating) return;

      const field = fields[sourceKey];
      const input = document.getElementById(field.inputId);
      const row = input.closest(".measure-row");
      const text = input.value;

      grid.querySelectorAll(".measure-row").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.field === sourceKey);
      });

      if (!text.trim()) {
        row.classList.remove("has-error");
        isUpdating = true;
        currentBase = 0;
        Object.entries(fields).forEach(([key, cfg]) => {
          if (key === sourceKey) return;
          document.getElementById(cfg.inputId).value = "";
        });
        isUpdating = false;
        setStatus("");
        return;
      }

      const parsed = parseDecimal(text);
      if (parsed.error) {
        row.classList.add("has-error");
        setStatus(parsed.error, true);
        return;
      }

      row.classList.remove("has-error");
      currentBase = field.toBase(parsed.value);

      isUpdating = true;
      Object.entries(fields).forEach(([key, cfg]) => {
        if (key === sourceKey) return;
        const target = document.getElementById(cfg.inputId);
        target.value = formatDecimal(cfg.fromBase(currentBase), cfg.maxDecimals);
        target.closest(".measure-row").classList.remove("has-error");
      });
      isUpdating = false;

      setStatus(`Converted from ${labels[sourceKey] || sourceKey}.`);
    }

    Object.keys(fields).forEach((key) => {
      const input = document.getElementById(fields[key].inputId);
      input.addEventListener("input", () => updateFromField(key));
      input.addEventListener("focus", () => {
        input.closest(".measure-row").classList.add("is-active");
      });
      input.addEventListener("blur", (event) => {
        if (!event.relatedTarget || !event.relatedTarget.closest(`${gridSelector} .measure-row`)) {
          grid.querySelectorAll(".measure-row").forEach((el) => el.classList.remove("is-active"));
        }
      });
    });
  }

  createConverter({
    gridSelector: "#temperature-converter-grid",
    statusId: "temperature-status-line",
    labels: {
      celsius: "Celsius",
      fahrenheit: "Fahrenheit",
      kelvin: "Kelvin",
    },
    fields: {
      celsius: {
        inputId: "input-temp-celsius",
        toBase: (v) => v,
        fromBase: (v) => v,
        maxDecimals: 2,
      },
      fahrenheit: {
        inputId: "input-temp-fahrenheit",
        toBase: (v) => ((v - 32) * 5) / 9,
        fromBase: (v) => (v * 9) / 5 + 32,
        maxDecimals: 2,
      },
      kelvin: {
        inputId: "input-temp-kelvin",
        toBase: (v) => v - 273.15,
        fromBase: (v) => v + 273.15,
        maxDecimals: 2,
      },
    },
  });

  createConverter({
    gridSelector: "#travel-distance-converter-grid",
    statusId: "travel-distance-status-line",
    labels: {
      miles: "miles",
      kilometers: "kilometers",
      nauticalMiles: "nautical miles",
    },
    fields: {
      miles: {
        inputId: "input-travel-miles",
        toBase: (v) => v * M_PER_MILE,
        fromBase: (v) => v / M_PER_MILE,
        maxDecimals: 6,
      },
      kilometers: {
        inputId: "input-travel-kilometers",
        toBase: (v) => v * M_PER_KM,
        fromBase: (v) => v / M_PER_KM,
        maxDecimals: 6,
      },
      nauticalMiles: {
        inputId: "input-travel-nautical-miles",
        toBase: (v) => v * M_PER_NMI,
        fromBase: (v) => v / M_PER_NMI,
        maxDecimals: 6,
      },
    },
  });

  createConverter({
    gridSelector: "#cooking-fluid-converter-grid",
    statusId: "cooking-fluid-status-line",
    labels: {
      milliliters: "milliliters",
      teaspoons: "teaspoons",
      tablespoons: "tablespoons",
      fluidOunces: "fluid ounces",
      cups: "cups",
      pints: "pints",
      quarts: "quarts",
      liters: "liters",
      gallons: "gallons",
    },
    fields: {
      milliliters: {
        inputId: "input-cooking-fluid-ml",
        toBase: (v) => v,
        fromBase: (v) => v,
        maxDecimals: 4,
      },
      teaspoons: {
        inputId: "input-cooking-fluid-tsp",
        toBase: (v) => v * ML_PER_TSP,
        fromBase: (v) => v / ML_PER_TSP,
        maxDecimals: 4,
      },
      tablespoons: {
        inputId: "input-cooking-fluid-tbsp",
        toBase: (v) => v * ML_PER_TBSP,
        fromBase: (v) => v / ML_PER_TBSP,
        maxDecimals: 4,
      },
      fluidOunces: {
        inputId: "input-cooking-fluid-fl-oz",
        toBase: (v) => v * ML_PER_FL_OZ,
        fromBase: (v) => v / ML_PER_FL_OZ,
        maxDecimals: 4,
      },
      cups: {
        inputId: "input-cooking-fluid-cups",
        toBase: (v) => v * ML_PER_CUP,
        fromBase: (v) => v / ML_PER_CUP,
        maxDecimals: 4,
      },
      pints: {
        inputId: "input-cooking-fluid-pints",
        toBase: (v) => v * ML_PER_PINT,
        fromBase: (v) => v / ML_PER_PINT,
        maxDecimals: 4,
      },
      quarts: {
        inputId: "input-cooking-fluid-quarts",
        toBase: (v) => v * ML_PER_QUART,
        fromBase: (v) => v / ML_PER_QUART,
        maxDecimals: 4,
      },
      liters: {
        inputId: "input-cooking-fluid-liters",
        toBase: (v) => v * ML_PER_LITER,
        fromBase: (v) => v / ML_PER_LITER,
        maxDecimals: 6,
      },
      gallons: {
        inputId: "input-cooking-fluid-gallons",
        toBase: (v) => v * ML_PER_GALLON,
        fromBase: (v) => v / ML_PER_GALLON,
        maxDecimals: 6,
      },
    },
  });

  createConverter({
    gridSelector: "#cooking-weight-converter-grid",
    statusId: "cooking-weight-status-line",
    labels: {
      grams: "grams",
      kilograms: "kilograms",
      ounces: "ounces",
      pounds: "pounds",
    },
    fields: {
      grams: {
        inputId: "input-cooking-weight-grams",
        toBase: (v) => v,
        fromBase: (v) => v,
        maxDecimals: 4,
      },
      kilograms: {
        inputId: "input-cooking-weight-kg",
        toBase: (v) => v * G_PER_KG,
        fromBase: (v) => v / G_PER_KG,
        maxDecimals: 6,
      },
      ounces: {
        inputId: "input-cooking-weight-oz",
        toBase: (v) => v * G_PER_OZ,
        fromBase: (v) => v / G_PER_OZ,
        maxDecimals: 4,
      },
      pounds: {
        inputId: "input-cooking-weight-lb",
        toBase: (v) => v * G_PER_LB,
        fromBase: (v) => v / G_PER_LB,
        maxDecimals: 4,
      },
    },
  });

  createConverter({
    gridSelector: "#data-size-converter-grid",
    statusId: "data-size-status-line",
    labels: {
      bytes: "bytes",
      kilobytes: "kilobytes (decimal)",
      megabytes: "megabytes (decimal)",
      gigabytes: "gigabytes (decimal)",
      terabytes: "terabytes (decimal)",
      kibibytes: "kibibytes (binary)",
      mebibytes: "mebibytes (binary)",
      gibibytes: "gibibytes (binary)",
      tebibytes: "tebibytes (binary)",
    },
    fields: {
      bytes: {
        inputId: "input-data-size-bytes",
        toBase: (v) => v,
        fromBase: (v) => v,
        maxDecimals: 0,
      },
      kilobytes: {
        inputId: "input-data-size-kb",
        toBase: (v) => v * BYTES_PER_KB,
        fromBase: (v) => v / BYTES_PER_KB,
        maxDecimals: 6,
      },
      megabytes: {
        inputId: "input-data-size-mb",
        toBase: (v) => v * BYTES_PER_MB,
        fromBase: (v) => v / BYTES_PER_MB,
        maxDecimals: 6,
      },
      gigabytes: {
        inputId: "input-data-size-gb",
        toBase: (v) => v * BYTES_PER_GB,
        fromBase: (v) => v / BYTES_PER_GB,
        maxDecimals: 6,
      },
      terabytes: {
        inputId: "input-data-size-tb",
        toBase: (v) => v * BYTES_PER_TB,
        fromBase: (v) => v / BYTES_PER_TB,
        maxDecimals: 6,
      },
      kibibytes: {
        inputId: "input-data-size-kib",
        toBase: (v) => v * BYTES_PER_KIB,
        fromBase: (v) => v / BYTES_PER_KIB,
        maxDecimals: 6,
      },
      mebibytes: {
        inputId: "input-data-size-mib",
        toBase: (v) => v * BYTES_PER_MIB,
        fromBase: (v) => v / BYTES_PER_MIB,
        maxDecimals: 6,
      },
      gibibytes: {
        inputId: "input-data-size-gib",
        toBase: (v) => v * BYTES_PER_GIB,
        fromBase: (v) => v / BYTES_PER_GIB,
        maxDecimals: 6,
      },
      tebibytes: {
        inputId: "input-data-size-tib",
        toBase: (v) => v * BYTES_PER_TIB,
        fromBase: (v) => v / BYTES_PER_TIB,
        maxDecimals: 6,
      },
    },
  });
})();
