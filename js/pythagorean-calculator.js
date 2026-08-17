(function () {
  "use strict";

  const METERS_PER_FOOT = 0.3048;
  const METERS_PER_INCH = METERS_PER_FOOT / 12;

  const FIELDS = {
    a: { inputId: "pythag-a", label: "Leg A", diagramSide: "a" },
    b: { inputId: "pythag-b", label: "Leg B", diagramSide: "b" },
    c: { inputId: "pythag-c", label: "Hypotenuse", diagramSide: "c" },
  };

  let activeField = null;
  let computedField = null;
  let unitSystem = "imperial";
  let isUpdating = false;

  const statusLine = document.getElementById("pythag-status-line");
  const sendDistanceBtn = document.getElementById("pythag-send-distance");
  const unitTabs = document.querySelectorAll("[data-pythag-units]");
  const diagramEl = document.getElementById("pythag-diagram");
  const precisionSelect = document.getElementById("precision");

  function getPrecision() {
    return Number(precisionSelect?.value) || 16;
  }

  function parseFraction(text) {
    const match = text.match(/^(-?\d+)\s*\/\s*(\d+)$/);
    if (!match) return null;
    const num = Number(match[1]);
    const den = Number(match[2]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    return num / den;
  }

  function parseFeetInchesFraction(text) {
    const trimmed = text.trim();
    if (!trimmed) return { empty: true };

    let working = trimmed
      .replace(/[″""]/g, '"')
      .replace(/[′'′]/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    if (/^-?\d+(\.\d+)?$/.test(working)) {
      const feet = Number(working);
      if (feet < 0) return { error: "Side length cannot be negative." };
      return { meters: feet * METERS_PER_FOOT };
    }

    let feet = 0;
    let inches = 0;
    let inchesOnly = false;

    const hyphenMatch = working.match(/^(-?\d+)\s*-\s*(.+)$/);
    if (hyphenMatch && !working.includes("'") && !/\bft\b/i.test(working)) {
      feet = Number(hyphenMatch[1]);
      working = hyphenMatch[2];
    }

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

    if (/^(-?\d|.*")/.test(working) && feet === 0 && !working.includes("'")) {
      inchesOnly = /^\d/.test(working) && (working.includes('"') || /\bin\b/i.test(working));
    }

    working = working.replace(/\s*in(?:ches)?\.?\s*$/i, "").replace(/"\s*$/, "").trim();

    if (!working && feet !== 0) {
      if (feet < 0) return { error: "Side length cannot be negative." };
      return { meters: feet * METERS_PER_FOOT };
    }

    if (working) {
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
            error: 'Use formats like 12\'-6 1/2", 12-6 1/2, or 6 1/2".',
          };
        }
      }
    }

    if (inchesOnly && feet === 0) {
      if (inches < 0) return { error: "Side length cannot be negative." };
      return { meters: inches * METERS_PER_INCH };
    }

    const totalFeet = feet + inches / 12;
    if (totalFeet < 0) return { error: "Side length cannot be negative." };
    return { meters: totalFeet * METERS_PER_FOOT };
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

  function parseDecimal(text, toMeters = (value) => value) {
    const trimmed = text.trim();
    if (!trimmed) return { empty: true };

    const value = Number(trimmed.replace(/,/g, ""));
    if (!Number.isFinite(value)) {
      return { error: "Enter a valid decimal number." };
    }
    if (value < 0) {
      return { error: "Side length cannot be negative." };
    }

    return { meters: toMeters(value) };
  }

  function parseSide(text) {
    if (unitSystem === "metric") {
      return parseDecimal(text, (value) => value);
    }
    if (unitSystem === "imperial") {
      return parseDecimal(text, (value) => value * METERS_PER_FOOT);
    }
    return parseFeetInchesFraction(text);
  }

  function formatDisplay(meters) {
    if (!Number.isFinite(meters)) return "";
    if (unitSystem === "metric") {
      return String(Number(meters.toFixed(10)));
    }
    if (unitSystem === "imperial") {
      return String(Number((meters / METERS_PER_FOOT).toFixed(10)));
    }
    return formatFeetInchesFraction(meters, getPrecision());
  }

  function formatDiagram(meters) {
    if (!Number.isFinite(meters)) return "—";
    const formatted = formatDisplay(meters);
    return formatted.length > 14 ? formatted.replace(/"/g, "") : formatted;
  }

  function unitLabel() {
    if (unitSystem === "metric") return "m";
    if (unitSystem === "imperial") return "ft";
    return "";
  }

  function unitHint() {
    if (unitSystem === "metric") return "Decimal meters";
    if (unitSystem === "imperial") return "Decimal feet";
    return "Feet, inches, fractions";
  }

  function inputPlaceholder() {
    if (unitSystem === "metric") return "e.g. 1.524";
    if (unitSystem === "imperial") return "e.g. 3.5";
    return "e.g. 3'-4 1/2\"";
  }

  function setStatus(message, isError = false) {
    if (!statusLine) return;
    statusLine.textContent = message;
    statusLine.hidden = !message;
    statusLine.classList.toggle("is-error", isError);
  }

  function readSideMeters(key) {
    const input = document.getElementById(FIELDS[key].inputId);
    if (!input) return { empty: true };

    const parsed = parseSide(input.value);
    if (parsed.error) return { error: parsed.error };
    if (parsed.empty) return { empty: true };
    return { meters: parsed.meters };
  }

  function readAllSides() {
    const sides = {};
    for (const key of Object.keys(FIELDS)) {
      const result = readSideMeters(key);
      if (result.error) {
        sides[key] = { error: result.error };
      } else if (result.empty) {
        sides[key] = null;
      } else {
        sides[key] = result.meters;
      }
    }
    return sides;
  }

  function calculateThird(sides, target) {
    const a = sides.a;
    const b = sides.b;
    const c = sides.c;

    if (target === "c") {
      if (a == null || b == null) return { ok: false };
      return { ok: true, meters: Math.hypot(a, b) };
    }

    if (target === "a") {
      if (b == null || c == null) return { ok: false };
      if (c <= b) {
        return { ok: false, error: "Hypotenuse must be longer than leg B." };
      }
      return { ok: true, meters: Math.sqrt(c * c - b * b) };
    }

    if (target === "b") {
      if (a == null || c == null) return { ok: false };
      if (c <= a) {
        return { ok: false, error: "Hypotenuse must be longer than leg A." };
      }
      return { ok: true, meters: Math.sqrt(c * c - a * a) };
    }

    return { ok: false };
  }

  function pickComputedField(sourceKey, sides) {
    if (sourceKey === "a" || sourceKey === "b") return "c";
    if (sides.a != null) return "b";
    return "a";
  }

  function setRowState(key, { isActive = false, hasError = false, isComputed = false } = {}) {
    const input = document.getElementById(FIELDS[key].inputId);
    const row = input?.closest(".measure-row");
    if (!row) return;
    row.classList.toggle("is-active", isActive);
    row.classList.toggle("has-error", hasError);
    row.classList.toggle("is-computed", isComputed);
  }

  function writeField(key, meters, { computed = false } = {}) {
    const input = document.getElementById(FIELDS[key].inputId);
    if (!input) return;
    input.value = formatDisplay(meters);
    if (computed) computedField = key;
    setRowState(key, { isComputed: computed });
  }

  function clearField(key) {
    const input = document.getElementById(FIELDS[key].inputId);
    if (!input) return;
    input.value = "";
    setRowState(key, { isComputed: false });
    if (computedField === key) computedField = null;
  }

  function updateDiagram(sides) {
    if (!diagramEl) return;

    diagramEl.querySelectorAll("[data-side]").forEach((node) => {
      const side = node.dataset.side;
      const value = sides[side];
      const formatted =
        value == null || (typeof value === "object" && value.error) ? "—" : formatDiagram(value);
      node.textContent = formatted;
      node.classList.toggle("is-long", formatted.length > 10);
    });
  }

  function updateSendButton(sides) {
    if (!sendDistanceBtn) return;
    const hypotenuse = sides.c;
    const enabled = hypotenuse != null && !sides.c?.error && Number.isFinite(hypotenuse);
    sendDistanceBtn.disabled = !enabled;
  }

  function syncUnitLabels() {
    const hideUnit = unitSystem === "imperial-ftin";

    document.querySelectorAll("[data-pythag-unit-label]").forEach((el) => {
      el.hidden = hideUnit;
      el.textContent = unitLabel();
    });
    document.querySelectorAll("[data-pythag-unit-hint]").forEach((el) => {
      el.textContent = unitHint();
    });
    Object.keys(FIELDS).forEach((key) => {
      const input = document.getElementById(FIELDS[key].inputId);
      if (!input) return;
      input.placeholder = inputPlaceholder();
      if (unitSystem === "metric" || unitSystem === "imperial") {
        input.setAttribute("inputmode", "decimal");
      } else {
        input.removeAttribute("inputmode");
      }
    });
  }

  function refreshFormattedValues(numericSides) {
    isUpdating = true;
    Object.keys(FIELDS).forEach((key) => {
      const input = document.getElementById(FIELDS[key].inputId);
      if (!input) return;
      if (numericSides[key] != null) {
        input.value = formatDisplay(numericSides[key]);
      }
    });
    isUpdating = false;
    updateDiagram(numericSides);
    updateSendButton(numericSides);
  }

  function updateFromField(sourceKey) {
    if (isUpdating) return;

    activeField = sourceKey;
    if (computedField === sourceKey) {
      computedField = null;
    }

    const sides = readAllSides();
    const numericSides = {};
    let firstError = null;

    Object.keys(FIELDS).forEach((key) => {
      const side = sides[key];
      if (side && typeof side === "object" && side.error) {
        firstError = side.error;
        numericSides[key] = null;
        return;
      }
      numericSides[key] = side == null ? null : side;
    });

    Object.keys(FIELDS).forEach((key) => {
      setRowState(key, {
        isActive: key === sourceKey,
        hasError: Boolean(sides[key] && typeof sides[key] === "object" && sides[key].error),
        isComputed: key === computedField,
      });
    });

    if (firstError) {
      setStatus(firstError, true);
      updateDiagram(numericSides);
      updateSendButton(numericSides);
      return;
    }

    const knownCount = Object.values(numericSides).filter((value) => value != null).length;

    if (knownCount < 2) {
      if (computedField && computedField !== sourceKey) {
        clearField(computedField);
      }
      setStatus("");
      updateDiagram(numericSides);
      updateSendButton(numericSides);
      return;
    }

    let target = null;
    if (knownCount === 2) {
      target = Object.keys(FIELDS).find((key) => numericSides[key] == null) || null;
    } else {
      target = pickComputedField(sourceKey, numericSides);
      computedField = target;
    }

    if (!target) {
      setStatus("");
      updateDiagram(numericSides);
      updateSendButton(numericSides);
      return;
    }

    const result = calculateThird(numericSides, target);
    if (!result.ok) {
      setStatus(result.error || "Need two known sides to solve the triangle.", true);
      updateDiagram(numericSides);
      updateSendButton(numericSides);
      return;
    }

    isUpdating = true;
    writeField(target, result.meters, { computed: true });
    numericSides[target] = result.meters;
    isUpdating = false;

    setStatus(
      target === "c"
        ? `Hypotenuse calculated from legs A and B (${unitHint().toLowerCase()}).`
        : `Leg ${target.toUpperCase()} calculated from the other two sides.`
    );

    Object.keys(FIELDS).forEach((key) => {
      setRowState(key, {
        isActive: key === sourceKey,
        isComputed: key === computedField,
      });
    });

    updateDiagram(numericSides);
    updateSendButton(numericSides);
  }

  function setUnitSystem(nextSystem) {
    if (nextSystem === unitSystem) return;

    const sides = readAllSides();
    const numericSides = {};
    for (const key of Object.keys(FIELDS)) {
      if (typeof sides[key] === "number") {
        numericSides[key] = sides[key];
      }
    }

    unitSystem = nextSystem;

    unitTabs.forEach((tab) => {
      const active = tab.dataset.pythagUnits === unitSystem;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    syncUnitLabels();

    refreshFormattedValues(numericSides);
  }

  function sendToDistance() {
    const result = readSideMeters("c");
    if (result.error || result.empty) return;
    if (window.DistanceConverter?.setFromMeters) {
      window.DistanceConverter.setFromMeters(result.meters);
      document.getElementById("converter-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setStatus("Sent hypotenuse to the Distance Converter.");
    }
  }

  function setFromMeters(meters) {
    if (!Number.isFinite(meters) || meters < 0) return;
    isUpdating = true;
    writeField("c", meters, { computed: false });
    isUpdating = false;
    computedField = null;
    activeField = "c";
    updateFromField("c");
  }

  Object.keys(FIELDS).forEach((key) => {
    const input = document.getElementById(FIELDS[key].inputId);
    if (!input) return;

    input.addEventListener("focus", () => {
      activeField = key;
      Object.keys(FIELDS).forEach((fieldKey) => {
        setRowState(fieldKey, {
          isActive: fieldKey === key,
          isComputed: fieldKey === computedField,
        });
      });
    });

    input.addEventListener("input", () => updateFromField(key));
  });

  unitTabs.forEach((tab) => {
    tab.addEventListener("click", () => setUnitSystem(tab.dataset.pythagUnits));
  });

  precisionSelect?.addEventListener("change", () => {
    if (unitSystem !== "imperial-ftin") return;
    const sides = readAllSides();
    const numericSides = {};
    for (const key of Object.keys(FIELDS)) {
      if (typeof sides[key] === "number") {
        numericSides[key] = sides[key];
      }
    }
    refreshFormattedValues(numericSides);
  });

  sendDistanceBtn?.addEventListener("click", sendToDistance);

  syncUnitLabels();
  window.PythagoreanCalculator = { setFromMeters };

})();
