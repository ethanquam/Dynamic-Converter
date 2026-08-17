(function () {
  "use strict";

  const METERS_PER_FOOT = 0.3048;

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

  function parseDecimal(text) {
    const trimmed = text.trim();
    if (!trimmed) return { empty: true };

    const value = Number(trimmed.replace(/,/g, ""));
    if (!Number.isFinite(value)) {
      return { error: "Enter a valid decimal number." };
    }
    if (value < 0) {
      return { error: "Side length cannot be negative." };
    }

    const meters = unitSystem === "metric" ? value : value * METERS_PER_FOOT;
    return { meters, display: value };
  }

  function formatDisplay(meters) {
    if (!Number.isFinite(meters)) return "";
    const value = unitSystem === "metric" ? meters : meters / METERS_PER_FOOT;
    return String(Number(value.toFixed(10)));
  }

  function unitLabel() {
    return unitSystem === "metric" ? "m" : "ft";
  }

  function unitHint() {
    return unitSystem === "metric" ? "Decimal meters" : "Decimal feet";
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

    const parsed = parseDecimal(input.value);
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
      node.textContent =
        value == null || sides[side]?.error ? "—" : formatDisplay(value);
    });
  }

  function updateSendButton(sides) {
    if (!sendDistanceBtn) return;
    const hypotenuse = sides.c;
    const enabled = hypotenuse != null && !sides.c?.error && Number.isFinite(hypotenuse);
    sendDistanceBtn.disabled = !enabled;
  }

  function syncUnitLabels() {
    document.querySelectorAll("[data-pythag-unit-label]").forEach((el) => {
      el.textContent = unitLabel();
    });
    document.querySelectorAll("[data-pythag-unit-hint]").forEach((el) => {
      el.textContent = unitHint();
    });
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

  sendDistanceBtn?.addEventListener("click", sendToDistance);

  syncUnitLabels();
  window.PythagoreanCalculator = { setFromMeters };

})();
