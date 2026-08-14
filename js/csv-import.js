(function (global) {
  "use strict";

  function parseCsvLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }

    result.push(current.trim());
    return result;
  }

  function normalizeHeader(value) {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
  }

  function isHeaderRow(cells) {
    const joined = cells.join(" ").toLowerCase();
    return (
      joined.includes("northing") ||
      joined.includes("easting") ||
      joined.includes("elevation") ||
      /^point\s*name/.test(normalizeHeader(cells[0] || ""))
    );
  }

  function mapHeaderColumns(cells) {
    const columns = {
      name: 0,
      northing: 1,
      easting: 2,
      elevation: 3,
      description: 4,
      pointCode: 4,
      recordType: -1,
    };

    cells.forEach((header, index) => {
      const key = normalizeHeader(header);
      if (/^point\s*name/.test(key)) columns.name = index;
      else if (key === "northing") columns.northing = index;
      else if (key === "easting") columns.easting = index;
      else if (key === "elevation") columns.elevation = index;
      else if (/^point\s*code/.test(key)) columns.pointCode = index;
      else if (/^record\s*type/.test(key)) columns.recordType = index;
      else if (key === "description") columns.description = index;
    });

    return columns;
  }

  function isControlPoint(pointCode, recordType) {
    const code = (pointCode || "").toLowerCase();
    const record = (recordType || "").toLowerCase();
    return /control\s*point/.test(code) || record === "control";
  }

  function suggestRoles(points) {
    const planeNamed = points
      .filter((point) => /plane\s*point/i.test(point.name))
      .sort((a, b) => {
        const ai = Number((a.name.match(/(\d+)/) || [])[1]) || Number.MAX_SAFE_INTEGER;
        const bi = Number((b.name.match(/(\d+)/) || [])[1]) || Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });

    if (planeNamed.length >= 2) {
      planeNamed[0].role = "p1";
      planeNamed[1].role = "p2";
      return;
    }

    if (points.length >= 2) {
      points[0].role = "p1";
      points[1].role = "p2";
    }
  }

  /**
   * Parse Trimble SCS900 CSV export (P, N, E, Z, D).
   * Ignores QA columns, FXL attribute columns, and control points.
   */
  function parseTrimbleCsv(text) {
    const lines = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      throw new Error("The CSV file is empty.");
    }

    let columns = {
      name: 0,
      northing: 1,
      easting: 2,
      elevation: 3,
      description: 4,
      pointCode: 4,
      recordType: -1,
    };
    let startIndex = 0;

    const firstCells = parseCsvLine(lines[0]);
    if (isHeaderRow(firstCells)) {
      columns = mapHeaderColumns(firstCells);
      startIndex = 1;
    }

    const points = [];
    let skippedControl = 0;
    let skippedInvalid = 0;
    let pointId = 0;

    for (let i = startIndex; i < lines.length; i += 1) {
      const cells = parseCsvLine(lines[i]);
      if (cells.length < 4) {
        skippedInvalid += 1;
        continue;
      }

      const name = cells[columns.name] || "";
      const northing = Number(String(cells[columns.northing]).replace(/,/g, ""));
      const easting = Number(String(cells[columns.easting]).replace(/,/g, ""));
      const elevation = Number(String(cells[columns.elevation]).replace(/,/g, ""));
      const description = cells[columns.description] || "";
      const pointCode = columns.pointCode >= 0 ? cells[columns.pointCode] || "" : "";
      const recordType = columns.recordType >= 0 ? cells[columns.recordType] || "" : "";

      if (!name) {
        skippedInvalid += 1;
        continue;
      }

      if (isControlPoint(pointCode, recordType)) {
        skippedControl += 1;
        continue;
      }

      if (!Number.isFinite(northing) || !Number.isFinite(easting) || !Number.isFinite(elevation)) {
        skippedInvalid += 1;
        continue;
      }

      pointId += 1;
      points.push({
        id: `csv-${pointId}`,
        name,
        northing,
        easting,
        elevation,
        description,
        pointCode,
        role: "none",
        adjust: false,
        source: "import",
      });
    }

    if (points.length < 2) {
      throw new Error(
        "Need at least two measured points after ignoring control points and invalid rows."
      );
    }

    suggestRoles(points);

    return {
      points,
      stats: {
        imported: points.length,
        skippedControl,
        skippedInvalid,
      },
    };
  }

  function escapeCsvField(value) {
    const str = String(value ?? "");
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function formatExportCoord(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0";
    return String(num);
  }

  function exportTrimbleCsv(points) {
    if (!points || points.length === 0) {
      throw new Error("No points to export.");
    }

    return (
      points
        .map((point) =>
          [
            escapeCsvField(`${point.name}adj`),
            formatExportCoord(point.northing),
            formatExportCoord(point.easting),
            formatExportCoord(point.elevation),
            escapeCsvField(point.description ?? ""),
          ].join(",")
        )
        .join("\r\n") + "\r\n"
    );
  }

  function downloadCsvFile(filename, content) {
    const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  global.CsvImport = {
    parseTrimbleCsv,
    suggestRoles,
    exportTrimbleCsv,
    downloadCsvFile,
  };
})(window);
