(function (global) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const TAPE_HEIGHT = 96;
  const TAPE_TOP = 18;
  const TAPE_BOTTOM = 58;
  const CARPENTER_INCH_LABEL_Y = TAPE_BOTTOM + 12;
  const PADDING_X = 12;

  const TAPE_TYPES = {
    metric: {
      title: "Metric tape measure",
      unit: "m",
      visibleSpan: 1.12,
    },
    engineering: {
      title: "Engineering tape measure",
      unit: "ft",
      visibleSpan: 1.12,
    },
    carpenter: {
      title: "Carpenter's tape measure (1/16″)",
      unit: "ft",
      visibleSpan: 1.12,
    },
  };

  function el(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    }
    return node;
  }

  function textEl(content, x, y, size = 10, anchor = "middle", baseline = null) {
    const node = el("text", {
      x,
      y,
      "text-anchor": anchor,
      "font-size": size,
      fill: "#2a3328",
      "font-family": "system-ui, sans-serif",
    });
    if (baseline) {
      node.setAttribute("dominant-baseline", baseline);
    }
    node.textContent = content;
    return node;
  }

  function visibleRange(value, spanUnits) {
    const span = spanUnits;
    let start = value >= 1 ? Math.floor(value) : 0;
    let end = start + span;
    if (value > end - span * 0.08) {
      start = Math.max(0, Math.floor(value));
      end = start + span;
    }
    return { start, end, span: end - start };
  }

  function xPos(value, start, span, width) {
    return PADDING_X + ((value - start) / span) * (width - PADDING_X * 2);
  }

  function clearViewport(viewport) {
    viewport.innerHTML = "";
  }

  function renderSvg(viewport, drawFn) {
    const width = Math.max(viewport.clientWidth || 320, 280);
    const svg = el("svg", {
      class: "tape-measure-svg",
      viewBox: `0 0 ${width} ${TAPE_HEIGHT}`,
      width: "100%",
      height: `${TAPE_HEIGHT}`,
      role: "presentation",
    });

    svg.appendChild(
      el("rect", {
        x: 0,
        y: TAPE_TOP - 4,
        width,
        height: TAPE_BOTTOM - TAPE_TOP + 8,
        rx: 4,
        fill: "#f3e3a8",
        stroke: "#c8b36a",
        "stroke-width": 1,
      })
    );

    drawFn(svg, width);
    clearViewport(viewport);
    viewport.appendChild(svg);
  }

  function drawMarker(svg, x, width, label) {
    svg.appendChild(
      el("line", {
        x1: x,
        y1: TAPE_TOP - 2,
        x2: x,
        y2: TAPE_BOTTOM + 10,
        stroke: "#b83232",
        "stroke-width": 2.5,
        "stroke-linecap": "round",
      })
    );
    svg.appendChild(
      el("polygon", {
        points: `${x - 5},${TAPE_BOTTOM + 10} ${x + 5},${TAPE_BOTTOM + 10} ${x},${TAPE_BOTTOM + 18}`,
        fill: "#b83232",
      })
    );
    if (label) {
      svg.appendChild(textEl(label, Math.min(Math.max(x, 24), width - 24), TAPE_BOTTOM + 32, 10));
    }
  }

  function renderMetric(viewport, meters, label) {
    const { start, end, span } = visibleRange(meters, TAPE_TYPES.metric.visibleSpan);
    renderSvg(viewport, (svg, width) => {
      const cmStart = Math.floor(start * 100);
      const cmEnd = Math.ceil(end * 100);

      for (let cm = cmStart; cm <= cmEnd; cm += 1) {
        const value = cm / 100;
        const x = xPos(value, start, span, width);
        let tickTop = TAPE_TOP + 14;
        let stroke = "#6a7568";
        let strokeWidth = 1;

        if (cm % 100 === 0) {
          tickTop = TAPE_TOP;
          stroke = "#2a3328";
          strokeWidth = 1.5;
          if (value >= start - 1e-9) {
            svg.appendChild(textEl(String(Math.round(value)), x, TAPE_TOP - 6, 11));
          }
        } else if (cm % 10 === 0) {
          tickTop = TAPE_TOP + 6;
          stroke = "#3d4a40";
          strokeWidth = 1.2;
        }

        svg.appendChild(
          el("line", {
            x1: x,
            y1: tickTop,
            x2: x,
            y2: TAPE_BOTTOM,
            stroke,
            "stroke-width": strokeWidth,
          })
        );
      }

      drawMarker(svg, xPos(meters, start, span, width), width, label);
    });
  }

  function renderEngineering(viewport, feet, label) {
    const { start, end, span } = visibleRange(feet, TAPE_TYPES.engineering.visibleSpan);
    renderSvg(viewport, (svg, width) => {
      const stepStart = Math.floor(start * 100);
      const stepEnd = Math.ceil(end * 100);

      for (let i = stepStart; i <= stepEnd; i += 1) {
        const value = i / 100;
        const x = xPos(value, start, span, width);
        let tickTop = TAPE_TOP + 14;
        let stroke = "#6a7568";
        let strokeWidth = 1;

        if (i % 100 === 0) {
          tickTop = TAPE_TOP;
          stroke = "#2a3328";
          strokeWidth = 1.5;
          svg.appendChild(textEl(String(Math.round(value)), x, TAPE_TOP - 6, 11));
        } else if (i % 10 === 0) {
          tickTop = TAPE_TOP + 6;
          stroke = "#3d4a40";
          strokeWidth = 1.2;
        }

        svg.appendChild(
          el("line", {
            x1: x,
            y1: tickTop,
            x2: x,
            y2: TAPE_BOTTOM,
            stroke,
            "stroke-width": strokeWidth,
          })
        );
      }

      drawMarker(svg, xPos(feet, start, span, width), width, label);
    });
  }

  function renderCarpenter(viewport, feet, label) {
    const { start, end, span } = visibleRange(feet, TAPE_TYPES.carpenter.visibleSpan);
    renderSvg(viewport, (svg, width) => {
      const start16 = Math.floor(start * 12 * 16);
      const end16 = Math.ceil(end * 12 * 16);

      for (let n = start16; n <= end16; n += 1) {
        const inchValue = n / 16;
        const valueFeet = inchValue / 12;
        const x = xPos(valueFeet, start, span, width);
        let tickTop = TAPE_TOP + 18;
        let stroke = "#8a9488";
        let strokeWidth = 0.75;

        if (n % 192 === 0) {
          tickTop = TAPE_TOP;
          stroke = "#2a3328";
          strokeWidth = 1.5;
          const footNum = Math.round(inchValue / 12);
          svg.appendChild(textEl(`${footNum}'`, x, TAPE_TOP - 6, 11));
        } else if (n % 16 === 0) {
          tickTop = TAPE_TOP + 4;
          stroke = "#2a3328";
          strokeWidth = 1.2;
          const inchNum = Math.round(inchValue) % 12;
          if (inchNum > 0) {
            svg.appendChild(textEl(String(inchNum), x, CARPENTER_INCH_LABEL_Y, 9, "middle", "hanging"));
          }
        } else if (n % 8 === 0) {
          tickTop = TAPE_TOP + 8;
          stroke = "#4a564c";
          strokeWidth = 1;
        } else if (n % 4 === 0) {
          tickTop = TAPE_TOP + 11;
        } else if (n % 2 === 0) {
          tickTop = TAPE_TOP + 14;
        }

        svg.appendChild(
          el("line", {
            x1: x,
            y1: tickTop,
            x2: x,
            y2: TAPE_BOTTOM,
            stroke,
            "stroke-width": strokeWidth,
          })
        );
      }

      drawMarker(svg, xPos(feet, start, span, width), width, label);
    });
  }

  function wrapEl(id) {
    return document.querySelector(`[data-tape-wrap="${id}"]`);
  }

  function viewportEl(id) {
    return document.querySelector(`[data-tape-viewport="${id}"]`);
  }

  function renderPending(wrap) {
    const pending = wrap._pendingRender;
    if (!pending) return;
    const id = wrap.getAttribute("data-tape-wrap");
    const viewport = viewportEl(id);
    if (!viewport) return;
    pending.renderFn(viewport, pending.value, pending.label);
  }

  function initExpandableTapes() {
    document.querySelectorAll("[data-tape-wrap]").forEach((wrap) => {
      wrap.addEventListener("toggle", () => {
        if (wrap.open) renderPending(wrap);
      });
    });
  }

  function rerenderOpenTapes() {
    document.querySelectorAll("[data-tape-wrap]").forEach((wrap) => {
      if (wrap.open && wrap._pendingRender) renderPending(wrap);
    });
  }

  function initViewportObservers() {
    if (typeof ResizeObserver === "undefined") return;

    let resizeTimer = null;
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(rerenderOpenTapes, 80);
    });

    document.querySelectorAll("[data-tape-viewport]").forEach((viewport) => {
      observer.observe(viewport);
    });
  }

  function update(id, type, value, label) {
    const wrap = wrapEl(id);
    const viewport = viewportEl(id);
    if (!wrap || !viewport) return;

    if (!Number.isFinite(value) || Math.abs(value) < 1e-12) {
      wrap.hidden = true;
      wrap.setAttribute("aria-hidden", "true");
      wrap._pendingRender = null;
      clearViewport(viewport);
      return;
    }

    wrap.hidden = false;
    wrap.setAttribute("aria-hidden", "false");
    const summary = wrap.querySelector(".tape-measure-summary");
    if (summary) summary.textContent = TAPE_TYPES[type].title;

    const renderFn =
      type === "metric"
        ? renderMetric
        : type === "carpenter"
          ? renderCarpenter
          : renderEngineering;

    wrap._pendingRender = { renderFn, value, label };

    if (wrap.open) {
      renderFn(viewport, value, label);
    } else {
      clearViewport(viewport);
    }
  }

  function updateAllFromMeters(meters, formatters) {
    update("meters", "metric", formatters.meters, formatters.metersLabel);
    update("surveyFeet", "engineering", formatters.surveyFeet, formatters.surveyFeetLabel);
    update("intlFeet", "engineering", formatters.intlFeet, formatters.intlFeetLabel);
    update("ftInFraction", "carpenter", formatters.intlFeet, formatters.ftInLabel);
  }

  function hideAll() {
    ["meters", "surveyFeet", "intlFeet", "ftInFraction"].forEach((id) => {
      const wrap = wrapEl(id);
      const viewport = viewportEl(id);
      if (wrap) {
        wrap.hidden = true;
        wrap.setAttribute("aria-hidden", "true");
        wrap._pendingRender = null;
      }
      if (viewport) clearViewport(viewport);
    });
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (global.TapeMeasure._lastPayload) {
        updateAllFromMeters(global.TapeMeasure._lastPayload.meters, global.TapeMeasure._lastPayload.formatters);
      }
    }, 120);
  });

  initExpandableTapes();
  initViewportObservers();

  global.TapeMeasure = {
    update,
    updateAllFromMeters(payloadMeters, formatters) {
      global.TapeMeasure._lastPayload = { meters: payloadMeters, formatters };
      updateAllFromMeters(payloadMeters, formatters);
    },
    hideAll,
  };
})(window);
