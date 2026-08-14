import { createDistanceView3d } from "./distance-view3d.js";
import { projectOntoVerticalPlane, computePointDistances } from "./vertical-plane.js";

if (!window.Units || !window.CsvImport) {
  console.error("units.js and csv-import.js must load before point-distance.js");
} else {
  const { UNIT_CONFIG, parseCoord, formatUnitValue } = window.Units;
  const { parseTrimbleCsv, exportTrimbleCsv, downloadCsvFile } = window.CsvImport;

  const coordUnitsSelect = document.getElementById("coord-units");
  const pointStatusLine = document.getElementById("point-status-line");
  const useVerticalPlane = document.getElementById("use-vertical-plane");
  const verticalPlaneHint = document.getElementById("vertical-plane-hint");
  const correctedResults = document.getElementById("corrected-distance-results");
  const crossTrackPanel = document.getElementById("cross-track-panel");
  const view3dContainer = document.getElementById("distance-view3d-container");
  const view3dPlaceholder = document.getElementById("distance-view3d-placeholder");
  const csvFileInput = document.getElementById("distance-csv-file-input");
  const csvFileName = document.getElementById("distance-csv-file-name");
  const assignmentPanel = document.getElementById("distance-assignment-panel");
  const assignmentBody = document.getElementById("distance-assignment-body");
  const addPointBtn = document.getElementById("add-distance-point");
  const exportCsvBtn = document.getElementById("distance-export-csv");
  const loadExampleBtn = document.getElementById("distance-load-example");
  const clearDataBtn = document.getElementById("distance-clear-data");

  const distHorizontal = document.getElementById("dist-horizontal");
  const distVertical = document.getElementById("dist-vertical");
  const distSlope = document.getElementById("dist-slope");
  const distHorizontalPlane = document.getElementById("dist-horizontal-plane");
  const distVerticalPlane = document.getElementById("dist-vertical-plane");
  const distSlopePlane = document.getElementById("dist-slope-plane");
  const crossTrackP1 = document.getElementById("cross-track-p1");
  const crossTrackP2 = document.getElementById("cross-track-p2");

  if (!assignmentBody || !view3dContainer) {
    console.error("Point distance UI elements missing.");
  } else {
    const view3d = createDistanceView3d(view3dContainer, view3dPlaceholder, {
      panel: document.getElementById("distance-view3d-panel"),
      showMeasurementsInput: document.getElementById("distance-show-measurements"),
      zoomExtentsBtn: document.getElementById("distance-zoom-extents"),
      resetViewBtn: document.getElementById("reset-distance-view3d"),
      fullscreenBtn: document.getElementById("distance-fullscreen"),
    });

    function syncView3dScale() {
      view3d.setScaleFormatter((meters) => formatUnitValue(meters, coordUnitsSelect.value));
    }

    syncView3dScale();
    let pointCounter = 0;
    let points = [];
    let lastExportPoints = [];

    function metersToExportRows(rows) {
      const unit = UNIT_CONFIG[coordUnitsSelect.value];
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

    function exportOnPlaneCsv() {
      try {
        const csv = exportTrimbleCsv(metersToExportRows(lastExportPoints));
        downloadCsvFile("on-plane-points.csv", csv);
        setPointStatus(
          `Exported ${lastExportPoints.length} on-plane point${lastExportPoints.length === 1 ? "" : "s"} to CSV.`
        );
      } catch (error) {
        setPointStatus(error.message || "Could not export CSV file.", true);
      }
    }

    const ROLE_FIELDS = [
      { field: "m1", role: "m1", group: "distance-role-m1", label: "Pt 1" },
      { field: "m2", role: "m2", group: "distance-role-m2", label: "Pt 2" },
      { field: "r1", role: "r1", group: "distance-role-r1", label: "Ref 1", refOnly: true },
      { field: "r2", role: "r2", group: "distance-role-r2", label: "Ref 2", refOnly: true },
    ];

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
      return `dist-pt-${pointCounter}`;
    }

    function formatDistance(meters, unitKey) {
      return formatUnitValue(meters, unitKey);
    }

    function formatSignedVertical(meters, unitKey) {
      const value = formatUnitValue(Math.abs(meters), unitKey);
      const direction = meters >= 0 ? "rise" : "fall";
      return `${value} (${direction})`;
    }

    function buildMeasurementLabels(raw, unitKey) {
      return {
        horizontal: formatDistance(raw.horizontal, unitKey),
        vertical: formatSignedVertical(raw.dZ, unitKey),
        slope: formatDistance(raw.slope, unitKey),
      };
    }

    function setPointStatus(message, isError = false) {
      pointStatusLine.textContent = message;
      pointStatusLine.classList.toggle("is-error", isError);
    }

    function clearResults() {
      distHorizontal.textContent = "—";
      distVertical.textContent = "—";
      distSlope.textContent = "—";
      distHorizontalPlane.textContent = "—";
      distVerticalPlane.textContent = "—";
      distSlopePlane.textContent = "—";
      crossTrackP1.textContent = "—";
      crossTrackP2.textContent = "—";
      correctedResults.hidden = true;
      crossTrackPanel.hidden = true;
      lastExportPoints = [];
      updateExportButton();
      view3d.update({ measurePoints: [] });
    }

    function readPointValues(point) {
      const unit = UNIT_CONFIG[coordUnitsSelect.value];
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

    function assignRole(point, role) {
      points.forEach((p) => {
        if (p.id !== point.id && p.role === role) p.role = "none";
      });
      point.role = role;
    }

    function syncPointFromRow(row) {
      const id = row.dataset.pointId;
      const point = points.find((p) => p.id === id);
      if (!point) return;

      const nameInput = row.querySelector('[data-field="name"]');
      const northingInput = row.querySelector('[data-field="northing"]');
      const eastingInput = row.querySelector('[data-field="easting"]');
      const elevationInput = row.querySelector('[data-field="elevation"]');

      if (nameInput) point.name = nameInput.value.trim() || point.name;
      if (northingInput) point.northing = northingInput.value;
      if (eastingInput) point.easting = eastingInput.value;
      if (elevationInput) point.elevation = elevationInput.value;

      for (const { field, role } of ROLE_FIELDS) {
        const input = row.querySelector(`[data-field="${field}"]`);
        if (input && input.checked) {
          assignRole(point, role);
          return;
        }
      }
    }

    function suggestDistanceRoles() {
      const planeOn = useVerticalPlane.checked;

      if (!points.some((p) => p.role === "m1") && points[0]) points[0].role = "m1";
      if (!points.some((p) => p.role === "m2") && points[1]) points[1].role = "m2";

      if (planeOn) {
        if (!points.some((p) => p.role === "r1")) {
          const next = points.find((p) => p.role === "none");
          if (next) next.role = "r1";
        }
        if (!points.some((p) => p.role === "r2")) {
          const next = points.find((p) => p.role === "none");
          if (next) next.role = "r2";
        }
      }
    }

    function createAssignmentRow(point) {
      const row = document.createElement("tr");
      row.dataset.pointId = point.id;
      if (point.source === "manual") row.classList.add("is-manual");

      const planeOn = useVerticalPlane.checked;
      const coordCell = (field, value) => {
        if (point.source === "manual") {
          return `<input type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
                    data-field="${field}" value="${escapeHtml(value)}" aria-label="${point.name} ${field}">`;
        }
        return `<span class="coord-readout">${escapeHtml(formatCoordValue(value))}</span>`;
      };

      const roleCells = ROLE_FIELDS.filter(({ refOnly }) => !refOnly || planeOn)
        .map(
          ({ field, role, group, label, refOnly }) => `
          <td class="col-role${refOnly ? " col-ref-role" : ""}" data-label="${label}">
            <input type="radio" name="${group}" data-field="${field}"
                   aria-label="${escapeHtml(point.name)} as ${label}"
                   ${point.role === role ? "checked" : ""}>
          </td>`
        )
        .join("");

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
        ${roleCells}
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
          calculateDistances();
        });
        row.appendChild(removeCell);
        removeCell.appendChild(removeBtn);
      }

      row.querySelectorAll("input").forEach((input) => {
        input.addEventListener("change", () => {
          syncPointFromRow(row);
          renderAssignmentTable();
          calculateDistances();
        });
        if (input.type === "text") {
          input.addEventListener("input", () => {
            syncPointFromRow(row);
            calculateDistances();
          });
        }
      });

      return row;
    }

    function renderAssignmentTable() {
      assignmentBody.innerHTML = "";
      assignmentPanel.hidden = points.length === 0;

      const planeOn = useVerticalPlane.checked;
      assignmentPanel.querySelectorAll(".col-ref-role").forEach((el) => {
        el.hidden = !planeOn;
      });

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

    function calculateDistances() {
      const unitKey = coordUnitsSelect.value;
      const planeOn = useVerticalPlane.checked;

      if (verticalPlaneHint) verticalPlaneHint.hidden = !planeOn;

      if (points.length === 0) {
        clearResults();
        setPointStatus("Import a CSV file or add manual points.");
        return;
      }

      points.forEach((point) => {
        const row = assignmentBody.querySelector(`[data-point-id="${point.id}"]`);
        if (row) syncPointFromRow(row);
      });

      if (!planeOn) {
        points.forEach((p) => {
          if (p.role === "r1" || p.role === "r2") p.role = "none";
        });
      }

      const m1Point = points.find((p) => p.role === "m1");
      const m2Point = points.find((p) => p.role === "m2");

      if (!m1Point || !m2Point) {
        clearResults();
        setPointStatus("Select two points as Pt 1 and Pt 2 to calculate distance.");
        return;
      }

      const m1 = readPointValues(m1Point);
      const m2 = readPointValues(m2Point);

      if (m1.error || m2.error) {
        clearResults();
        setPointStatus("Enter valid coordinates for both measure points.", true);
        return;
      }

      if (m1.empty || m2.empty) {
        clearResults();
        setPointStatus("Complete coordinates for both measure points.");
        return;
      }

      const p1 = { name: m1Point.name, n: m1.n, e: m1.e, z: m1.z };
      const p2 = { name: m2Point.name, n: m2.n, e: m2.e, z: m2.z };

      const raw = computePointDistances(p1, p2);
      distHorizontal.textContent = formatDistance(raw.horizontal, unitKey);
      distVertical.textContent = formatSignedVertical(raw.dZ, unitKey);
      distSlope.textContent = formatDistance(raw.slope, unitKey);

      if (!planeOn) {
        correctedResults.hidden = true;
        crossTrackPanel.hidden = true;
        lastExportPoints = [];
        updateExportButton();
        view3d.update({
          measurePoints: [p1, p2],
          planeEnabled: false,
          measurements: { direct: buildMeasurementLabels(raw, unitKey) },
        });
        setPointStatus(`Direct distances calculated in ${UNIT_CONFIG[unitKey].name}.`);
        return;
      }

      const r1Point = points.find((p) => p.role === "r1");
      const r2Point = points.find((p) => p.role === "r2");

      if (!r1Point || !r2Point) {
        correctedResults.hidden = true;
        crossTrackPanel.hidden = true;
        lastExportPoints = [];
        updateExportButton();
        view3d.update({
          measurePoints: [p1, p2],
          planeEnabled: false,
          measurements: { direct: buildMeasurementLabels(raw, unitKey) },
        });
        setPointStatus("Select Ref 1 and Ref 2 in the table for plane correction, or disable the option.");
        return;
      }

      const r1 = readPointValues(r1Point);
      const r2 = readPointValues(r2Point);

      if (r1.error || r2.error) {
        clearResults();
        setPointStatus("Enter valid coordinates for reference plane points.", true);
        return;
      }

      if (r1.empty || r2.empty) {
        correctedResults.hidden = true;
        crossTrackPanel.hidden = true;
        lastExportPoints = [];
        updateExportButton();
        view3d.update({
          measurePoints: [p1, p2],
          planeEnabled: false,
          measurements: { direct: buildMeasurementLabels(raw, unitKey) },
        });
        setPointStatus("Complete coordinates for both reference points.");
        return;
      }

      const ref1 = { name: r1Point.name, n: r1.n, e: r1.e, z: r1.z };
      const ref2 = { name: r2Point.name, n: r2.n, e: r2.e, z: r2.z };

      const proj1 = projectOntoVerticalPlane(p1, ref1, ref2);
      const proj2 = projectOntoVerticalPlane(p2, ref1, ref2);

      if (proj1.error || proj2.error) {
        setPointStatus(proj1.error || proj2.error, true);
        return;
      }

      const pp1 = { name: m1Point.name, n: proj1.n, e: proj1.e, z: proj1.z };
      const pp2 = { name: m2Point.name, n: proj2.n, e: proj2.e, z: proj2.z };
      const onPlane = computePointDistances(pp1, pp2);

      lastExportPoints = [
        {
          name: m1Point.name,
          n: pp1.n,
          e: pp1.e,
          z: pp1.z,
          description: m1Point.description || "",
        },
        {
          name: m2Point.name,
          n: pp2.n,
          e: pp2.e,
          z: pp2.z,
          description: m2Point.description || "",
        },
      ];
      updateExportButton();

      correctedResults.hidden = false;
      crossTrackPanel.hidden = false;
      distHorizontalPlane.textContent = formatDistance(onPlane.horizontal, unitKey);
      distVerticalPlane.textContent = formatSignedVertical(onPlane.dZ, unitKey);
      distSlopePlane.textContent = formatDistance(onPlane.slope, unitKey);
      crossTrackP1.textContent = formatDistance(Math.abs(proj1.crossTrack), unitKey);
      crossTrackP2.textContent = formatDistance(Math.abs(proj2.crossTrack), unitKey);

      view3d.update({
        measurePoints: [p1, p2],
        planeEnabled: true,
        refPoints: [ref1, ref2],
        projectedPoints: [pp1, pp2],
        measurements: {
          direct: buildMeasurementLabels(raw, unitKey),
          onPlane: buildMeasurementLabels(onPlane, unitKey),
        },
      });

      setPointStatus(
        `Direct and on-plane distances in ${UNIT_CONFIG[unitKey].name}. Cross-track offsets shown below.`
      );
    }

    function clearAllData() {
      points = [];
      if (csvFileInput) csvFileInput.value = "";
      if (csvFileName) csvFileName.textContent = "No file selected";
      renderAssignmentTable();
      calculateDistances();
      view3d.resetCamera();
    }

    function loadExampleData() {
      if (!window.ExampleData) {
        setPointStatus("Example data module failed to load.", true);
        return;
      }

      const example = window.ExampleData.getDistanceExample();
      points = example.points.map((point) => ({ ...point }));
      if (useVerticalPlane && example.enableVerticalPlane !== undefined) {
        useVerticalPlane.checked = example.enableVerticalPlane;
      }
      if (csvFileName) {
        csvFileName.textContent = `Example: ${example.label}`;
      }
      renderAssignmentTable();
      calculateDistances();
      view3d.resetCamera();
      setPointStatus(
        `Loaded example (${example.label}). Measure A and B are offset from the alignment — ` +
          "compare direct vs on-plane distances and cross-track offsets."
      );
    }

    function loadCsvData(parsed) {
      points = parsed.points.map((point) => ({
        ...point,
        role: "none",
        adjust: undefined,
      }));
      suggestDistanceRoles();
      renderAssignmentTable();
      calculateDistances();
      view3d.resetCamera();

      let message = `Imported ${parsed.stats.imported} measured point${parsed.stats.imported === 1 ? "" : "s"}.`;
      if (parsed.stats.skippedControl > 0) {
        message += ` Ignored ${parsed.stats.skippedControl} control point${parsed.stats.skippedControl === 1 ? "" : "s"}.`;
      }
      if (parsed.stats.skippedInvalid > 0) {
        message += ` Skipped ${parsed.stats.skippedInvalid} invalid row${parsed.stats.skippedInvalid === 1 ? "" : "s"}.`;
      }
      message += " Choose Pt 1, Pt 2, and optional ref points in the table.";
      setPointStatus(message);
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
          setPointStatus(error.message || "Could not parse CSV file.", true);
        }
      };
      reader.onerror = () => setPointStatus("Could not read the selected file.", true);
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
        source: "manual",
      });
      assignmentPanel.hidden = false;
      renderAssignmentTable();
      calculateDistances();
    }

    if (addPointBtn) {
      addPointBtn.addEventListener("click", addManualPoint);
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", exportOnPlaneCsv);
    }

    coordUnitsSelect.addEventListener("change", () => {
      syncView3dScale();
      calculateDistances();
    });

    useVerticalPlane.addEventListener("change", () => {
      if (useVerticalPlane.checked) suggestDistanceRoles();
      renderAssignmentTable();
      calculateDistances();
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
    calculateDistances();
    updateExportButton();
  }
}
