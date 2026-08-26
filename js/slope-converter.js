(function () {
  "use strict";

  const DEGREES_PER_RADIAN = 180 / Math.PI;
  const MAX_DEGREES = 89.999;

  const FIELDS = {
    percent: {
      inputId: "input-slope-percent",
      parse: parsePercent,
      format: (tangent) => formatDecimal(tangent * 100),
    },
    ratio: {
      inputId: "input-slope-ratio",
      parse: parseRatio,
      format: formatRatio,
    },
    degrees: {
      inputId: "input-slope-degrees",
      parse: parseDegrees,
      format: (tangent) => formatDecimal(Math.atan(tangent) * DEGREES_PER_RADIAN),
    },
  };

  let activeField = null;
  let isUpdating = false;
  let currentTangent = 0;

  const statusLine = document.getElementById("slope-status-line");
  const diagramWrap = document.getElementById("slope-diagram-wrap");
  const diagramSvg = document.getElementById("slope-diagram");

  let diagramDismissed = false;

  function escapeSvgText(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatDiagramDegrees(tangent) {
    const degrees = Math.atan(tangent) * DEGREES_PER_RADIAN;
    return `${formatDecimal(degrees, 4)}°`;
  }

  function formatDiagramRise(tangent) {
    const rise = Math.abs(tangent) * 100;
    if (rise < 1e-6) return "0";
    return formatDecimal(rise, Number.isInteger(rise) ? 0 : 2);
  }

  function renderSlopeDiagram(tangent) {
    if (!diagramSvg) return;

    const degrees = Math.atan(tangent) * DEGREES_PER_RADIAN;
    const downhill = tangent < -1e-9;
    const flat = Math.abs(tangent) < 1e-9;

    const vbW = 320;
    const headerH = 40;
    const sideLeft = 40;
    const sideRight = 54;
    const runBandH = 28;
    const footerH = 30;
    const drawRunMax = vbW - sideLeft - sideRight;
    const maxAbsRise = 72;

    let runLen = drawRunMax;
    let risePx = runLen * tangent;

    if (!flat && Math.abs(risePx) > maxAbsRise) {
      runLen = maxAbsRise / Math.abs(tangent);
      risePx = runLen * tangent;
    }

    const absRise = Math.abs(risePx);
    const ox = sideLeft;
    const xRun = ox + runLen;
    const oy = downhill ? headerH + runBandH : headerH + absRise + 10;
    const yEnd = oy - risePx;
    const vbH = downhill
      ? headerH + runBandH + absRise + footerH
      : headerH + absRise + 10 + footerH;

    const fillPoints = `${ox},${oy} ${xRun},${oy} ${xRun},${yEnd}`;
    const slopePath = `M ${ox} ${oy} L ${xRun} ${yEnd}`;
    const corner = 11;
    const rightAngle = downhill
      ? `${xRun},${oy} ${xRun - corner},${oy} ${xRun - corner},${oy + corner} ${xRun},${oy + corner}`
      : `${xRun},${oy} ${xRun - corner},${oy} ${xRun - corner},${oy - corner} ${xRun},${oy - corner}`;

    const arcRadius = 22;
    const arcStartX = ox + arcRadius;
    const arcStartY = oy;
    const arcEndX = ox + arcRadius * Math.cos((degrees * Math.PI) / 180);
    const arcEndY = oy - arcRadius * Math.sin((degrees * Math.PI) / 180);
    const sweep = degrees >= 0 ? 0 : 1;
    const angleArc =
      flat
        ? ""
        : `<path d="M ${arcStartX} ${arcStartY} A ${arcRadius} ${arcRadius} 0 0 ${sweep} ${arcEndX} ${arcEndY}" fill="none" stroke="var(--accent)" stroke-width="1.75"/>`;

    const runMidX = (ox + xRun) / 2;
    const vertMidY = (oy + yEnd) / 2;
    const riseLabel = flat ? "Rise" : downhill ? "Drop" : "Rise";
    const riseValue = formatDiagramRise(tangent);
    const percentValue = `${formatDecimal(tangent * 100, Math.abs(tangent * 100) < 10 ? 2 : 1)}%`;
    const ratioValue = formatRatio(tangent);
    const gradeValue = `${percentValue} · ${ratioValue}`;

    const runLabelY = downhill ? headerH + 11 : oy + 16;
    const runValueY = downhill ? headerH + 25 : oy + 30;
    const angleLabelX = downhill ? ox - 6 : ox + 6;
    const angleLabelY = downhill ? oy + 16 : oy - 10;
    const angleAnchor = downhill ? "end" : "start";
    const vertLabelX = Math.min(xRun + 12, vbW - 8);
    const vertLabelY = vertMidY - 1;

    diagramSvg.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
    diagramSvg.innerHTML = `
      <rect x="0" y="0" width="${vbW}" height="${headerH}" fill="var(--surface)" opacity="0.92"/>
      <text x="${vbW / 2}" y="14" text-anchor="middle" class="slope-diagram-label">Grade</text>
      <text x="${vbW / 2}" y="30" text-anchor="middle" class="slope-diagram-value">${escapeSvgText(gradeValue)}</text>
      <line x1="12" y1="${oy}" x2="${vbW - 12}" y2="${oy}" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="5 4"/>
      <polygon points="${fillPoints}" fill="rgba(107, 143, 88, 0.12)" stroke="none"/>
      <polyline points="${rightAngle}" fill="none" stroke="var(--accent-dim)" stroke-width="1.5"/>
      <path d="${slopePath}" fill="none" stroke="var(--accent-dim)" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="${xRun}" y1="${oy}" x2="${xRun}" y2="${yEnd}" stroke="var(--accent-dim)" stroke-width="1.75" stroke-dasharray="4 3"/>
      <line x1="${ox}" y1="${oy}" x2="${xRun}" y2="${oy}" stroke="var(--accent-dim)" stroke-width="1.75" stroke-dasharray="4 3"/>
      ${angleArc}
      <text x="${angleLabelX}" y="${angleLabelY}" text-anchor="${angleAnchor}" class="slope-diagram-angle">${escapeSvgText(formatDiagramDegrees(tangent))}</text>
      <text x="${runMidX}" y="${runLabelY}" text-anchor="middle" class="slope-diagram-label">Run</text>
      <text x="${runMidX}" y="${runValueY}" text-anchor="middle" class="slope-diagram-value">100</text>
      <text x="${vertLabelX}" y="${vertLabelY}" text-anchor="start" dominant-baseline="middle">
        <tspan class="slope-diagram-label" x="${vertLabelX}" dy="-7">${riseLabel}</tspan>
        <tspan class="slope-diagram-value" x="${vertLabelX}" dy="16">${escapeSvgText(riseValue)}</tspan>
      </text>
    `;

    diagramSvg.setAttribute(
      "aria-label",
      `Slope diagram: run 100, ${riseLabel.toLowerCase()} ${riseValue}, angle ${formatDiagramDegrees(tangent)}, grade ${gradeValue}`
    );
  }

  function hideDiagram() {
    if (!diagramWrap) return;
    diagramWrap.hidden = true;
    diagramWrap.open = false;
    diagramDismissed = false;
    if (diagramSvg) diagramSvg.innerHTML = "";
  }

  function showDiagram(tangent) {
    if (!diagramWrap) return;
    diagramWrap.hidden = false;
    if (!diagramDismissed) {
      diagramWrap.open = true;
    }
    renderSlopeDiagram(tangent);
  }

  if (diagramWrap) {
    diagramWrap.addEventListener("toggle", () => {
      if (!diagramWrap.open && Math.abs(currentTangent) > 1e-12) {
        diagramDismissed = true;
      }
    });
  }

  function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
      const temp = y;
      y = x % y;
      x = temp;
    }
    return x || 1;
  }

  function parseDecimalNumber(text) {
    const normalized = text.trim().replace(/,/g, "").replace(/%$/, "").replace(/°+$/, "");
    if (!normalized) return { empty: true };
    const value = Number(normalized);
    if (!Number.isFinite(value)) {
      return { error: "Enter a valid decimal number." };
    }
    return { value };
  }

  function tangentFromDegrees(degrees) {
    if (Math.abs(degrees) >= 90) {
      return { error: "Enter an angle between -90° and 90° (exclusive)." };
    }
    return { tangent: Math.tan((degrees * Math.PI) / 180) };
  }

  function parsePercent(text) {
    const parsed = parseDecimalNumber(text);
    if (parsed.empty) return { tangent: 0, empty: true };
    if (parsed.error) return parsed;
    return { tangent: parsed.value / 100 };
  }

  function parseDegrees(text) {
    const parsed = parseDecimalNumber(text);
    if (parsed.empty) return { tangent: 0, empty: true };
    if (parsed.error) return parsed;
    return tangentFromDegrees(parsed.value);
  }

  function parseRatio(text) {
    const trimmed = text.trim();
    if (!trimmed) return { tangent: 0, empty: true };

    const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*[:/]\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) {
      return { error: 'Enter a ratio like "4:12" or "1:48".' };
    }

    const rise = Number(match[1]);
    const run = Number(match[2]);
    if (!Number.isFinite(rise) || !Number.isFinite(run)) {
      return { error: "Enter a valid ratio." };
    }
    if (run === 0) {
      return { error: "Run must not be zero." };
    }

    return { tangent: rise / run };
  }

  function formatDecimal(value, maxDecimals = 8) {
    if (!Number.isFinite(value)) return "";
    return String(Number(value.toFixed(maxDecimals)));
  }

  function formatRatio(tangent) {
    if (!Number.isFinite(tangent)) return "";
    if (Math.abs(tangent) < 1e-12) return "0:1";

    for (let run = 1; run <= 100; run += 1) {
      const riseExact = tangent * run;
      const riseRounded = Math.round(riseExact * 1e6) / 1e6;
      const riseInt = Math.round(riseRounded);
      if (Math.abs(riseExact - riseInt) < 1e-4 && Math.abs(riseRounded - riseInt) < 1e-4) {
        const rise = riseInt;
        if (rise === 0) continue;
        if (run === 12) {
          return `${rise}:12`;
        }
        const divisor = gcd(rise, run);
        return `${rise / divisor}:${run / divisor}`;
      }
    }

    const rise12 = tangent * 12;
    const rise12Rounded = Math.round(rise12 * 1000) / 1000;
    if (Math.abs(rise12 - rise12Rounded) < 1e-4) {
      return `${formatDecimal(rise12Rounded)}:12`;
    }

    return `${formatDecimal(tangent, 6)}:1`;
  }

  function setStatus(message, isError = false) {
    if (!statusLine) return;
    statusLine.textContent = message;
    statusLine.hidden = !message;
    statusLine.classList.toggle("is-error", isError);
  }

  function labelFor(key) {
    const labels = {
      percent: "percent grade",
      ratio: "rise:run ratio",
      degrees: "degrees",
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
    document.querySelectorAll("#slope-converter-grid .measure-row").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.field === sourceKey);
    });

    if (!text.trim()) {
      row.classList.remove("has-error");
      isUpdating = true;
      currentTangent = 0;
      Object.entries(FIELDS).forEach(([key, cfg]) => {
        if (key === sourceKey) return;
        document.getElementById(cfg.inputId).value = "";
      });
      isUpdating = false;
      setStatus("");
      hideDiagram();
      return;
    }

    const parsed = field.parse(text);
    if (parsed.error) {
      row.classList.add("has-error");
      setStatus(parsed.error, true);
      hideDiagram();
      return;
    }

    const degrees = Math.atan(parsed.tangent) * DEGREES_PER_RADIAN;
    if (Math.abs(degrees) > MAX_DEGREES) {
      row.classList.add("has-error");
      setStatus("Slope is too steep to convert reliably. Use an angle under 90°.", true);
      hideDiagram();
      return;
    }

    row.classList.remove("has-error");
    currentTangent = parsed.tangent;

    isUpdating = true;
    Object.entries(FIELDS).forEach(([key, cfg]) => {
      if (key === sourceKey) return;
      const target = document.getElementById(cfg.inputId);
      target.value = cfg.format(currentTangent);
      target.closest(".measure-row").classList.remove("has-error");
    });
    isUpdating = false;

    setStatus(`Converted from ${labelFor(sourceKey)}.`);
    showDiagram(currentTangent);
  }

  Object.keys(FIELDS).forEach((key) => {
    const input = document.getElementById(FIELDS[key].inputId);
    if (!input) return;
    input.addEventListener("input", () => updateFromField(key));
    input.addEventListener("focus", () => {
      activeField = key;
      input.closest(".measure-row").classList.add("is-active");
    });
    input.addEventListener("blur", (e) => {
      if (!e.relatedTarget || !e.relatedTarget.closest("#slope-converter-grid .measure-row")) {
        document
          .querySelectorAll("#slope-converter-grid .measure-row")
          .forEach((el) => el.classList.remove("is-active"));
      }
    });
  });
})();
