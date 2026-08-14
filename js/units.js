(function (global) {
  "use strict";

  const METERS_PER_INTL_FOOT = 0.3048;
  const METERS_PER_SURVEY_FOOT = 1200 / 3937;

  const UNIT_CONFIG = {
    survey: {
      label: "ft (US)",
      name: "US survey feet",
      toMeters: (v) => v * METERS_PER_SURVEY_FOOT,
      fromMeters: (m) => m / METERS_PER_SURVEY_FOOT,
    },
    intl: {
      label: "ft (Intl)",
      name: "international feet",
      toMeters: (v) => v * METERS_PER_INTL_FOOT,
      fromMeters: (m) => m / METERS_PER_INTL_FOOT,
    },
    metric: {
      label: "m",
      name: "meters",
      toMeters: (v) => v,
      fromMeters: (m) => m,
    },
  };

  function parseCoord(text) {
    const trimmed = text.trim();
    if (!trimmed) return { empty: true };

    const value = Number(trimmed.replace(/,/g, ""));
    if (!Number.isFinite(value)) {
      return { error: true };
    }

    return { value };
  }

  function formatUnitValue(meters, unitKey, decimals = 4) {
    const unit = UNIT_CONFIG[unitKey];
    const value = unit.fromMeters(meters);
    return `${Number(value.toFixed(decimals))} ${unit.label}`;
  }

  global.Units = {
    UNIT_CONFIG,
    parseCoord,
    formatUnitValue,
  };
})(window);
