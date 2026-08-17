(function () {
  "use strict";

  const METERS_PER_FOOT = 0.3048;
  const M2_PER_SQ_FT = METERS_PER_FOOT ** 2;
  const M3_PER_CU_FT = METERS_PER_FOOT ** 3;
  const HANDLE_RADIUS = 12;
  const CLOSE_SNAP_PX = 16;
  const SCALE_MISMATCH_WARN = 0.08;
  const MAX_KNOWN_EDGES = 2;

  const canvas = document.getElementById("photo-area-canvas");
  const canvasWrap = document.getElementById("photo-area-canvas-wrap");
  const fileInput = document.getElementById("photo-area-file-input");
  const fileNameEl = document.getElementById("photo-area-file-name");
  const workspaceEl = document.getElementById("photo-area-workspace");
  const edgesPanelEl = document.getElementById("photo-area-edges-panel");
  const edgesBodyEl = document.getElementById("photo-area-edges-body");
  const undoBtn = document.getElementById("photo-area-undo");
  const closeBtn = document.getElementById("photo-area-close-shape");
  const clearBtn = document.getElementById("photo-area-clear");
  const statusLine = document.getElementById("photo-area-status-line");
  const resultAreaEl = document.getElementById("photo-area-result-area");
  const resultVolumeEl = document.getElementById("photo-area-result-volume");
  const depthInput = document.getElementById("photo-area-depth");
  const sendAreaBtn = document.getElementById("photo-area-send-area");
  const sendVolumeBtn = document.getElementById("photo-area-send-volume");
  const unitTabs = document.querySelectorAll("[data-photo-area-units]");

  const state = {
    unitSystem: "imperial",
    image: null,
    imageUrl: "",
    vertices: [],
    closed: false,
    edges: [],
    dragIndex: null,
    areaSquareMeters: null,
    volumeCubicMeters: null,
    metersPerPixel: null,
  };

  function setStatus(message, isError = false) {
    if (!statusLine) return;
    statusLine.textContent = message;
    statusLine.hidden = !message;
    statusLine.classList.toggle("is-error", isError);
  }

  function parseLength(text) {
    const trimmed = text.trim();
    if (!trimmed) return { empty: true };
    const value = Number(trimmed.replace(/,/g, ""));
    if (!Number.isFinite(value) || value < 0) {
      return { error: "Enter a valid non-negative number." };
    }
    const meters = state.unitSystem === "metric" ? value : value * METERS_PER_FOOT;
    return { meters };
  }

  function formatLength(meters) {
    if (!Number.isFinite(meters)) return "—";
    const value = state.unitSystem === "metric" ? meters : meters / METERS_PER_FOOT;
    return `${Number(value.toFixed(4))} ${state.unitSystem === "metric" ? "m" : "ft"}`;
  }

  function formatArea(squareMeters) {
    if (!Number.isFinite(squareMeters)) return "—";
    if (state.unitSystem === "metric") {
      return `${Number(squareMeters.toFixed(4))} m²`;
    }
    return `${Number((squareMeters / M2_PER_SQ_FT).toFixed(4))} ft²`;
  }

  function formatVolume(cubicMeters) {
    if (!Number.isFinite(cubicMeters)) return "—";
    if (state.unitSystem === "metric") {
      return `${Number(cubicMeters.toFixed(4))} m³`;
    }
    return `${Number((cubicMeters / M3_PER_CU_FT).toFixed(4))} ft³`;
  }

  function unitHint() {
    return state.unitSystem === "metric" ? "Decimal meters" : "Decimal feet";
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

  function shoelaceArea(vertices) {
    if (vertices.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < vertices.length; i += 1) {
      const j = (i + 1) % vertices.length;
      sum += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
    }
    return Math.abs(sum) * 0.5;
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
        known: old?.known ?? false,
        lengthText: old?.lengthText ?? "",
      });
    }
  }

  function syncEdgesFromDom() {
    if (!edgesBodyEl) return;
    state.edges.forEach((edge, rowIndex) => {
      const row = edgesBodyEl.rows[rowIndex];
      if (!row) return;
      const knownInput = row.querySelector("[data-edge-known]");
      const lengthInput = row.querySelector("[data-edge-length]");
      edge.known = Boolean(knownInput?.checked);
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

  function renderEdgesTable() {
    if (!edgesBodyEl) return;
    syncEdgesFromDom();
    edgesBodyEl.innerHTML = "";

    if (!state.closed || state.edges.length === 0) {
      if (edgesPanelEl) edgesPanelEl.hidden = true;
      return;
    }

    if (edgesPanelEl) edgesPanelEl.hidden = false;

    state.edges.forEach((edge, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>Edge ${index + 1}</td>
        <td class="photo-area-edges-pixel">${edge.pixelLength.toFixed(1)} px</td>
        <td class="photo-area-edges-known">
          <label class="photo-area-known-label">
            <input type="checkbox" data-edge-known ${edge.known ? "checked" : ""}>
            <span>Known</span>
          </label>
        </td>
        <td>
          <input type="text" class="photo-area-edge-length" data-edge-length
                 inputmode="decimal" autocomplete="off" spellcheck="false"
                 placeholder="${unitHint()}" value="${edge.lengthText.replace(/"/g, "&quot;")}">
        </td>
        <td class="photo-area-edges-estimate" data-edge-estimate>—</td>
      `;

      const knownInput = row.querySelector("[data-edge-known]");
      const lengthInput = row.querySelector("[data-edge-length]");

      knownInput?.addEventListener("change", () => {
        const checkedCount = Array.from(
          edgesBodyEl.querySelectorAll("[data-edge-known]")
        ).filter((input) => input.checked).length;
        if (knownInput.checked && checkedCount > MAX_KNOWN_EDGES) {
          knownInput.checked = false;
          setStatus(`Mark at most ${MAX_KNOWN_EDGES} known edges for calibration.`, true);
          return;
        }
        edge.known = knownInput.checked;
        computeResults();
      });

      lengthInput?.addEventListener("input", () => {
        edge.lengthText = lengthInput.value;
        computeResults();
      });

      edgesBodyEl.appendChild(row);
    });

    computeResults();
  }

  function computeResults() {
    syncEdgesFromDom();

    state.areaSquareMeters = null;
    state.volumeCubicMeters = null;
    state.metersPerPixel = null;

    if (!state.closed || state.vertices.length < 3) {
      updateResultDisplay();
      return;
    }

    const areaPx = shoelaceArea(state.vertices);
    const knownEdges = state.edges
      .map((edge, index) => ({ edge, index }))
      .filter(({ edge }) => edge.known);

    if (knownEdges.length === 0) {
      setStatus("Mark one or two known edges and enter their real-world lengths.");
      updateEstimates(null);
      updateResultDisplay();
      return;
    }

    const scales = [];
    for (const { edge } of knownEdges) {
      const parsed = parseLength(edge.lengthText);
      if (parsed.error) {
        setStatus(parsed.error, true);
        updateResultDisplay();
        return;
      }
      if (parsed.empty || edge.pixelLength <= 0) {
        setStatus("Enter a length for each known edge.", true);
        updateResultDisplay();
        return;
      }
      scales.push({
        metersPerPixel: parsed.meters / edge.pixelLength,
        pixelLength: edge.pixelLength,
      });
    }

    let metersPerPixel;
    if (scales.length === 1) {
      metersPerPixel = scales[0].metersPerPixel;
    } else {
      const totalPixels = scales[0].pixelLength + scales[1].pixelLength;
      metersPerPixel =
        (scales[0].metersPerPixel * scales[0].pixelLength +
          scales[1].metersPerPixel * scales[1].pixelLength) /
        totalPixels;
      const diff = Math.abs(scales[0].metersPerPixel - scales[1].metersPerPixel);
      const avg = (scales[0].metersPerPixel + scales[1].metersPerPixel) * 0.5;
      if (avg > 0 && diff / avg > SCALE_MISMATCH_WARN) {
        setStatus(
          "The two known edges suggest different scales — check your trace or photo angle (perspective).",
          true
        );
      } else {
        setStatus("Area calculated from traced shape and known edge lengths.");
      }
    }

    if (scales.length === 1) {
      setStatus("Area calculated from traced shape and known edge length.");
    }

    state.metersPerPixel = metersPerPixel;
    state.areaSquareMeters = areaPx * metersPerPixel * metersPerPixel;

    const depthParsed = parseLength(depthInput?.value ?? "");
    if (!depthParsed.empty && !depthParsed.error && depthParsed.meters > 0) {
      state.volumeCubicMeters = state.areaSquareMeters * depthParsed.meters;
    }

    updateEstimates(metersPerPixel);
    updateResultDisplay();
  }

  function updateEstimates(metersPerPixel) {
    if (!edgesBodyEl) return;
    state.edges.forEach((edge, index) => {
      const cell = edgesBodyEl.rows[index]?.querySelector("[data-edge-estimate]");
      if (!cell) return;
      if (!metersPerPixel) {
        cell.textContent = "—";
        return;
      }
      const meters = edge.pixelLength * metersPerPixel;
      cell.textContent = formatLength(meters);
    });
  }

  function updateResultDisplay() {
    if (resultAreaEl) {
      resultAreaEl.textContent = formatArea(state.areaSquareMeters);
    }
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

  function draw() {
    if (!canvas || !state.image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);

    const verts = state.vertices;
    if (verts.length === 0) return;

    ctx.lineWidth = Math.max(2, canvas.width / 400);
    ctx.strokeStyle = "#527a42";
    ctx.fillStyle = "rgba(107, 143, 88, 0.22)";

    if (verts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i += 1) {
        ctx.lineTo(verts[i].x, verts[i].y);
      }
      if (state.closed) {
        ctx.closePath();
        ctx.fill();
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

    verts.forEach((point, index) => {
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
    setStatus("Shape closed — mark known edge lengths below.");
  }

  function updateToolbar() {
    if (undoBtn) undoBtn.disabled = state.vertices.length === 0 || state.closed;
    if (closeBtn) closeBtn.disabled = state.closed || state.vertices.length < 3;
    if (clearBtn) clearBtn.disabled = !state.image;
  }

  function resetPolygon() {
    state.vertices = [];
    state.closed = false;
    state.edges = [];
    state.areaSquareMeters = null;
    state.volumeCubicMeters = null;
    state.metersPerPixel = null;
    if (edgesPanelEl) edgesPanelEl.hidden = true;
    if (edgesBodyEl) edgesBodyEl.innerHTML = "";
    updateResultDisplay();
    updateToolbar();
    draw();
  }

  function loadImage(file) {
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
      resetPolygon();
      if (workspaceEl) workspaceEl.hidden = false;
      if (fileNameEl) fileNameEl.textContent = file.name;
      draw();
      setStatus("Tap or click the photo to place corner points along the outline.");
    };
    img.onerror = () => {
      setStatus("Could not load that image.", true);
    };
    img.src = state.imageUrl;
  }

  function onPointerDown(event) {
    if (!state.image || !canvas) return;
    event.preventDefault();
    const point = canvasPoint(event);
    if (!point) return;

    const hit = hitVertex(point);
    if (hit >= 0) {
      state.dragIndex = hit;
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }

    if (state.closed) return;

    if (
      state.vertices.length >= 3 &&
      distance(point, state.vertices[0]) <= CLOSE_SNAP_PX * (canvas.width / canvas.getBoundingClientRect().width)
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
        ? "Add more corners, or close the shape when ready."
        : "Click the first point or use Close shape when the outline is complete."
    );
  }

  function onPointerMove(event) {
    if (state.dragIndex == null) return;
    event.preventDefault();
    const point = canvasPoint(event);
    if (!point) return;
    state.vertices[state.dragIndex] = point;
    rebuildEdges();
    draw();
    if (state.closed) {
      updateEdgePixelCells();
      computeResults();
    }
  }

  function onPointerUp(event) {
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
    renderEdgesTable();
    computeResults();
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
    resetPolygon();
    if (workspaceEl) workspaceEl.hidden = true;
    if (fileInput) fileInput.value = "";
    if (fileNameEl) fileNameEl.textContent = "No photo selected";
    if (depthInput) depthInput.value = "";
    setStatus("");
  }

  fileInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    loadImage(file);
  });

  undoBtn?.addEventListener("click", () => {
    if (state.closed || state.vertices.length === 0) return;
    state.vertices.pop();
    rebuildEdges();
    updateToolbar();
    draw();
  });

  closeBtn?.addEventListener("click", closePolygon);

  clearBtn?.addEventListener("click", () => {
    resetPolygon();
    setStatus("Trace cleared — place corners again.");
  });

  canvas?.addEventListener("pointerdown", onPointerDown);
  canvas?.addEventListener("pointermove", onPointerMove);
  canvas?.addEventListener("pointerup", onPointerUp);
  canvas?.addEventListener("pointercancel", onPointerUp);

  depthInput?.addEventListener("input", computeResults);

  unitTabs.forEach((tab) => {
    tab.addEventListener("click", () => setUnitSystem(tab.dataset.photoAreaUnits));
  });

  sendAreaBtn?.addEventListener("click", sendToArea);
  sendVolumeBtn?.addEventListener("click", sendToVolume);

  window.addEventListener("resize", draw);

  updateToolbar();
  updateResultDisplay();

  window.PhotoAreaTool = {
    reset,
    getAreaSquareMeters: () => state.areaSquareMeters,
  };
})();
