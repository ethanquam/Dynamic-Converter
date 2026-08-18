(function () {
  "use strict";

  const METERS_PER_FOOT = 0.3048;
  const METERS_PER_INCH = METERS_PER_FOOT / 12;
  const M2_PER_SQ_FT = METERS_PER_FOOT ** 2;
  const M3_PER_CU_FT = METERS_PER_FOOT ** 3;
  const isCoarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const HANDLE_RADIUS = isCoarsePointer ? 18 : 12;
  const CLOSE_SNAP_PX = isCoarsePointer ? 22 : 16;
  const LONG_PRESS_MS = 480;
  const PRESS_MOVE_CANCEL_PX = 12;
  const CLOSURE_OVERLAY_MAX_METERS = 0.25;

  const canvas = document.getElementById("photo-area-canvas");
  const fileInput = document.getElementById("photo-area-file-input");
  const fileNameEl = document.getElementById("photo-area-file-name");
  const workspaceEl = document.getElementById("photo-area-workspace");
  const edgesPanelEl = document.getElementById("photo-area-edges-panel");
  const edgesBodyEl = document.getElementById("photo-area-edges-body");
  const undoBtn = document.getElementById("photo-area-undo");
  const undoFloatBtn = document.getElementById("photo-area-undo-float");
  const closeBtn = document.getElementById("photo-area-close-shape");
  const clearBtn = document.getElementById("photo-area-clear");
  const statusLine = document.getElementById("photo-area-status-line");
  const areaInput = document.getElementById("photo-area-area");
  const resultVolumeEl = document.getElementById("photo-area-result-volume");
  const depthInput = document.getElementById("photo-area-depth");
  const sendAreaBtn = document.getElementById("photo-area-send-area");
  const sendVolumeBtn = document.getElementById("photo-area-send-volume");
  const computeFinalEdgeBtn = document.getElementById("photo-area-compute-final-edge");
  const traceHintEl = document.getElementById("photo-area-trace-hint");
  const toolbarEl = document.getElementById("photo-area-toolbar");
  const canvasWrapEl = document.getElementById("photo-area-canvas-wrap");
  const edgesNoteEl = document.getElementById("photo-area-edges-note");
  const edgesActionsEl = document.querySelector(".photo-area-edges-actions");
  const resultsEl = document.querySelector(".photo-area-results");
  const unitTabs = document.querySelectorAll("[data-photo-area-units]");
  const DEFAULT_EDGES_NOTE =
    edgesNoteEl?.textContent?.trim() ||
    "Enter all but one edge, then click Compute final edge — the result is marked orange Check for field verification.";

  const state = {
    unitSystem: "imperial",
    image: null,
    imageUrl: "",
    vertices: [],
    closed: false,
    edges: [],
    dragIndex: null,
    pendingPress: null,
    highlightedEdgeIndex: null,
    areaSquareMeters: null,
    volumeCubicMeters: null,
    autoEdgeIndex: null,
    autoEdgeMeters: null,
    closureGapMeters: null,
    averageMetersPerPixel: null,
    areaManualOverride: false,
    computeFinalEdge: false,
    exampleActive: false,
    exampleStatic: false,
  };

  function setStatus(message, isError = false) {
    if (!statusLine) return;
    statusLine.textContent = message;
    statusLine.hidden = !message;
    statusLine.classList.toggle("is-error", isError);
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
      if (feet < 0) return { error: "Length cannot be negative." };
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
      if (feet < 0) return { error: "Length cannot be negative." };
      return { meters: feet * METERS_PER_FOOT };
    }

    if (working) {
      const inchHyphenFrac = working.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+\/\d+)$/);
      if (inchHyphenFrac) {
        inches = Number(inchHyphenFrac[1]);
        const frac = parseFraction(inchHyphenFrac[2]);
        if (frac === null) return { error: "Invalid fraction." };
        inches += frac;
      } else {
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
            error: 'Use formats like 12\'-6 1/2", 5\' 7-1/2", or 6 1/2".',
          };
        }
      }
      }
    }

    if (inchesOnly && feet === 0) {
      if (inches < 0) return { error: "Length cannot be negative." };
      return { meters: inches * METERS_PER_INCH };
    }

    const totalFeet = feet + inches / 12;
    if (totalFeet < 0) return { error: "Length cannot be negative." };
    return { meters: totalFeet * METERS_PER_FOOT };
  }

  function parseNumber(text) {
    const trimmed = text.trim();
    if (!trimmed) return { empty: true };
    const value = Number(trimmed.replace(/,/g, ""));
    if (!Number.isFinite(value) || value < 0) {
      return { error: "Enter a valid non-negative number." };
    }
    return { value };
  }

  function parseLength(text) {
    if (state.unitSystem === "imperial-ftin") {
      return parseFeetInchesFraction(text);
    }
    const parsed = parseNumber(text);
    if (parsed.empty || parsed.error) return parsed;
    const meters = state.unitSystem === "metric" ? parsed.value : parsed.value * METERS_PER_FOOT;
    return { meters };
  }

  function parseArea(text) {
    const parsed = parseNumber(text);
    if (parsed.empty || parsed.error) return parsed;
    const squareMeters =
      state.unitSystem === "metric" ? parsed.value : parsed.value * M2_PER_SQ_FT;
    return { squareMeters };
  }

  function formatFeetInchesFraction(meters, precisionDenominator = 16) {
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

  function formatLength(meters) {
    if (!Number.isFinite(meters)) return "";
    if (state.unitSystem === "imperial-ftin") {
      return formatFeetInchesFraction(meters);
    }
    const value = state.unitSystem === "metric" ? meters : meters / METERS_PER_FOOT;
    return String(Number(value.toFixed(4)));
  }

  function formatAreaValue(squareMeters) {
    if (!Number.isFinite(squareMeters)) return "";
    if (state.unitSystem === "metric") {
      return String(Number(squareMeters.toFixed(4)));
    }
    return String(Number((squareMeters / M2_PER_SQ_FT).toFixed(4)));
  }

  function shoelaceArea(vertices) {
    if (vertices.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < vertices.length; i += 1) {
      const j = (i + 1) % vertices.length;
      sum += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
    }
    return Math.abs(sum) * 0.5;
  }

  function edgeDirection(edgeIndex) {
    const verts = state.vertices;
    const j = (edgeIndex + 1) % verts.length;
    const dx = verts[j].x - verts[edgeIndex].x;
    const dy = verts[j].y - verts[edgeIndex].y;
    const len = Math.hypot(dx, dy) || 1;
    return { ux: dx / len, uy: dy / len };
  }

  function resolveEdgeLengths() {
    const n = state.edges.length;
    const lengths = new Array(n).fill(null);
    const emptyIndices = [];

    for (let i = 0; i < n; i += 1) {
      const text = state.edges[i].lengthText.trim();
      if (!text) {
        emptyIndices.push(i);
        continue;
      }
      const parsed = parseLength(text);
      if (parsed.error) return { error: parsed.error, edgeIndex: i };
      if (!parsed.empty) lengths[i] = parsed.meters;
    }

    if (emptyIndices.length === 1 && state.computeFinalEdge) {
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < n; i += 1) {
        if (i === emptyIndices[0]) continue;
        if (lengths[i] == null) return { lengths, emptyIndices };
        const { ux, uy } = edgeDirection(i);
        sx += lengths[i] * ux;
        sy += lengths[i] * uy;
      }
      const autoIndex = emptyIndices[0];
      const autoMeters = Math.hypot(sx, sy);
      lengths[autoIndex] = autoMeters;
      return {
        lengths,
        emptyIndices,
        autoIndex,
        autoMeters,
        closureGapMeters: 0,
      };
    }

    if (emptyIndices.length === 0) {
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < n; i += 1) {
        if (lengths[i] == null) return { lengths, emptyIndices };
        const { ux, uy } = edgeDirection(i);
        sx += lengths[i] * ux;
        sy += lengths[i] * uy;
      }
      return {
        lengths,
        emptyIndices,
        closureGapMeters: Math.hypot(sx, sy),
      };
    }

    return { lengths, emptyIndices };
  }

  function measuredScaleSamples(lengths, excludeAuto = true) {
    const samples = [];
    for (let i = 0; i < state.edges.length; i += 1) {
      if (excludeAuto && state.autoEdgeIndex === i) continue;
      const len = lengths[i];
      if (len == null || len <= 0) continue;
      if (state.edges[i].pixelLength <= 0) continue;
      samples.push(len / state.edges[i].pixelLength);
    }
    return samples;
  }

  function averageMetersPerPixel(lengths, excludeAuto = true) {
    const samples = measuredScaleSamples(lengths, excludeAuto);
    if (samples.length === 0) return null;
    return samples.reduce((sum, value) => sum + value, 0) / samples.length;
  }

  function areaFromTrace(lengths, excludeAutoFromScale = true) {
    const mpp = averageMetersPerPixel(lengths, excludeAutoFromScale);
    if (!mpp) return null;
    return shoelaceArea(state.vertices) * mpp * mpp;
  }

  function countEmptyEdges() {
    return state.edges.filter((edge) => !edge.lengthText.trim()).length;
  }

  function canComputeFinalEdge() {
    if (!state.closed || state.edges.length < 3) return false;
    if (countEmptyEdges() !== 1) return false;
    syncEdgesFromDom();
    for (let i = 0; i < state.edges.length; i += 1) {
      const text = state.edges[i].lengthText.trim();
      if (!text) continue;
      const parsed = parseLength(text);
      if (parsed.error || parsed.empty) return false;
    }
    return true;
  }

  function updateComputeFinalEdgeButton() {
    if (!computeFinalEdgeBtn) return;
    const canCompute = canComputeFinalEdge();
    computeFinalEdgeBtn.disabled = !canCompute;
    computeFinalEdgeBtn.hidden = !state.closed || state.edges.length === 0;
    if (state.computeFinalEdge && state.autoEdgeIndex != null) {
      computeFinalEdgeBtn.textContent = "Recompute final edge";
    } else {
      computeFinalEdgeBtn.textContent = "Compute final edge";
    }
  }

  function computeFinalEdge() {
    if (!canComputeFinalEdge()) {
      setStatus("Enter all but one edge length, then compute the remaining edge.", true);
      return;
    }
    state.computeFinalEdge = true;
    refreshMeasurements();
    updateComputeFinalEdgeButton();
  }

  function invalidateComputedEdge() {
    if (!state.computeFinalEdge && state.autoEdgeIndex == null) return;
    state.computeFinalEdge = false;
    applyFitCore();
    updateEdgeRowsInPlace();
    draw();
    computeResults();
    updateOverallStatus();
    updateComputeFinalEdgeButton();
  }

  function refreshMeasurements() {
    applyFitCore();
    updateEdgeRowsInPlace();
    draw();
    computeResults();
    updateOverallStatus();
    updateComputeFinalEdgeButton();
  }

  function updateEdgeRowsInPlace() {
    if (!edgesBodyEl) return;
    state.edges.forEach((edge, index) => {
      const row = edgesBodyEl.rows[index];
      if (!row) return;
      const isAuto =
        state.autoEdgeIndex === index &&
        state.autoEdgeMeters != null &&
        !edge.lengthText.trim();
      const cell = row.querySelector(".photo-area-edge-length-cell");
      const input = row.querySelector("[data-edge-length]");
      if (!cell || !input) return;

      if (isAuto) {
        if (document.activeElement !== input) {
          input.value = formatLength(state.autoEdgeMeters);
        }
        input.readOnly = true;
        input.classList.add("photo-area-edge-length--auto");
        row.classList.add("is-auto-edge");
        if (!cell.querySelector(".photo-area-auto-badge")) {
          const badge = document.createElement("span");
          badge.className = "photo-area-auto-badge";
          badge.textContent = "Check";
          badge.title = "Computed sanity-check edge — verify against your field tape";
          cell.appendChild(badge);
        }
      } else {
        input.readOnly = false;
        input.classList.remove("photo-area-edge-length--auto");
        row.classList.remove("is-auto-edge");
        cell.querySelector(".photo-area-auto-badge")?.remove();
      }
    });
  }

  function applyFitCore() {
    state.autoEdgeIndex = null;
    state.autoEdgeMeters = null;
    state.closureGapMeters = null;
    state.averageMetersPerPixel = null;

    if (!state.closed || state.edges.length < 3) return null;

    syncEdgesFromDom();
    const resolved = resolveEdgeLengths();
    if (resolved.error) {
      setStatus(resolved.error, true);
      return resolved;
    }

    const { lengths, emptyIndices, autoIndex, autoMeters, closureGapMeters } = resolved;
    const knownCount = state.edges.length - emptyIndices.length;

    if (autoIndex != null) {
      state.autoEdgeIndex = autoIndex;
      state.autoEdgeMeters = autoMeters;
    }
    if (closureGapMeters != null) {
      state.closureGapMeters = closureGapMeters;
    }

    const canFitShape =
      (state.computeFinalEdge && autoIndex != null) ||
      (emptyIndices.length === 0 && knownCount === state.edges.length);

    const excludeAutoFromScale = autoIndex != null;
    state.averageMetersPerPixel = averageMetersPerPixel(lengths, excludeAutoFromScale);

    if (canFitShape) {
      const areaMeters = areaFromTrace(lengths, excludeAutoFromScale);
      if (areaMeters != null) {
        if (!state.areaManualOverride && areaInput) {
          areaInput.value = formatAreaValue(areaMeters);
        }
        if (!state.areaManualOverride) {
          state.areaSquareMeters = areaMeters;
        }
      }
    } else if (!state.areaManualOverride) {
      if (areaInput) areaInput.value = "";
      state.areaSquareMeters = null;
    }

    return resolved;
  }

  function formatVolume(cubicMeters) {
    if (!Number.isFinite(cubicMeters)) return "—";
    if (state.unitSystem === "metric") {
      return `${Number(cubicMeters.toFixed(4))} m³`;
    }
    return `${Number((cubicMeters / M3_PER_CU_FT).toFixed(4))} ft³`;
  }

  function unitHint() {
    if (state.unitSystem === "metric") return "Decimal meters";
    if (state.unitSystem === "imperial-ftin") return "e.g. 12'-6 1/2\"";
    return "Decimal feet";
  }

  function areaHint() {
    if (state.unitSystem === "metric") return "Decimal m²";
    return "Decimal ft²";
  }

  function canvasPoint(event) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = event.clientX ?? event.touches?.[0]?.clientX;
    const clientY = event.clientY ?? event.touches?.[0]?.clientY;
    if (clientX == null || clientY == null) return null;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function closeSnapThreshold() {
    if (!canvas) return CLOSE_SNAP_PX;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return CLOSE_SNAP_PX;
    return CLOSE_SNAP_PX * (canvas.width / rect.width);
  }

  function clearPendingPress() {
    const pending = state.pendingPress;
    if (!pending) return;
    clearTimeout(pending.timer);
    state.pendingPress = null;
  }

  function undoLastVertex() {
    if (state.closed || state.vertices.length === 0) return;
    clearPendingPress();
    state.vertices.pop();
    rebuildEdges();
    updateToolbar();
    draw();
    setStatus(
      state.vertices.length === 0
        ? isCoarsePointer
          ? "Press and hold on the photo to place the first corner."
          : "Click the photo to place the first corner."
        : "Last point removed."
    );
  }

  function tryAddVertex(point) {
    if (state.closed) return;

    if (
      state.vertices.length >= 3 &&
      distance(point, state.vertices[0]) <= closeSnapThreshold()
    ) {
      closePolygon();
      return;
    }

    state.vertices.push(point);
    rebuildEdges();
    updateToolbar();
    draw();
    setStatus(
      state.vertices.length < 3
        ? isCoarsePointer
          ? "Add more corners, or close the shape when ready."
          : "Add more corners, or close the shape when ready."
        : isCoarsePointer
          ? "Press and hold for more corners, or tap Close shape when done."
          : "Click the first point or use Close shape when the outline is complete."
    );
  }

  function usesTouchPlacement(event) {
    return isCoarsePointer && event.pointerType === "touch";
  }

  function edgeEndpointLabels(edgeIndex) {
    const n = state.vertices.length;
    const from = edgeIndex + 1;
    const to = ((edgeIndex + 1) % n) + 1;
    return { from, to };
  }

  function edgeGeometry(edgeIndex, verts = state.vertices) {
    const n = verts.length;
    const j = (edgeIndex + 1) % n;
    const a = verts[edgeIndex];
    const b = verts[j];
    const mid = {
      x: (a.x + b.x) * 0.5,
      y: (a.y + b.y) * 0.5,
    };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    const cx = verts.reduce((sum, v) => sum + v.x, 0) / n;
    const cy = verts.reduce((sum, v) => sum + v.y, 0) / n;
    if ((cx - mid.x) * nx + (cy - mid.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const offset = Math.max(12, canvas.width / 90);
    let angle = Math.atan2(dy, dx);
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
    return {
      a,
      b,
      mid,
      len,
      angle,
      labelPoint: {
        x: mid.x + nx * offset,
        y: mid.y + ny * offset,
      },
    };
  }

  function pointToSegmentDistance(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return distance(point, a);
    let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return distance(point, {
      x: a.x + t * dx,
      y: a.y + t * dy,
    });
  }

  function hitEdge(point) {
    if (!state.closed || state.edges.length === 0) return -1;
    const threshold = Math.max(14, canvas.width / 120);
    let bestIndex = -1;
    let bestDistance = threshold;
    state.edges.forEach((_edge, index) => {
      const { a, b } = edgeGeometry(index);
      const dist = pointToSegmentDistance(point, a, b);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function setHighlightedEdge(edgeIndex) {
    state.highlightedEdgeIndex = edgeIndex;
    draw();
    if (!edgesBodyEl) return;
    Array.from(edgesBodyEl.rows).forEach((row, index) => {
      row.classList.toggle("is-highlighted", index === edgeIndex);
    });
  }

  function rebuildEdges() {
    const previous = state.edges.slice();
    const n = state.vertices.length;
    state.edges = [];
    if (n < 2) return;

    const limit = state.closed ? n : n - 1;
    for (let i = 0; i < limit; i += 1) {
      const j = (i + 1) % n;
      const old = previous[i];
      state.edges.push({
        index: i,
        pixelLength: distance(state.vertices[i], state.vertices[j]),
        lengthText: old?.lengthText ?? "",
      });
    }
  }

  function syncEdgesFromDom() {
    if (!edgesBodyEl) return;
    state.edges.forEach((edge, rowIndex) => {
      const row = edgesBodyEl.rows[rowIndex];
      if (!row) return;
      const lengthInput = row.querySelector("[data-edge-length]");
      edge.lengthText = lengthInput?.value ?? "";
    });
  }

  function updateEdgePixelCells() {
    if (!edgesBodyEl) return;
    state.edges.forEach((edge, index) => {
      const cell = edgesBodyEl.rows[index]?.cells[1];
      if (cell) cell.textContent = `${edge.pixelLength.toFixed(1)} px`;
    });
  }

  function measuredEdgeCount() {
    return state.edges.filter((edge) => edge.lengthText.trim()).length;
  }

  function renderEdgesTable() {
    if (!edgesBodyEl) return;
    syncEdgesFromDom();
    applyFitCore();
    edgesBodyEl.innerHTML = "";

    if (!state.closed || state.edges.length === 0) {
      if (edgesPanelEl) edgesPanelEl.hidden = true;
      return;
    }

    if (edgesPanelEl) edgesPanelEl.hidden = false;

    state.edges.forEach((edge, index) => {
      const { from, to } = edgeEndpointLabels(index);
      const isAuto =
        state.autoEdgeIndex === index &&
        state.autoEdgeMeters != null &&
        !edge.lengthText.trim();
      const displayValue = isAuto
        ? formatLength(state.autoEdgeMeters)
        : edge.lengthText.replace(/"/g, "&quot;");
      const row = document.createElement("tr");
      row.dataset.edgeIndex = String(index);
      if (isAuto) row.classList.add("is-auto-edge");
      row.innerHTML = `
        <td class="photo-area-edge-id" data-label="Edge">
          <span class="photo-area-edge-badge">E${index + 1}</span>
          <span class="photo-area-edge-endpoints">${from}→${to}</span>
        </td>
        <td class="photo-area-edges-pixel" data-label="Photo (px)">${edge.pixelLength.toFixed(1)} px</td>
        <td class="photo-area-edge-length-cell" data-label="Measured length">
          <input type="text" class="photo-area-edge-length${isAuto ? " photo-area-edge-length--auto" : ""}" data-edge-length
                 inputmode="decimal" autocomplete="off" spellcheck="false"
                 placeholder="${unitHint()}" value="${displayValue}"
                 ${isAuto ? "readonly" : ""}
                 aria-label="Measured length for edge ${index + 1}${isAuto ? " (computed sanity-check edge)" : ""}">
          ${isAuto ? '<span class="photo-area-auto-badge" title="Computed sanity-check edge — verify against your field tape">Check</span>' : ""}
        </td>
      `;

      const lengthInput = row.querySelector("[data-edge-length]");

      lengthInput?.addEventListener("input", () => {
        if (lengthInput.readOnly) return;
        edge.lengthText = lengthInput.value;
        state.computeFinalEdge = false;
        refreshMeasurements();
      });

      lengthInput?.addEventListener("focus", () => {
        if (lengthInput.readOnly) lengthInput.blur();
      });

      row.addEventListener("mouseenter", () => setHighlightedEdge(index));
      row.addEventListener("mouseleave", () => setHighlightedEdge(null));
      row.addEventListener("focusin", () => setHighlightedEdge(index));
      row.addEventListener("focusout", (event) => {
        if (row.contains(event.relatedTarget)) return;
        setHighlightedEdge(null);
      });

      edgesBodyEl.appendChild(row);
    });

    updateEdgeRowsInPlace();
    draw();
    computeResults();
    updateOverallStatus();
    updateComputeFinalEdgeButton();
  }

  function updateOverallStatus() {
    if (state.exampleStatic) return;
    if (!state.closed) return;

    const filled = measuredEdgeCount();
    const total = state.edges.length;
    const hasArea = state.areaSquareMeters != null && state.areaSquareMeters > 0;

    if (state.closureGapMeters != null && state.closureGapMeters > CLOSURE_OVERLAY_MAX_METERS) {
      setStatus(
        `Measurements differ by about ${formatLength(state.closureGapMeters)} when walked around the shape — normal for field tape. Trace stays on the photo; leave one edge blank and use Compute final edge.`,
        true
      );
      return;
    }

    if (state.autoEdgeIndex != null && state.autoEdgeMeters != null) {
      const autoLabel = formatLength(state.autoEdgeMeters);
      if (hasArea) {
        setStatus(
          `E${state.autoEdgeIndex + 1} computed as ${autoLabel} (orange on photo) — compare against your field tape. Area uses your traced outline.`
        );
        return;
      }
      setStatus(
        `E${state.autoEdgeIndex + 1} computed as ${autoLabel} (orange on photo) — sanity-check against your field tape.`
      );
      return;
    }

    if (hasArea && state.volumeCubicMeters != null && state.volumeCubicMeters > 0) {
      setStatus(
        "Area and volume ready — depth preview is overlaid on your trace (fixed view, no pan). Send to the converters when you are done."
      );
      return;
    }
    if (hasArea) {
      setStatus("Surface area calculated from edge measurements. Add depth for volume.");
      return;
    }
    if (filled === 0) {
      setStatus("Enter all but one edge length, then click Compute final edge for the sanity check.");
      return;
    }
    if (filled < total - 1) {
      setStatus(`${filled} of ${total} edges entered — fill all but one, then click Compute final edge.`);
      return;
    }
    if (filled === total - 1 && !state.computeFinalEdge) {
      setStatus("All measured edges entered — click Compute final edge to calculate the remaining edge and area.");
      return;
    }
    if (filled === total) {
      setStatus("All edges entered manually — leave one blank and use Compute final edge for a sanity check.");
      return;
    }
    setStatus(`${filled} of ${total} edges entered — fill all but one, then click Compute final edge.`);
  }

  function computeResults() {
    if (state.areaManualOverride) {
      state.areaSquareMeters = null;
      const areaParsed = parseArea(areaInput?.value ?? "");
      if (areaParsed.error) {
        setStatus(areaParsed.error, true);
        updateResultDisplay();
        return;
      }
      if (!areaParsed.empty && areaParsed.squareMeters > 0) {
        state.areaSquareMeters = areaParsed.squareMeters;
      }
    }

    state.volumeCubicMeters = null;

    const depthParsed = parseLength(depthInput?.value ?? "");
    if (depthParsed.error) {
      setStatus(depthParsed.error, true);
      updateResultDisplay();
      return;
    }

    if (
      state.areaSquareMeters != null &&
      !depthParsed.empty &&
      depthParsed.meters > 0
    ) {
      state.volumeCubicMeters = state.areaSquareMeters * depthParsed.meters;
    }

    updateResultDisplay();
    updateOverallStatus();
  }

  function updateResultDisplay() {
    if (resultVolumeEl) {
      resultVolumeEl.textContent = formatVolume(state.volumeCubicMeters);
    }
    if (sendAreaBtn) {
      sendAreaBtn.disabled = !(state.areaSquareMeters != null && state.areaSquareMeters > 0);
    }
    if (sendVolumeBtn) {
      sendVolumeBtn.disabled = !(state.volumeCubicMeters != null && state.volumeCubicMeters > 0);
    }
  }

  function extrusionDepthMeters() {
    const depthParsed = parseLength(depthInput?.value ?? "");
    if (depthParsed.error || depthParsed.empty || depthParsed.meters <= 0) return null;
    return depthParsed.meters;
  }

  function extrusionMetersPerPixel() {
    if (state.averageMetersPerPixel && state.averageMetersPerPixel > 0) {
      return state.averageMetersPerPixel;
    }
    if (!state.closed || state.edges.length < 3) return null;
    syncEdgesFromDom();
    const resolved = resolveEdgeLengths();
    if (resolved.error || !resolved.lengths) return null;
    return averageMetersPerPixel(resolved.lengths, state.autoEdgeIndex != null);
  }

  /** Fixed oblique extrusion locked to the traced outline (visual preview, not perspective-correct 3D). */
  function drawDepthExtrusion(ctx, verts, depthMeters, metersPerPixel) {
    if (!depthMeters || depthMeters <= 0 || verts.length < 3) return;

    let depthPx =
      metersPerPixel && metersPerPixel > 0
        ? depthMeters / metersPerPixel
        : canvas.width * 0.025;
    const minPx = canvas.width * 0.012;
    const maxPx = canvas.width * 0.08;
    depthPx = Math.min(Math.max(depthPx, minPx), maxPx);

    const obliqueLen = Math.hypot(0.65, 0.75);
    const dx = (-0.65 / obliqueLen) * depthPx;
    const dy = (-0.75 / obliqueLen) * depthPx;

    const top = verts.map((v) => ({ x: v.x + dx, y: v.y + dy }));
    const n = verts.length;
    const wallStroke = Math.max(1, canvas.width / 550);

    const faceOrder = [];
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const cx = (verts[i].x + verts[j].x + top[i].x + top[j].x) * 0.25;
      const cy = (verts[i].y + verts[j].y + top[i].y + top[j].y) * 0.25;
      faceOrder.push({ i, j, sort: cx + cy });
    }
    faceOrder.sort((a, b) => b.sort - a.sort);

    for (const { i, j } of faceOrder) {
      ctx.beginPath();
      ctx.moveTo(verts[i].x, verts[i].y);
      ctx.lineTo(verts[j].x, verts[j].y);
      ctx.lineTo(top[j].x, top[j].y);
      ctx.lineTo(top[i].x, top[i].y);
      ctx.closePath();
      ctx.fillStyle = "rgba(52, 78, 45, 0.55)";
      ctx.fill();
      ctx.strokeStyle = "rgba(38, 58, 34, 0.7)";
      ctx.lineWidth = wallStroke;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    for (let i = 1; i < n; i += 1) {
      ctx.lineTo(top[i].x, top[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(107, 143, 88, 0.42)";
    ctx.fill();
    ctx.strokeStyle = "rgba(47, 74, 36, 0.85)";
    ctx.lineWidth = Math.max(1.5, canvas.width / 450);
    ctx.stroke();
  }

  function drawEdgeSegment(ctx, edgeIndex, style, verts = state.vertices) {
    const j = (edgeIndex + 1) % verts.length;
    ctx.beginPath();
    ctx.moveTo(verts[edgeIndex].x, verts[edgeIndex].y);
    ctx.lineTo(verts[j].x, verts[j].y);
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.lineWidth;
    if (style.dash) {
      ctx.setLineDash(style.dash);
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawEdgeLabels(ctx) {
    const fontSize = Math.max(11, canvas.width / 75);

    state.edges.forEach((edge, index) => {
      const { labelPoint, angle } = edgeGeometry(index, state.vertices);
      const isHighlighted =
        state.highlightedEdgeIndex == null || state.highlightedEdgeIndex === index;
      const isAuto = state.autoEdgeIndex === index && state.autoEdgeMeters != null;
      const hasMeasurement = Boolean(edge.lengthText.trim()) || isAuto;
      const label = isAuto ? `E${index + 1} · Check` : `E${index + 1}`;
      const subLabel = isAuto
        ? formatLength(state.autoEdgeMeters)
        : `${Math.round(edge.pixelLength)} px`;

      ctx.save();
      ctx.translate(labelPoint.x, labelPoint.y);
      ctx.rotate(angle);

      ctx.font = `bold ${fontSize}px Segoe UI, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const titleW = ctx.measureText(label).width;
      ctx.font = `${Math.max(9, fontSize * 0.78)}px Segoe UI, system-ui, sans-serif`;
      const subW = ctx.measureText(subLabel).width;
      const boxW = Math.max(titleW, subW) + fontSize * 0.9;
      const boxH = fontSize * (isAuto ? 2.05 : 1.85);
      const x = -boxW * 0.5;
      const y = -boxH * 0.5;

      ctx.fillStyle = isAuto
        ? "rgba(255, 248, 240, 0.98)"
        : isHighlighted
          ? "rgba(255, 255, 255, 0.96)"
          : "rgba(255, 255, 255, 0.82)";
      ctx.strokeStyle = isAuto
        ? "#c45a11"
        : hasMeasurement
          ? "#2f4a24"
          : isHighlighted
            ? "#2f4a24"
            : "rgba(82, 122, 66, 0.65)";
      ctx.lineWidth = Math.max(1.5, canvas.width / 600);
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(x, y, boxW, boxH, boxH * 0.3);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(x, y, boxW, boxH);
        ctx.strokeRect(x, y, boxW, boxH);
      }

      ctx.fillStyle = isAuto ? "#c45a11" : "#2f4a24";
      ctx.font = `bold ${fontSize}px Segoe UI, system-ui, sans-serif`;
      ctx.fillText(label, 0, -fontSize * 0.22);
      ctx.font = `${Math.max(9, fontSize * 0.78)}px Segoe UI, system-ui, sans-serif`;
      ctx.fillStyle = isAuto ? "#a04a0e" : "#527a42";
      ctx.fillText(subLabel, 0, fontSize * 0.48);
      ctx.restore();
    });
  }

  function draw() {
    if (!canvas || !state.image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);

    if (state.exampleStatic) return;

    const verts = state.vertices;
    if (verts.length === 0) return;

    const baseLineWidth = Math.max(2, canvas.width / 400);
    const depthMeters = extrusionDepthMeters();
    if (state.closed && verts.length >= 3 && depthMeters != null) {
      drawDepthExtrusion(ctx, verts, depthMeters, extrusionMetersPerPixel());
    }

    ctx.fillStyle = "rgba(107, 143, 88, 0.22)";

    if (state.closed && verts.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i += 1) {
        ctx.lineTo(verts[i].x, verts[i].y);
      }
      ctx.closePath();
      ctx.fill();

      for (let i = 0; i < verts.length; i += 1) {
        const highlighted = state.highlightedEdgeIndex === i;
        const dimmed = state.highlightedEdgeIndex != null && !highlighted;
        const isAuto = state.autoEdgeIndex === i && state.autoEdgeMeters != null;
        const measured =
          Boolean(state.edges[i]?.lengthText.trim()) || isAuto;
        drawEdgeSegment(ctx, i, {
          stroke: isAuto
            ? "#c45a11"
            : highlighted
              ? "#2f4a24"
              : measured
                ? "#3d6230"
                : dimmed
                  ? "rgba(82, 122, 66, 0.35)"
                  : "#527a42",
          lineWidth: isAuto ? baseLineWidth * 2.2 : highlighted ? baseLineWidth * 1.8 : baseLineWidth,
          dash: isAuto ? [12, 7] : undefined,
        });
      }

      drawEdgeLabels(ctx);
    } else if (verts.length >= 2) {
      ctx.lineWidth = baseLineWidth;
      ctx.strokeStyle = "#527a42";
      ctx.beginPath();
      ctx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i += 1) {
        ctx.lineTo(verts[i].x, verts[i].y);
      }
      ctx.stroke();
    }

    if (!state.closed && verts.length >= 1) {
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = "rgba(82, 122, 66, 0.55)";
      ctx.beginPath();
      ctx.moveTo(verts[verts.length - 1].x, verts[verts.length - 1].y);
      ctx.lineTo(verts[0].x, verts[0].y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const handleVerts = verts;
    handleVerts.forEach((point, index) => {
      const radius = Math.max(HANDLE_RADIUS, canvas.width / 80);
      ctx.beginPath();
      ctx.fillStyle = index === 0 && verts.length >= 3 && !state.closed ? "#ffffff" : "#527a42";
      ctx.strokeStyle = "#527a42";
      ctx.lineWidth = Math.max(2, canvas.width / 500);
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = index === 0 && verts.length >= 3 && !state.closed ? "#527a42" : "#ffffff";
      ctx.font = `bold ${Math.max(11, radius)}px Segoe UI, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), point.x, point.y);
    });
  }

  function hitVertex(point) {
    if (!canvas) return -1;
    const radius = Math.max(HANDLE_RADIUS, canvas.width / 80);
    for (let i = state.vertices.length - 1; i >= 0; i -= 1) {
      if (distance(point, state.vertices[i]) <= radius + 4) return i;
    }
    return -1;
  }

  function closePolygon() {
    if (state.vertices.length < 3) {
      setStatus("Place at least three corners before closing the shape.", true);
      return;
    }
    state.closed = true;
    rebuildEdges();
    renderEdgesTable();
    draw();
    updateToolbar();
    updateComputeFinalEdgeButton();
    setStatus("Enter field measurements for each edge in the table below.");
  }

  function updateToolbar() {
    const canUndo = state.vertices.length > 0 && !state.closed;
    if (undoBtn) undoBtn.disabled = !canUndo;
    if (undoFloatBtn) {
      undoFloatBtn.disabled = !canUndo;
      undoFloatBtn.hidden = !isCoarsePointer || state.exampleStatic || !canUndo;
    }
    if (closeBtn) closeBtn.disabled = state.closed || state.vertices.length < 3;
    if (clearBtn) clearBtn.disabled = !state.image;
    if (traceHintEl) traceHintEl.hidden = state.closed;
  }

  function resetPolygon() {
    state.vertices = [];
    state.closed = false;
    state.edges = [];
    state.areaSquareMeters = null;
    state.volumeCubicMeters = null;
    state.highlightedEdgeIndex = null;
    state.autoEdgeIndex = null;
    state.autoEdgeMeters = null;
    state.closureGapMeters = null;
    state.areaManualOverride = false;
    state.computeFinalEdge = false;
    if (edgesPanelEl) edgesPanelEl.hidden = true;
    if (edgesBodyEl) edgesBodyEl.innerHTML = "";
    updateResultDisplay();
    updateComputeFinalEdgeButton();
    updateToolbar();
    draw();
  }

  function loadImage(file, onReady) {
    if (!file) return;
    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);

    state.imageUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      state.image = img;
      if (canvas) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      if (onReady) {
        onReady();
      } else {
        state.exampleActive = false;
        state.exampleStatic = false;
        setExampleViewMode(false);
        resetPolygon();
        if (fileNameEl) fileNameEl.textContent = file.name;
        setStatus(
          isCoarsePointer
            ? "Press and hold on the photo to place corner points. Scroll with one finger to see the whole image."
            : "Click the photo to place corner points along the outline."
        );
      }
      if (workspaceEl) workspaceEl.hidden = false;
      draw();
    };
    img.onerror = () => {
      setStatus("Could not load that image.", true);
    };
    img.src = state.imageUrl;
  }

  function setExampleViewMode(isStatic) {
    workspaceEl?.classList.toggle("photo-area-workspace--static", isStatic);
    if (traceHintEl) traceHintEl.hidden = isStatic;
    canvasWrapEl?.classList.toggle("photo-area-canvas-wrap--static", isStatic);
    if (undoFloatBtn) undoFloatBtn.hidden = isStatic || !isCoarsePointer;
    if (edgesNoteEl) {
      edgesNoteEl.textContent = isStatic
        ? "Sample field measurements from the walkway example — upload your own photo to trace and measure."
        : DEFAULT_EDGES_NOTE;
    }
    resultsEl?.classList.toggle("photo-area-results--example", isStatic);
    if (areaInput) {
      areaInput.readOnly = isStatic;
      areaInput.classList.toggle("photo-area-edge-length--example", isStatic);
    }
    if (depthInput) {
      depthInput.readOnly = isStatic;
      depthInput.classList.toggle("photo-area-edge-length--example", isStatic);
    }
    if (edgesActionsEl) edgesActionsEl.hidden = isStatic;
    if (computeFinalEdgeBtn) {
      computeFinalEdgeBtn.hidden = isStatic;
      computeFinalEdgeBtn.disabled = isStatic;
    }
    if (!isStatic) {
      updateComputeFinalEdgeButton();
    }
  }

  function renderStaticExampleTable(example) {
    if (!edgesBodyEl || !edgesPanelEl) return;
    edgesPanelEl.hidden = false;
    edgesBodyEl.innerHTML = "";

    (example.edges || []).forEach((edge, index) => {
      const row = document.createElement("tr");
      row.classList.add("is-example-edge");
      if (edge.isCheck) row.classList.add("is-auto-edge");
      const safeValue = (edge.lengthText ?? "").replace(/"/g, "&quot;");
      row.innerHTML = `
        <td class="photo-area-edge-id" data-label="Edge">
          <span class="photo-area-edge-badge">E${index + 1}</span>
          <span class="photo-area-edge-endpoints">${edge.from}→${edge.to}</span>
        </td>
        <td class="photo-area-edges-pixel" data-label="Photo (px)">${Number(edge.pixelLength).toFixed(1)} px</td>
        <td class="photo-area-edge-length-cell" data-label="Measured length">
          <input type="text" class="photo-area-edge-length photo-area-edge-length--example${edge.isCheck ? " photo-area-edge-length--auto" : ""}"
                 value="${safeValue}" readonly tabindex="-1"
                 aria-label="Example measured length for edge ${index + 1}${edge.isCheck ? " (computed check edge)" : ""}">
          ${edge.isCheck ? '<span class="photo-area-auto-badge" title="Computed sanity-check edge in the example">Check</span>' : '<span class="photo-area-example-badge">Example</span>'}
        </td>
      `;
      edgesBodyEl.appendChild(row);
    });
  }

  function applyStaticExampleResults(example) {
    state.areaManualOverride = true;
    state.areaSquareMeters =
      example.areaSquareFeet != null ? example.areaSquareFeet * M2_PER_SQ_FT : null;
    state.volumeCubicMeters =
      example.volumeCubicFeet != null ? example.volumeCubicFeet * M3_PER_CU_FT : null;

    if (areaInput) {
      areaInput.value =
        example.areaSquareFeet != null ? String(example.areaSquareFeet) : "";
    }
    if (depthInput) {
      depthInput.value = example.depth ?? "";
    }

    updateResultDisplay();
  }

  function applyStaticExampleState(example) {
    setUnitSystem(example.unitSystem || "imperial");
    state.exampleStatic = true;
    state.vertices = [];
    state.closed = false;
    state.edges = [];
    state.highlightedEdgeIndex = null;
    state.computeFinalEdge = false;
    state.autoEdgeIndex = null;
    state.autoEdgeMeters = null;
    state.closureGapMeters = null;

    renderStaticExampleTable(example);
    applyStaticExampleResults(example);
    setExampleViewMode(true);
    updateToolbar();
    draw();
  }

  function applyExampleState(example) {
    if (example.static) {
      applyStaticExampleState(example.referenceSnapshot || example);
      return;
    }

    state.exampleStatic = false;
    setExampleViewMode(false);
    setUnitSystem(example.unitSystem || "imperial");
    const width = canvas?.width ?? state.image?.naturalWidth ?? 1;
    const height = canvas?.height ?? state.image?.naturalHeight ?? 1;

    state.vertices = (example.vertices || []).map((vertex) => ({
      x: vertex.x <= 1 ? vertex.x * width : vertex.x,
      y: vertex.y <= 1 ? vertex.y * height : vertex.y,
    }));
    state.closed = state.vertices.length >= 3;
    state.highlightedEdgeIndex = null;
    state.areaManualOverride = false;
    state.computeFinalEdge = false;
    state.autoEdgeIndex = null;
    state.autoEdgeMeters = null;
    state.closureGapMeters = null;
    state.areaSquareMeters = null;
    state.volumeCubicMeters = null;

    rebuildEdges();
    (example.edgeLengths || []).forEach((lengthText, index) => {
      if (state.edges[index]) {
        state.edges[index].lengthText = lengthText ?? "";
      }
    });

    if (areaInput) areaInput.value = "";
    if (depthInput) depthInput.value = example.depth ?? "";

    renderEdgesTable();
    updateToolbar();

    if (example.runComputeFinalEdge) {
      computeFinalEdge();
    } else {
      refreshMeasurements();
    }
  }

  async function loadExampleData({ auto = false } = {}) {
    if (!window.ExampleData?.getPhotoAreaExample) {
      setStatus("Example data module failed to load.", true);
      return;
    }

    reset();
    const example = window.ExampleData.getPhotoAreaExample();
    setStatus("Loading example photo…");

    try {
      const imageUrl = example.imageUrl.includes("?")
        ? `${example.imageUrl}&t=${Date.now()}`
        : `${example.imageUrl}?t=${Date.now()}`;
      const response = await fetch(imageUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load the example photo.");
      }
      const blob = await response.blob();
      const file = new File(
        [blob],
        example.imageFileName || "walkway-example.jpg",
        { type: blob.type || "image/jpeg" }
      );

      if (fileInput) fileInput.value = "";
      loadImage(file, () => {
        applyExampleState(example);
        state.exampleActive = true;
        if (fileNameEl) {
          fileNameEl.textContent = `Example: ${example.label}`;
        }
        setStatus(
          auto
            ? `Example loaded (${example.label}). Sample measurements are shown below — choose your photo to start a live trace.`
            : `Loaded example (${example.label}). Sample measurements are shown below — choose your photo to start a live trace.`
        );
      });
    } catch (error) {
      setStatus(error.message || "Could not load example data.", true);
    }
  }

  function onPointerDown(event) {
    if (!state.image || !canvas || state.exampleStatic) return;
    const point = canvasPoint(event);
    if (!point) return;

    const hit = hitVertex(point);
    if (hit >= 0) {
      event.preventDefault();
      clearPendingPress();
      if (hit === 0 && state.vertices.length >= 3 && !state.closed) {
        closePolygon();
        return;
      }
      state.dragIndex = hit;
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }

    if (state.closed) {
      event.preventDefault();
      const edgeHit = hitEdge(point);
      if (edgeHit >= 0) {
        setHighlightedEdge(edgeHit);
        edgesBodyEl?.rows[edgeHit]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        const lengthInput = edgesBodyEl?.rows[edgeHit]?.querySelector("[data-edge-length]");
        lengthInput?.focus();
      }
      return;
    }

    if (usesTouchPlacement(event)) {
      clearPendingPress();
      state.pendingPress = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        point,
        timer: window.setTimeout(() => {
          if (!state.pendingPress) return;
          state.pendingPress = null;
          tryAddVertex(point);
          navigator.vibrate?.(12);
        }, LONG_PRESS_MS),
      };
      return;
    }

    event.preventDefault();
    tryAddVertex(point);
  }

  function onPointerMove(event) {
    const pending = state.pendingPress;
    if (pending && event.pointerId === pending.pointerId) {
      const moved = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
      if (moved > PRESS_MOVE_CANCEL_PX) {
        clearPendingPress();
      }
      return;
    }

    if (state.dragIndex == null) return;
    event.preventDefault();
    const point = canvasPoint(event);
    if (!point) return;
    state.vertices[state.dragIndex] = point;
    rebuildEdges();
    draw();
    if (state.closed) {
      updateEdgePixelCells();
    }
  }

  function onPointerUp(event) {
    if (state.pendingPress?.pointerId === event.pointerId) {
      clearPendingPress();
    }

    if (state.dragIndex == null) return;
    state.dragIndex = null;
    canvas.releasePointerCapture?.(event.pointerId);
    if (state.closed) {
      rebuildEdges();
      renderEdgesTable();
    }
    draw();
  }

  function setUnitSystem(nextSystem) {
    if (nextSystem === state.unitSystem) return;
    state.unitSystem = nextSystem;
    unitTabs.forEach((tab) => {
      const active = tab.dataset.photoAreaUnits === state.unitSystem;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll("[data-photo-area-unit-hint]").forEach((el) => {
      el.textContent = unitHint();
    });
    document.querySelectorAll("[data-photo-area-area-hint]").forEach((el) => {
      el.textContent = areaHint();
    });
    renderEdgesTable();
  }

  function sendToArea() {
    if (state.areaSquareMeters == null) return;
    if (window.AreaConverter?.setFromSquareMeters) {
      window.AreaConverter.setFromSquareMeters(state.areaSquareMeters);
      document.getElementById("area-converter-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setStatus("Sent area to the Area Converter.");
    }
  }

  function sendToVolume() {
    if (state.volumeCubicMeters == null) return;
    if (window.VolumeConverter?.setFromCubicMeters) {
      window.VolumeConverter.setFromCubicMeters(state.volumeCubicMeters);
      document.getElementById("volume-converter-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setStatus("Sent volume to the Volume Converter.");
    }
  }

  function reset() {
    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
    state.image = null;
    state.imageUrl = "";
    state.exampleActive = false;
    state.exampleStatic = false;
    setExampleViewMode(false);
    resetPolygon();
    if (workspaceEl) workspaceEl.hidden = true;
    if (fileInput) fileInput.value = "";
    if (fileNameEl) fileNameEl.textContent = "No photo selected";
    if (areaInput) areaInput.value = "";
    if (depthInput) depthInput.value = "";
    state.areaManualOverride = false;
    setStatus("");
  }

  fileInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    loadImage(file);
  });

  undoBtn?.addEventListener("click", undoLastVertex);
  undoFloatBtn?.addEventListener("click", undoLastVertex);

  closeBtn?.addEventListener("click", closePolygon);

  clearBtn?.addEventListener("click", () => {
    resetPolygon();
    setStatus("Trace cleared — place corners again.");
  });

  canvas?.addEventListener("pointerdown", onPointerDown);
  canvas?.addEventListener("pointermove", onPointerMove);
  canvas?.addEventListener("pointerup", onPointerUp);
  canvas?.addEventListener("pointercancel", onPointerUp);

  areaInput?.addEventListener("input", () => {
    state.areaManualOverride = Boolean(areaInput.value.trim());
    computeResults();
    updateOverallStatus();
  });
  depthInput?.addEventListener("input", () => {
    computeResults();
    draw();
  });

  unitTabs.forEach((tab) => {
    tab.addEventListener("click", () => setUnitSystem(tab.dataset.photoAreaUnits));
  });

  computeFinalEdgeBtn?.addEventListener("click", computeFinalEdge);

  sendAreaBtn?.addEventListener("click", sendToArea);
  sendVolumeBtn?.addEventListener("click", sendToVolume);

  window.addEventListener("resize", draw);

  if (traceHintEl && isCoarsePointer) {
    traceHintEl.textContent =
      "Press and hold to place corners. Drag points to adjust. Scroll the photo with one finger. Use Undo on the photo if you miss. After closing, tap an edge to identify it in the table.";
  }

  updateToolbar();
  updateResultDisplay();
  updateComputeFinalEdgeButton();

  window.PhotoAreaTool = {
    reset,
    loadExample: loadExampleData,
    getAreaSquareMeters: () => state.areaSquareMeters,
  };
})();
