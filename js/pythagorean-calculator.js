(function () {
  "use strict";

  const METERS_PER_FOOT = 0.3048;
  const METERS_PER_INCH = METERS_PER_FOOT / 12;
  const M2_PER_SQ_FT = METERS_PER_FOOT ** 2;
  const M3_PER_CU_FT = METERS_PER_FOOT ** 3;

  const TRIANGLE_SUBTITLE =
    "Enter any two sides of a right triangle — the third updates instantly.";
  const CIRCLE_SUBTITLE =
    "Enter radius or diameter — the other updates instantly. Add depth for volume.";

  const FIELDS = {
    a: { inputId: "pythag-a", label: "Leg A", diagramSide: "a" },
    b: { inputId: "pythag-b", label: "Leg B", diagramSide: "b" },
    c: { inputId: "pythag-c", label: "Hypotenuse", diagramSide: "c" },
  };

  const CIRCLE_FIELDS = {
    radius: { inputId: "pythag-circle-radius", label: "Radius", diagramKey: "radius" },
    diameter: { inputId: "pythag-circle-diameter", label: "Diameter", diagramKey: "diameter" },
  };

  let activeField = null;
  let computedField = null;
  let activeCircleField = null;
  let computedCircleField = null;
  let unitSystem = "imperial";
  let shapeMode = "triangle";
  let isUpdating = false;
  let isCircleUpdating = false;

  const statusLine = document.getElementById("pythag-status-line");
  const shapeSubtitleEl = document.getElementById("pythag-shape-subtitle");
  const trianglePanelEl = document.getElementById("pythag-triangle-panel");
  const circlePanelEl = document.getElementById("pythag-circle-panel");
  const sendDistanceBtn = document.getElementById("pythag-send-distance");
  const sendAreaBtn = document.getElementById("pythag-send-area");
  const sendCircleAreaBtn = document.getElementById("pythag-circle-send-area");
  const sendCircleVolumeBtn = document.getElementById("pythag-circle-send-volume");
  const areaValueEl = document.getElementById("pythag-area-value");
  const areaRowEl = document.getElementById("pythag-area-row");
  const circleAreaValueEl = document.getElementById("pythag-circle-area-value");
  const circleAreaRowEl = document.getElementById("pythag-circle-area-row");
  const circleVolumeValueEl = document.getElementById("pythag-circle-volume-value");
  const circleVolumeRowEl = document.getElementById("pythag-circle-volume-row");
  const circleDepthInput = document.getElementById("pythag-circle-depth");
  const unitTabs = document.querySelectorAll("[data-pythag-units]");
  const shapeTabs = document.querySelectorAll("[data-pythag-shape]");
  const diagramEl = document.getElementById("pythag-diagram");
  const circleDiagramEl = document.getElementById("pythag-circle-diagram");
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

  function triangleAreaSquareMeters(a, b) {
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (a <= 0 || b <= 0) return null;
    return (a * b) / 2;
  }

  function formatArea(squareMeters) {
    if (!Number.isFinite(squareMeters)) return "—";
    if (unitSystem === "metric") {
      return String(Number(squareMeters.toFixed(10)));
    }
    return String(Number((squareMeters / M2_PER_SQ_FT).toFixed(10)));
  }

  function areaUnitLabel() {
    return unitSystem === "metric" ? "m²" : "ft²";
  }

  function volumeUnitLabel() {
    return unitSystem === "metric" ? "m³" : "ft³";
  }

  function formatVolume(cubicMeters) {
    if (!Number.isFinite(cubicMeters)) return "—";
    if (unitSystem === "metric") {
      return String(Number(cubicMeters.toFixed(10)));
    }
    return String(Number((cubicMeters / M3_PER_CU_FT).toFixed(10)));
  }

  function circleAreaSquareMeters(radiusMeters) {
    if (radiusMeters == null || !Number.isFinite(radiusMeters) || radiusMeters <= 0) return null;
    return Math.PI * radiusMeters * radiusMeters;
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

  function updateAreaTile(numericSides) {
    if (!areaValueEl) return;

    const squareMeters = triangleAreaSquareMeters(numericSides.a, numericSides.b);
    areaValueEl.textContent = squareMeters == null ? "—" : formatArea(squareMeters);
    areaRowEl?.classList.toggle("is-ready", squareMeters != null && squareMeters > 0);
  }

  function updateActionButtons(numericSides) {
    const hypotenuse = numericSides.c;
    if (sendDistanceBtn) {
      sendDistanceBtn.disabled = !(hypotenuse != null && Number.isFinite(hypotenuse));
    }

    const squareMeters = triangleAreaSquareMeters(numericSides.a, numericSides.b);
    if (sendAreaBtn) {
      sendAreaBtn.disabled = !(squareMeters != null && squareMeters > 0);
    }
  }

  function updateDerivedOutputs(numericSides) {
    updateDiagram(numericSides);
    updateAreaTile(numericSides);
    updateActionButtons(numericSides);
  }

  function readCircleMeters(key) {
    const input = document.getElementById(CIRCLE_FIELDS[key].inputId);
    if (!input) return { empty: true };

    const parsed = parseSide(input.value);
    if (parsed.error) return { error: parsed.error };
    if (parsed.empty) return { empty: true };
    return { meters: parsed.meters };
  }

  function setCircleRowState(key, { isActive = false, hasError = false, isComputed = false } = {}) {
    const input = document.getElementById(CIRCLE_FIELDS[key].inputId);
    const row = input?.closest(".measure-row");
    if (!row) return;
    row.classList.toggle("is-active", isActive);
    row.classList.toggle("has-error", hasError);
    row.classList.toggle("is-computed", isComputed);
  }

  function writeCircleField(key, meters, { computed = false } = {}) {
    const input = document.getElementById(CIRCLE_FIELDS[key].inputId);
    if (!input) return;
    input.value = formatDisplay(meters);
    if (computed) computedCircleField = key;
    setCircleRowState(key, { isComputed: computed });
  }

  function clearCircleField(key) {
    const input = document.getElementById(CIRCLE_FIELDS[key].inputId);
    if (!input) return;
    input.value = "";
    setCircleRowState(key, { isComputed: false });
    if (computedCircleField === key) computedCircleField = null;
  }

  function readCircleNumericState() {
    const numeric = {};
    for (const key of Object.keys(CIRCLE_FIELDS)) {
      const result = readCircleMeters(key);
      if (typeof result.meters === "number") numeric[key] = result.meters;
    }
    return numeric;
  }

  function getCircleRadiusMeters(numeric) {
    if (numeric.radius != null && numeric.radius > 0) return numeric.radius;
    if (numeric.diameter != null && numeric.diameter > 0) return numeric.diameter / 2;
    return null;
  }

  function updateCircleDiagram(numeric) {
    if (!circleDiagramEl) return;

    circleDiagramEl.querySelectorAll("[data-circle]").forEach((node) => {
      const key = node.dataset.circle;
      const value = numeric[key];
      const formatted = value == null ? "—" : formatDiagram(value);
      node.textContent = formatted;
      node.classList.toggle("is-long", formatted.length > 10);
    });
  }

  function updateCircleAreaVolume(numeric) {
    const squareMeters = circleAreaSquareMeters(getCircleRadiusMeters(numeric));

    if (circleAreaValueEl) {
      circleAreaValueEl.textContent = squareMeters == null ? "—" : formatArea(squareMeters);
    }
    circleAreaRowEl?.classList.toggle("is-ready", squareMeters != null && squareMeters > 0);

    const depthParsed = circleDepthInput ? parseSide(circleDepthInput.value) : { empty: true };
    let cubicMeters = null;
    if (
      squareMeters != null &&
      !depthParsed.error &&
      !depthParsed.empty &&
      depthParsed.meters > 0
    ) {
      cubicMeters = squareMeters * depthParsed.meters;
    }

    if (circleVolumeValueEl) {
      circleVolumeValueEl.textContent = cubicMeters == null ? "—" : formatVolume(cubicMeters);
    }
    circleVolumeRowEl?.classList.toggle("is-ready", cubicMeters != null && cubicMeters > 0);

    return { squareMeters, cubicMeters, depthError: depthParsed.error };
  }

  function updateCircleActionButtons(results) {
    if (sendCircleAreaBtn) {
      sendCircleAreaBtn.disabled = !(results.squareMeters != null && results.squareMeters > 0);
    }
    if (sendCircleVolumeBtn) {
      sendCircleVolumeBtn.disabled = !(results.cubicMeters != null && results.cubicMeters > 0);
    }
  }

  function updateCircleDerivedOutputs(numeric) {
    const results = updateCircleAreaVolume(numeric);
    updateCircleDiagram(numeric);
    updateCircleActionButtons(results);
    return results;
  }

  function refreshCircleFormattedValues(numeric) {
    isCircleUpdating = true;
    Object.keys(CIRCLE_FIELDS).forEach((key) => {
      const input = document.getElementById(CIRCLE_FIELDS[key].inputId);
      if (!input) return;
      if (numeric[key] != null) {
        input.value = formatDisplay(numeric[key]);
      }
    });
    if (circleDepthInput?.value.trim()) {
      const depthParsed = parseSide(circleDepthInput.value);
      if (!depthParsed.error && !depthParsed.empty) {
        circleDepthInput.value = formatDisplay(depthParsed.meters);
      }
    }
    isCircleUpdating = false;
    updateCircleDerivedOutputs(numeric);
  }

  function updateCircleFromField(sourceKey) {
    if (isCircleUpdating) return;

    activeCircleField = sourceKey;
    if (computedCircleField === sourceKey) {
      computedCircleField = null;
    }

    const radiusResult = readCircleMeters("radius");
    const diameterResult = readCircleMeters("diameter");
    const numeric = { radius: null, diameter: null };
    let firstError = null;

    if (radiusResult.error) {
      firstError = radiusResult.error;
    } else if (!radiusResult.empty) {
      numeric.radius = radiusResult.meters;
    }

    if (diameterResult.error) {
      firstError = firstError || diameterResult.error;
    } else if (!diameterResult.empty) {
      numeric.diameter = diameterResult.meters;
    }

    setCircleRowState("radius", {
      isActive: sourceKey === "radius",
      hasError: Boolean(radiusResult.error),
      isComputed: computedCircleField === "radius",
    });
    setCircleRowState("diameter", {
      isActive: sourceKey === "diameter",
      hasError: Boolean(diameterResult.error),
      isComputed: computedCircleField === "diameter",
    });

    if (firstError) {
      setStatus(firstError, true);
      updateCircleDerivedOutputs(numeric);
      return;
    }

    if (numeric.radius == null && numeric.diameter == null) {
      if (computedCircleField) clearCircleField(computedCircleField);
      setStatus("");
      updateCircleDerivedOutputs(numeric);
      return;
    }

    if (sourceKey === "radius" && numeric.radius == null && computedCircleField === "diameter") {
      clearCircleField("diameter");
      numeric.diameter = null;
      setStatus("");
      updateCircleDerivedOutputs(numeric);
      return;
    }

    if (sourceKey === "diameter" && numeric.diameter == null && computedCircleField === "radius") {
      clearCircleField("radius");
      numeric.radius = null;
      setStatus("");
      updateCircleDerivedOutputs(numeric);
      return;
    }

    if (sourceKey === "radius" && numeric.radius != null) {
      isCircleUpdating = true;
      writeCircleField("diameter", numeric.radius * 2, { computed: true });
      numeric.diameter = numeric.radius * 2;
      isCircleUpdating = false;
      setStatus(`Diameter calculated from radius (${unitHint().toLowerCase()}).`);
    } else if (sourceKey === "diameter" && numeric.diameter != null) {
      isCircleUpdating = true;
      writeCircleField("radius", numeric.diameter / 2, { computed: true });
      numeric.radius = numeric.diameter / 2;
      isCircleUpdating = false;
      setStatus(`Radius calculated from diameter (${unitHint().toLowerCase()}).`);
    }

    setCircleRowState("radius", {
      isActive: sourceKey === "radius",
      isComputed: computedCircleField === "radius",
    });
    setCircleRowState("diameter", {
      isActive: sourceKey === "diameter",
      isComputed: computedCircleField === "diameter",
    });

    const results = updateCircleDerivedOutputs(numeric);
    if (circleDepthInput?.value.trim()) {
      if (results.depthError) {
        setStatus(results.depthError, true);
      } else if (results.cubicMeters != null) {
        setStatus("Circle area and volume ready — send to the converters when you are done.");
      }
    } else if (results.squareMeters != null && sourceKey !== "radius" && sourceKey !== "diameter") {
      setStatus(`Circle area calculated (${unitHint().toLowerCase()}). Add depth for volume.`);
    }
  }

  function updateCircleDepth() {
    if (shapeMode !== "circle") return;

    const numeric = readCircleNumericState();
    const results = updateCircleDerivedOutputs(numeric);

    if (results.depthError) {
      setStatus(results.depthError, true);
      return;
    }

    if (results.cubicMeters != null) {
      setStatus("Circle area and volume ready — send to the converters when you are done.");
      return;
    }

    if (results.squareMeters != null && circleDepthInput?.value.trim()) {
      setStatus("Enter a positive depth for volume.", true);
      return;
    }

    if (results.squareMeters != null) {
      setStatus(`Circle area calculated (${unitHint().toLowerCase()}). Add depth for volume.`);
      return;
    }

    setStatus("");
  }

  function setShapeMode(mode) {
    if (mode !== "triangle" && mode !== "circle") return;
    if (mode === shapeMode) return;

    shapeMode = mode;

    shapeTabs.forEach((tab) => {
      const active = tab.dataset.pythagShape === shapeMode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (trianglePanelEl) trianglePanelEl.hidden = shapeMode !== "triangle";
    if (circlePanelEl) circlePanelEl.hidden = shapeMode !== "circle";
    if (shapeSubtitleEl) {
      shapeSubtitleEl.textContent = shapeMode === "triangle" ? TRIANGLE_SUBTITLE : CIRCLE_SUBTITLE;
    }

    setStatus("");

    if (shapeMode === "circle") {
      updateCircleFromField(activeCircleField || "radius");
    } else {
      updateFromField(activeField || "a");
    }
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
    document.querySelectorAll("[data-pythag-area-unit-label]").forEach((el) => {
      el.textContent = areaUnitLabel();
    });
    document.querySelectorAll("[data-pythag-circle-unit-label]").forEach((el) => {
      el.hidden = hideUnit;
      el.textContent = unitLabel();
    });
    document.querySelectorAll("[data-pythag-circle-unit-hint]").forEach((el) => {
      el.textContent = unitHint();
    });
    document.querySelectorAll("[data-pythag-circle-area-unit-label]").forEach((el) => {
      el.textContent = areaUnitLabel();
    });
    document.querySelectorAll("[data-pythag-circle-volume-unit-label]").forEach((el) => {
      el.textContent = volumeUnitLabel();
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
    Object.keys(CIRCLE_FIELDS).forEach((key) => {
      const input = document.getElementById(CIRCLE_FIELDS[key].inputId);
      if (!input) return;
      input.placeholder = inputPlaceholder();
      if (unitSystem === "metric" || unitSystem === "imperial") {
        input.setAttribute("inputmode", "decimal");
      } else {
        input.removeAttribute("inputmode");
      }
    });
    if (circleDepthInput) {
      circleDepthInput.placeholder = inputPlaceholder();
      if (unitSystem === "metric" || unitSystem === "imperial") {
        circleDepthInput.setAttribute("inputmode", "decimal");
      } else {
        circleDepthInput.removeAttribute("inputmode");
      }
    }
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
    updateDerivedOutputs(numericSides);
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
      updateDerivedOutputs(numericSides);
      return;
    }

    const knownCount = Object.values(numericSides).filter((value) => value != null).length;

    if (knownCount < 2) {
      if (computedField && computedField !== sourceKey) {
        clearField(computedField);
      }
      setStatus("");
      updateDerivedOutputs(numericSides);
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
      updateDerivedOutputs(numericSides);
      return;
    }

    const result = calculateThird(numericSides, target);
    if (!result.ok) {
      setStatus(result.error || "Need two known sides to solve the triangle.", true);
      updateDerivedOutputs(numericSides);
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

    updateDerivedOutputs(numericSides);
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

    const circleNumeric = readCircleNumericState();

    unitSystem = nextSystem;

    unitTabs.forEach((tab) => {
      const active = tab.dataset.pythagUnits === unitSystem;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    syncUnitLabels();

    refreshFormattedValues(numericSides);
    refreshCircleFormattedValues(circleNumeric);
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

  function sendToArea() {
    const sides = readAllSides();
    const a = typeof sides.a === "number" ? sides.a : null;
    const b = typeof sides.b === "number" ? sides.b : null;
    const squareMeters = triangleAreaSquareMeters(a, b);
    if (squareMeters == null || squareMeters <= 0) return;
    if (window.AreaConverter?.setFromSquareMeters) {
      window.AreaConverter.setFromSquareMeters(squareMeters);
      document.getElementById("area-converter-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setStatus("Sent triangle area to the Area Converter.");
    }
  }

  function sendCircleToArea() {
    const numeric = readCircleNumericState();
    const squareMeters = circleAreaSquareMeters(getCircleRadiusMeters(numeric));
    if (squareMeters == null || squareMeters <= 0) return;
    if (window.AreaConverter?.setFromSquareMeters) {
      window.AreaConverter.setFromSquareMeters(squareMeters);
      document.getElementById("area-converter-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setStatus("Sent circle area to the Area Converter.");
    }
  }

  function sendCircleToVolume() {
    const numeric = readCircleNumericState();
    const squareMeters = circleAreaSquareMeters(getCircleRadiusMeters(numeric));
    const depthParsed = parseSide(circleDepthInput?.value ?? "");
    if (depthParsed.error || depthParsed.empty || depthParsed.meters <= 0) return;
    if (squareMeters == null || squareMeters <= 0) return;
    const cubicMeters = squareMeters * depthParsed.meters;
    if (window.VolumeConverter?.setFromCubicMeters) {
      window.VolumeConverter.setFromCubicMeters(cubicMeters);
      document.getElementById("volume-converter-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setStatus("Sent circle volume to the Volume Converter.");
    }
  }

  function setFromMeters(meters) {
    if (shapeMode !== "triangle") setShapeMode("triangle");
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

  shapeTabs.forEach((tab) => {
    tab.addEventListener("click", () => setShapeMode(tab.dataset.pythagShape));
  });

  unitTabs.forEach((tab) => {
    tab.addEventListener("click", () => setUnitSystem(tab.dataset.pythagUnits));
  });

  Object.keys(CIRCLE_FIELDS).forEach((key) => {
    const input = document.getElementById(CIRCLE_FIELDS[key].inputId);
    if (!input) return;

    input.addEventListener("focus", () => {
      activeCircleField = key;
      Object.keys(CIRCLE_FIELDS).forEach((fieldKey) => {
        setCircleRowState(fieldKey, {
          isActive: fieldKey === key,
          isComputed: fieldKey === computedCircleField,
        });
      });
    });

    input.addEventListener("input", () => updateCircleFromField(key));
  });

  circleDepthInput?.addEventListener("input", updateCircleDepth);

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
    refreshCircleFormattedValues(readCircleNumericState());
  });

  sendDistanceBtn?.addEventListener("click", sendToDistance);
  sendAreaBtn?.addEventListener("click", sendToArea);
  sendCircleAreaBtn?.addEventListener("click", sendCircleToArea);
  sendCircleVolumeBtn?.addEventListener("click", sendCircleToVolume);

  syncUnitLabels();
  updateDerivedOutputs({ a: null, b: null, c: null });
  updateCircleDerivedOutputs({ radius: null, diameter: null });
  window.PythagoreanCalculator = { setFromMeters };

})();
