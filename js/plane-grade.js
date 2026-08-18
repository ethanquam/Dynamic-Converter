import { createPlaneView3d } from "./plane-view3d.js";

if (!window.Units || !window.CsvImport) {
  console.error("units.js and csv-import.js must load before plane-grade.js");
} else {
  const { UNIT_CONFIG, parseCoord, formatUnitValue } = window.Units;
  const { parseTrimbleCsv, exportTrimbleCsv, downloadCsvFile } = window.CsvImport;

  const planeUnitsSelect = document.getElementById("plane-coord-units");
  const planeStatusLine = document.getElementById("plane-status-line");
  const csvFileInput = document.getElementById("csv-file-input");
  const csvFileName = document.getElementById("csv-file-name");
  const view3dContainer = document.getElementById("plane-view3d-container");
  const view3dPlaceholder = document.getElementById("view3d-placeholder");
  const assignmentPanel = document.getElementById("point-assignment-panel");
  const emptyPanel = document.getElementById("plane-grade-empty");
  const assignmentBody = document.getElementById("point-assignment-body");
  const adjustedResultsPanel = document.getElementById("adjusted-results-panel");
  const adjustedResultsList = document.getElementById("adjusted-results-list");
  const addPointBtn = document.getElementById("add-plane-point");
  const exportCsvBtn = document.getElementById("plane-export-csv");
  const loadExampleBtn = document.getElementById("plane-load-example");
  const clearDataBtn = document.getElementById("plane-clear-data");

  if (!view3dContainer || !assignmentBody) {
    console.error("Plane grade UI elements missing.");
  } else {
    let view3d;
    try {
      view3d = createPlaneView3d(view3dContainer, view3dPlaceholder, {
        panel: document.getElementById("plane-view3d-panel"),
        showMeasurementsInput: document.getElementById("plane-show-measurements"),
        zoomExtentsBtn: document.getElementById("plane-zoom-extents"),
        resetViewBtn: document.getElementById("reset-view3d"),
        fullscreenBtn: document.getElementById("plane-fullscreen"),
      });
    } catch (error) {
      console.error("Plane 3D view failed to initialize:", error);
      view3d = {
        update: () => {},
        resetCamera: () => {},
        setScaleFormatter: () => {},
      };
    }

    function syncView3dScale() {
      view3d.setScaleFormatter((meters) => formatUnitValue(meters, planeUnitsSelect.value));
    }

    syncView3dScale();
    let pointCounter = 0;
    let points = [];
    let lastExportPoints = [];

    function metersToExportRows(rows) {
      const unit = UNIT_CONFIG[planeUnitsSelect.value];
      return rows.map((row) => ({
        name: row.name,
        northing: Number(unit.fromMeters(row.n).toFixed(6)),
        easting: Number(unit.fromMeters(row.e).toFixed(6)),
        elevation: Number(unit.fromMeters(row.z).toFixed(6)),
        description: row.description ?? "",
      }));
    }

    function updateExportButton() {
      if (exportCsvBtn) {
        exportCsvBtn.disabled = lastExportPoints.length === 0;
      }
    }

    function exportAdjustedCsv() {
      try {
        const csv = exportTrimbleCsv(metersToExportRows(lastExportPoints));
        downloadCsvFile("horizontal-plane-adjusted.csv", csv);
        setPlaneStatus(
          `Exported ${lastExportPoints.length} adjusted point${lastExportPoints.length === 1 ? "" : "s"} to CSV.`
        );
      } catch (error) {
        setPlaneStatus(error.message || "Could not export CSV file.", true);
      }
    }

    function escapeHtml(text) {
      return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function formatCoordValue(value) {
      if (value === "" || value === null || value === undefined) return "";
      const num = Number(value);
      if (!Number.isFinite(num)) return "";
      return String(Number(num.toFixed(6)));
    }

    function nextPointId() {
      pointCounter += 1;
      return `pt-${pointCounter}`;
    }

    function setPlaneStatus(message, isError = false) {
      planeStatusLine.textContent = message;
      planeStatusLine.classList.toggle("is-error", isError);
    }

    function elevationOnPlane(n, e, p1, p2) {
      const dN = p2.n - p1.n;
      const dE = p2.e - p1.e;
      const lenSq = dN * dN + dE * dE;
      if (lenSq < 1e-12) return null;
      const t = ((n - p1.n) * dN + (e - p1.e) * dE) / lenSq;
      return p1.z + t * (p2.z - p1.z);
    }

    function readPointValues(point) {
      const unit = UNIT_CONFIG[planeUnitsSelect.value];
      const northing = parseCoord(String(point.northing));
      const easting = parseCoord(String(point.easting));
      const elevation = parseCoord(String(point.elevation));

      if (northing.error || easting.error || elevation.error) {
        return { error: true };
      }
      if (northing.empty || easting.empty || elevation.empty) {
        return { empty: true };
      }

      return {
        name: point.name || "Unnamed point",
        n: unit.toMeters(northing.value),
        e: unit.toMeters(easting.value),
        z: unit.toMeters(elevation.value),
      };
    }

    function syncPointFromRow(row) {
      const id = row.dataset.pointId;
      const point = points.find((p) => p.id === id);
      if (!point) return;

      const nameInput = row.querySelector('[data-field="name"]');
      const northingInput = row.querySelector('[data-field="northing"]');
      const eastingInput = row.querySelector('[data-field="easting"]');
      const elevationInput = row.querySelector('[data-field="elevation"]');
      const p1Input = row.querySelector('[data-field="p1"]');
      const p2Input = row.querySelector('[data-field="p2"]');
      const adjustInput = row.querySelector('[data-field="adjust"]');

      if (nameInput) point.name = nameInput.value.trim() || point.name;
      if (northingInput) point.northing = northingInput.value;
      if (eastingInput) point.easting = eastingInput.value;
      if (elevationInput) point.elevation = elevationInput.value;

      if (p1Input && p1Input.checked) {
        points.forEach((p) => {
          if (p.id !== point.id && p.role === "p1") p.role = "none";
        });
        point.role = "p1";
        point.adjust = false;
      } else if (p2Input && p2Input.checked) {
        points.forEach((p) => {
          if (p.id !== point.id && p.role === "p2") p.role = "none";
        });
        point.role = "p2";
        point.adjust = false;
      } else if (point.role === "p1" || point.role === "p2") {
        point.role = "none";
        point.adjust = adjustInput ? adjustInput.checked : false;
      } else {
        point.adjust = adjustInput ? adjustInput.checked : false;
      }
    }

    function createAssignmentRow(point) {
      const row = document.createElement("tr");
      row.dataset.pointId = point.id;
      if (point.source === "manual") row.classList.add("is-manual");

      const isPlanePoint = point.role === "p1" || point.role === "p2";
      const coordCell = (field, value) => {
        if (point.source === "manual") {
          return `<input type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
                    data-field="${field}" value="${escapeHtml(value)}" aria-label="${point.name} ${field}">`;
        }
        return `<span class="coord-readout">${escapeHtml(formatCoordValue(value))}</span>`;
      };

      row.innerHTML = `
        <td class="col-name" data-label="Point">
          ${
            point.source === "manual"
              ? `<input type="text" data-field="name" value="${escapeHtml(point.name)}" aria-label="Point name">`
              : `<span class="point-name-label">${escapeHtml(point.name)}</span>
                 ${point.pointCode ? `<span class="point-code-label">${escapeHtml(point.pointCode)}</span>` : ""}`
          }
        </td>
        <td data-label="Northing">${coordCell("northing", point.northing)}</td>
        <td data-label="Easting">${coordCell("easting", point.easting)}</td>
        <td data-label="Elevation">${coordCell("elevation", point.elevation)}</td>
        <td class="col-role" data-label="P1">
          <input type="radio" name="plane-role-p1" data-field="p1" aria-label="${escapeHtml(point.name)} as P1"
                 ${point.role === "p1" ? "checked" : ""}>
        </td>
        <td class="col-role" data-label="P2">
          <input type="radio" name="plane-role-p2" data-field="p2" aria-label="${escapeHtml(point.name)} as P2"
                 ${point.role === "p2" ? "checked" : ""}>
        </td>
        <td class="col-role" data-label="Adjust">
          <input type="checkbox" data-field="adjust" aria-label="Adjust ${escapeHtml(point.name)} to plane"
                 ${point.adjust ? "checked" : ""} ${isPlanePoint ? "disabled" : ""}>
        </td>
      `;

      if (point.source === "manual") {
        const removeCell = document.createElement("td");
        removeCell.className = "col-remove";
        removeCell.dataset.label = "";
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn-remove-point";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => {
          points = points.filter((p) => p.id !== point.id);
          renderAssignmentTable();
          updatePlaneGrade();
        });
        row.appendChild(removeCell);
        removeCell.appendChild(removeBtn);
      }

      row.querySelectorAll("input").forEach((input) => {
        input.addEventListener("change", () => {
          syncPointFromRow(row);
          renderAssignmentTable();
          updatePlaneGrade();
        });
        if (input.type === "text") {
          input.addEventListener("input", () => {
            syncPointFromRow(row);
            updatePlaneGrade();
          });
        }
      });

      return row;
    }

    function renderAssignmentTable() {
      assignmentBody.innerHTML = "";
      const hasPoints = points.length > 0;
      assignmentPanel.hidden = !hasPoints;
      if (emptyPanel) emptyPanel.hidden = hasPoints;

      points.forEach((point) => {
        assignmentBody.appendChild(createAssignmentRow(point));
      });

      const headerRow = assignmentPanel.querySelector("thead tr");
      const hasManual = points.some((p) => p.source === "manual");
      const existingRemoveHeader = headerRow.querySelector(".col-remove-header");
      if (hasManual && !existingRemoveHeader) {
        const th = document.createElement("th");
        th.scope = "col";
        th.className = "col-remove-header";
        th.textContent = "";
        headerRow.appendChild(th);
      } else if (!hasManual && existingRemoveHeader) {
        existingRemoveHeader.remove();
      }
    }

    function renderAdjustedResults(adjustedPoints, unitKey) {
      if (adjustedPoints.length === 0) {
        adjustedResultsPanel.hidden = true;
        adjustedResultsList.innerHTML = "";
        return;
      }

      adjustedResultsPanel.hidden = false;
      adjustedResultsList.innerHTML = adjustedPoints
        .map((pt) => {
          const delta = pt.zAdj - pt.zOrig;
          const sign = delta >= 0 ? "+" : "−";
          return `
            <div class="adjusted-result-item">
              <span class="adjusted-result-name">${escapeHtml(pt.name)}</span>
              <span class="adjusted-result-values">
                ${formatUnitValue(pt.zOrig, unitKey)} → ${formatUnitValue(pt.zAdj, unitKey)}
                <span class="elevation-delta">(${sign}${formatUnitValue(Math.abs(delta), unitKey)})</span>
              </span>
            </div>
          `;
        })
        .join("");
    }

    function updatePlaneGrade() {
      const unitKey = planeUnitsSelect.value;

      if (points.length === 0) {
        updateSceneView([], []);
        renderAdjustedResults([], unitKey);
        lastExportPoints = [];
        updateExportButton();
        setPlaneStatus("Import a CSV file or add manual points.");
        return;
      }

      points.forEach((point) => {
        const row = assignmentBody.querySelector(`[data-point-id="${point.id}"]`);
        if (row) syncPointFromRow(row);
      });

      const p1Point = points.find((p) => p.role === "p1");
      const p2Point = points.find((p) => p.role === "p2");

      if (!p1Point || !p2Point) {
        updateSceneView([], []);
        renderAdjustedResults([], unitKey);
        lastExportPoints = [];
        updateExportButton();
        setPlaneStatus("Select two points as P1 and P2 to define the grade plane.");
        return;
      }

      const p1 = readPointValues(p1Point);
      const p2 = readPointValues(p2Point);

      if (p1.error || p2.error) {
        lastExportPoints = [];
        updateExportButton();
        setPlaneStatus("Enter valid coordinates for the plane points.", true);
        return;
      }
      if (p1.empty || p2.empty) {
        lastExportPoints = [];
        updateExportButton();
        setPlaneStatus("Complete coordinates for both plane points.");
        return;
      }

      const dN = p2.n - p1.n;
      const dE = p2.e - p1.e;
      if (dN * dN + dE * dE < 1e-12) {
        lastExportPoints = [];
        updateExportButton();
        setPlaneStatus("Plane points must have different Northing/Easting locations.", true);
        updateSceneView([p1, p2], []);
        return;
      }

      const adjustedPoints = [];
      lastExportPoints = [];
      const adjustCandidates = points.filter((p) => p.adjust && p.role !== "p1" && p.role !== "p2");

      for (const point of adjustCandidates) {
        const data = readPointValues(point);
        if (data.empty || data.error) continue;

        const zAdj = elevationOnPlane(data.n, data.e, p1, p2);
        adjustedPoints.push({
          name: data.name,
          n: data.n,
          e: data.e,
          zOrig: data.z,
          zAdj,
        });
        lastExportPoints.push({
          name: data.name,
          n: data.n,
          e: data.e,
          z: zAdj,
          description: point.description || "",
        });
      }

      updateSceneView([{ ...p1, name: p1Point.name }, { ...p2, name: p2Point.name }], adjustedPoints);
      renderAdjustedResults(adjustedPoints, unitKey);
      updateExportButton();

      const unitName = UNIT_CONFIG[unitKey].name;
      const extra =
        adjustedPoints.length > 0
          ? ` · ${adjustedPoints.length} point${adjustedPoints.length === 1 ? "" : "s"} adjusted`
          : "";
      setPlaneStatus(
        `Grade plane: ${p1Point.name} → ${p2Point.name} (${unitName}, zero cross-slope).${extra}`
      );
    }

    function updateSceneView(planePoints, additionalPoints) {
      view3d.update({ planePoints, additionalPoints });
    }

    function clearAllData() {
      points = [];
      if (csvFileInput) csvFileInput.value = "";
      if (csvFileName) csvFileName.textContent = "No file selected";
      renderAssignmentTable();
      updatePlaneGrade();
      view3d.resetCamera();
    }

    function loadExampleData() {
      if (!window.ExampleData) {
        setPlaneStatus("Example data module failed to load.", true);
        return;
      }

      const example = window.ExampleData.getPlaneExample();
      points = example.points.map((point) => ({ ...point }));
      if (csvFileName) {
        csvFileName.textContent = `Example: ${example.label}`;
      }
      renderAssignmentTable();
      updatePlaneGrade();
      view3d.resetCamera();
      setPlaneStatus(
        `Loaded example (${example.label}). P1 and P2 define a 2% grade — ` +
          "four stations are checked and adjusted to the plane."
      );
    }

    function loadCsvData(parsed) {
      points = parsed.points.map((point) => ({ ...point }));
      renderAssignmentTable();
      updatePlaneGrade();
      view3d.resetCamera();

      let message = `Imported ${parsed.stats.imported} measured point${parsed.stats.imported === 1 ? "" : "s"}.`;
      if (parsed.stats.skippedControl > 0) {
        message += ` Ignored ${parsed.stats.skippedControl} control point${parsed.stats.skippedControl === 1 ? "" : "s"}.`;
      }
      if (parsed.stats.skippedInvalid > 0) {
        message += ` Skipped ${parsed.stats.skippedInvalid} invalid row${parsed.stats.skippedInvalid === 1 ? "" : "s"}.`;
      }
      message += " Choose P1, P2, and adjust points in the table.";
      setPlaneStatus(message);
    }

    function handleCsvFile(file) {
      if (!file) return;
      csvFileName.textContent = file.name;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = parseTrimbleCsv(String(reader.result || ""));
          loadCsvData(parsed);
        } catch (error) {
          setPlaneStatus(error.message || "Could not parse CSV file.", true);
        }
      };
      reader.onerror = () => setPlaneStatus("Could not read the selected file.", true);
      reader.readAsText(file);
    }

    function addManualPoint() {
      points.push({
        id: nextPointId(),
        name: `Manual Point ${points.filter((p) => p.source === "manual").length + 1}`,
        northing: "",
        easting: "",
        elevation: "",
        description: "",
        pointCode: "",
        role: "none",
        adjust: false,
        source: "manual",
      });
      renderAssignmentTable();
      updatePlaneGrade();
    }

    if (addPointBtn) {
      addPointBtn.addEventListener("click", addManualPoint);
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", exportAdjustedCsv);
    }

    planeUnitsSelect.addEventListener("change", () => {
      syncView3dScale();
      updatePlaneGrade();
    });

    if (loadExampleBtn) {
      loadExampleBtn.addEventListener("click", loadExampleData);
    }

    if (clearDataBtn) {
      clearDataBtn.addEventListener("click", clearAllData);
    }

    if (csvFileInput) {
      csvFileInput.addEventListener("change", (event) => {
        const file = event.target.files && event.target.files[0];
        handleCsvFile(file);
      });
    }

    renderAssignmentTable();
    updatePlaneGrade();
    updateExportButton();
  }
}
