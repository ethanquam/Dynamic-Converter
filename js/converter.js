(function () {
  "use strict";

  const METERS_PER_INTL_FOOT = 0.3048;
  const METERS_PER_SURVEY_FOOT = 1200 / 3937;
  const METERS_PER_INCH = METERS_PER_INTL_FOOT / 12;

  const FIELDS = {
    meters: {
      inputId: "input-meters",
      parse: parseDecimal,
      format: (m) => formatDecimal(m),
    },
    surveyFeet: {
      inputId: "input-survey-feet",
      parse: (text) => parseDecimal(text, (v) => v * METERS_PER_SURVEY_FOOT),
      format: (m) => formatDecimal(m / METERS_PER_SURVEY_FOOT),
    },
    intlFeet: {
      inputId: "input-intl-feet",
      parse: (text) => parseDecimal(text, (v) => v * METERS_PER_INTL_FOOT),
      format: (m) => formatDecimal(m / METERS_PER_INTL_FOOT),
    },
    ftInFraction: {
      inputId: "input-ft-in",
      parse: parseFeetInchesFraction,
      format: (m) => formatFeetInchesFraction(m, getPrecision()),
    },
    decimalInches: {
      inputId: "input-decimal-inches",
      parse: (text) => parseDecimal(text, (v) => v * METERS_PER_INCH),
      format: (m) => formatDecimal(m / METERS_PER_INCH),
    },
  };

  let activeField = null;
  let isUpdating = false;
  let currentMeters = 0;

  const precisionSelect = document.getElementById("precision");
  const statusLine = document.getElementById("status-line");

  function getPrecision() {
    return Number(precisionSelect.value) || 16;
  }

  function parseDecimal(text, toMeters = (v) => v) {
    const trimmed = text.trim();
    if (!trimmed) return { meters: 0, empty: true };

    const normalized = trimmed.replace(/,/g, "");
    const value = Number(normalized);
    if (!Number.isFinite(value)) {
      return { error: "Enter a valid decimal number." };
    }

    return { meters: toMeters(value) };
  }

  function parseFraction(token) {
    const parts = token.split("/");
    if (parts.length !== 2) return null;
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    return num / den;
  }

  function parseFeetInchesFraction(text) {
    const trimmed = text.trim();
    if (!trimmed) return { meters: 0, empty: true };

    let working = trimmed
      .replace(/[″""]/g, '"')
      .replace(/[′'′]/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    // Plain decimal feet (no ft/in markers)
    if (/^-?\d+(\.\d+)?$/.test(working)) {
      const feet = Number(working);
      return { meters: feet * METERS_PER_INTL_FOOT };
    }

    let feet = 0;
    let inches = 0;
    let inchesOnly = false;

    // Feet-inches with hyphen: 12-6 1/2
    const hyphenMatch = working.match(/^(-?\d+)\s*-\s*(.+)$/);
    if (hyphenMatch && !working.includes("'") && !/\bft\b/i.test(working)) {
      feet = Number(hyphenMatch[1]);
      working = hyphenMatch[2];
    }

    // Extract feet portion: 12' or 12 ft
    const feetQuoteMatch = working.match(/^(-?\d+(?:\.\d+)?)\s*'/);
    if (feetQuoteMatch) {
      feet = Number(feetQuoteMatch[1]);
      working = working.slice(feetQuoteMatch[0].length).trim();
    } else {
      const feetWordMatch = working.match(/^(-?\d+(?:\.\d+)?)\s*ft\b/i);
      if (feetWordMatch) {
        feet = Number(feetWordMatch[1]);
        working = working.slice(feetWordMatch[0].length).trim();
      }
    }

    // Inches-only if starts with quote or ends with inch marker
    if (/^(-?\d|.*")/.test(working) && feet === 0 && !working.includes("'")) {
      inchesOnly = /^\d/.test(working) && (working.includes('"') || /\bin\b/i.test(working));
    }

    // Remove trailing inch markers
    working = working.replace(/\s*in(?:ches)?\.?\s*$/i, "").replace(/"\s*$/, "").trim();

    if (!working && feet !== 0) {
      return { meters: feet * METERS_PER_INTL_FOOT };
    }

    if (working) {
      // Split whole inches and optional fraction: "6 1/2" or "6.5"
      const inchParts = working.match(/^(-?\d+(?:\.\d+)?)(?:\s+(\d+\/\d+))?$/);
      if (inchParts) {
        inches = Number(inchParts[1]);
        if (inchParts[2]) {
          const frac = parseFraction(inchParts[2]);
          if (frac === null) return { error: "Invalid fraction." };
          inches += frac;
        }
      } else {
        const fracOnly = working.match(/^(\d+\/\d+)$/);
        if (fracOnly) {
          const frac = parseFraction(fracOnly[1]);
          if (frac === null) return { error: "Invalid fraction." };
          inches = frac;
        } else {
          return {
            error: "Use formats like 12'-6 1/2\", 12-6 1/2, or 6 1/2\".",
          };
        }
      }
    }

    if (inchesOnly && feet === 0) {
      return { meters: inches * METERS_PER_INCH };
    }

    const totalFeet = feet + inches / 12;
    return { meters: totalFeet * METERS_PER_INTL_FOOT };
  }

  function formatDecimal(value, maxDecimals = 10) {
    if (!Number.isFinite(value)) return "";
    const rounded = Number(value.toFixed(maxDecimals));
    return String(rounded);
  }

  function formatFeetInchesFraction(meters, precisionDenominator) {
    if (!Number.isFinite(meters)) return "";

    const sign = meters < 0 ? -1 : 1;
    let totalInches = (Math.abs(meters) / METERS_PER_INCH) * precisionDenominator;
    totalInches = Math.round(totalInches);

    let feet = Math.floor(totalInches / (12 * precisionDenominator));
    let inchUnits = totalInches - feet * 12 * precisionDenominator;

    if (inchUnits === 12 * precisionDenominator) {
      feet += 1;
      inchUnits = 0;
    }

    const wholeInches = Math.floor(inchUnits / precisionDenominator);
    const fracUnits = inchUnits % precisionDenominator;

    let result = (sign < 0 ? "-" : "") + feet + "'";

    if (wholeInches > 0 || fracUnits > 0) {
      result += "-";
      if (wholeInches > 0) result += wholeInches;
      if (fracUnits > 0) {
        const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
        const g = gcd(fracUnits, precisionDenominator);
        const num = fracUnits / g;
        const den = precisionDenominator / g;
        if (wholeInches > 0) result += " ";
        result += num + "/" + den;
      }
      result += '"';
    }

    return result;
  }

  function setStatus(message, isError = false) {
    statusLine.textContent = message;
    statusLine.hidden = !message;
    statusLine.classList.toggle("is-error", isError);
  }

  function updateFromField(sourceKey) {
    if (isUpdating) return;

    const field = FIELDS[sourceKey];
    const input = document.getElementById(field.inputId);
    const row = input.closest(".measure-row");
    const text = input.value;

    activeField = sourceKey;
    document.querySelectorAll(".measure-row").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.field === sourceKey);
    });

    if (!text.trim()) {
      row.classList.remove("has-error");
      isUpdating = true;
      currentMeters = 0;
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
    currentMeters = parsed.meters;

    isUpdating = true;
    Object.entries(FIELDS).forEach(([key, cfg]) => {
      if (key === sourceKey) return;
      const target = document.getElementById(cfg.inputId);
      target.value = cfg.format(currentMeters);
      target.closest(".measure-row").classList.remove("has-error");
    });
    isUpdating = false;

    const diffFt = Math.abs(currentMeters / METERS_PER_SURVEY_FOOT - currentMeters / METERS_PER_INTL_FOOT);
    const diffLabel =
      diffFt >= 0.000001
        ? ` · US vs Intl feet differ by ${formatDecimal(diffFt, 6)} ft at this length`
        : "";

    setStatus(
      `Converted from ${labelFor(sourceKey)}${diffLabel}`
    );
  }

  function labelFor(key) {
    const labels = {
      meters: "meters",
      surveyFeet: "US survey feet",
      intlFeet: "international feet",
      ftInFraction: "feet-inches-fraction",
      decimalInches: "decimal inches",
    };
    return labels[key] || key;
  }

  function refreshFtInDisplay() {
    if (activeField === "ftInFraction") return;
    const input = document.getElementById(FIELDS.ftInFraction.inputId);
    input.value = FIELDS.ftInFraction.format(currentMeters);
  }

  Object.keys(FIELDS).forEach((key) => {
    const input = document.getElementById(FIELDS[key].inputId);
    input.addEventListener("input", () => updateFromField(key));
    input.addEventListener("focus", () => {
      activeField = key;
      input.closest(".measure-row").classList.add("is-active");
    });
    input.addEventListener("blur", (e) => {
      if (!e.relatedTarget || !e.relatedTarget.closest(".measure-row")) {
        document.querySelectorAll(".measure-row").forEach((el) => {
          el.classList.remove("is-active");
        });
      }
    });
  });

  precisionSelect.addEventListener("change", () => {
    refreshFtInDisplay();
    if (activeField) updateFromField(activeField);
  });
})();
