(function () {
  "use strict";

  const METERS_PER_INTL_FOOT = 0.3048;
  const METERS_PER_INCH = METERS_PER_INTL_FOOT / 12;
  const M2_PER_SQ_FT = METERS_PER_INTL_FOOT ** 2;
  const M3_PER_CU_FT = METERS_PER_INTL_FOOT ** 3;

  const MAX_HISTORY = 10;

  const state = {
    mode: "length",
    inputSystem: "imperial",
    buffer: "",
    values: [],
    operator: null,
    expression: "",
    lastResult: null,
    freshEntry: true,
  };

  const expressionEl = document.getElementById("calc-expression");
  const displayEl = document.getElementById("calc-display-main");
  const sendDistanceBtn = document.getElementById("calc-send-distance");
  const sendAreaBtn = document.getElementById("calc-send-area");
  const sendVolumeBtn = document.getElementById("calc-send-volume");
  const statusLine = document.getElementById("calc-status-line");
  const precisionSelect = document.getElementById("precision");
  const keypadEl = document.getElementById("calc-keypad");
  const modeTabs = document.querySelectorAll("[data-calc-mode]");
  const inputTabs = document.querySelectorAll("[data-calc-input]");
  const historyListEl = document.getElementById("calc-history-list");
  const calcRootEl = document.querySelector(".construction-calc");
  const modeTabsPanel = document.getElementById("calc-mode-tabs");
  const sendActionsPanel = document.getElementById("calc-send-actions");
  const tipPanelEl = document.getElementById("calc-tip-panel");
  const tipSummaryEl = document.getElementById("calc-tip-summary");
  const tipCheckInput = document.getElementById("tip-check-input");
  const tipSecondInput = document.getElementById("tip-second-input");
  const tipSecondLabel = document.getElementById("tip-second-label");
  const tipSecondSuffix = document.getElementById("tip-second-suffix");
  const tipCheckField = document.getElementById("tip-check-field");
  const tipSecondField = document.getElementById("tip-second-field");
  const tipPresetsEl = document.getElementById("tip-presets");
  const tipDirectionBtns = document.querySelectorAll("[data-tip-direction]");

  const tipState = {
    direction: "forward",
    activeField: "check",
    check: "",
    second: "",
    lastResult: null,
  };

  const history = [];

  function isStandard() {
    return state.inputSystem === "standard";
  }

  function isTip() {
    return state.inputSystem === "tip";
  }

  function updateCalcChrome() {
    if (calcRootEl) {
      calcRootEl.classList.toggle("is-standard", isStandard());
      calcRootEl.classList.toggle("is-tip", isTip());
    }
    if (modeTabsPanel) {
      const hideModes = isStandard() || isTip();
      modeTabsPanel.hidden = hideModes;
      modeTabsPanel.setAttribute("aria-hidden", hideModes ? "true" : "false");
    }
    if (sendActionsPanel) {
      const hideSend = isStandard() || isTip();
      sendActionsPanel.hidden = hideSend;
      sendActionsPanel.setAttribute("aria-hidden", hideSend ? "true" : "false");
    }
    if (tipPanelEl) {
      tipPanelEl.hidden = !isTip();
      tipPanelEl.setAttribute("aria-hidden", isTip() ? "false" : "true");
    }
    if (keypadEl) {
      keypadEl.hidden = false;
      keypadEl.setAttribute("aria-hidden", "false");
    }
  }

  function formatMoney(value) {
    if (!Number.isFinite(value)) return "—";
    return `$${value.toFixed(2)}`;
  }

  function parseTipAmount(text) {
    const trimmed = text.trim();
    if (!trimmed) return { empty: true };
    if (!/^\d+(?:\.\d{0,2})?$/.test(trimmed)) {
      return { error: "Enter a valid dollar amount." };
    }
    return { value: Number(trimmed) };
  }

  function parseTipPercent(text) {
    const trimmed = text.trim();
    if (!trimmed) return { empty: true };
    if (!/^\d+(?:\.\d{0,2})?$/.test(trimmed)) {
      return { error: "Enter a valid percentage." };
    }
    return { value: Number(trimmed) };
  }

  function resetTipState() {
    tipState.direction = "forward";
    tipState.activeField = "check";
    tipState.check = "";
    tipState.second = "";
    tipState.lastResult = null;
    syncTipInputs();
    updateTipDirectionUi();
    renderTip();
  }

  function syncTipInputs() {
    if (tipCheckInput) tipCheckInput.value = tipState.check;
    if (tipSecondInput) tipSecondInput.value = tipState.second;
    if (tipCheckField) tipCheckField.classList.toggle("is-active", tipState.activeField === "check");
    if (tipSecondField) tipSecondField.classList.toggle("is-active", tipState.activeField === "second");
  }

  function setTipDirection(direction) {
    tipState.direction = direction;
    tipState.second = "";
    tipState.lastResult = null;
    updateTipDirectionUi();
    syncTipInputs();
    renderTip();
  }

  function updateTipDirectionUi() {
    const forward = tipState.direction === "forward";
    tipDirectionBtns.forEach((btn) => {
      const active = btn.dataset.tipDirection === tipState.direction;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (tipSecondLabel) {
      tipSecondLabel.textContent = forward ? "Tip percentage" : "Maximum spend";
    }
    if (tipSecondInput) {
      tipSecondInput.setAttribute("aria-label", forward ? "Tip percentage" : "Maximum spend");
      tipSecondInput.placeholder = forward ? "0" : "0.00";
    }
    if (tipSecondSuffix) {
      tipSecondSuffix.textContent = forward ? "%" : "";
      tipSecondSuffix.hidden = !forward;
    }
    if (tipPresetsEl) {
      tipPresetsEl.hidden = !forward;
    }
  }

  function setTipActiveField(field) {
    tipState.activeField = field;
    syncTipInputs();
  }

  function getTipActiveValue() {
    return tipState.activeField === "check" ? tipState.check : tipState.second;
  }

  function setTipActiveValue(value) {
    if (tipState.activeField === "check") {
      tipState.check = value;
    } else {
      tipState.second = value;
    }
    syncTipInputs();
  }

  function calculateTip() {
    const checkParsed = parseTipAmount(tipState.check);
    if (checkParsed.error) {
      setStatus(checkParsed.error, true);
      return;
    }
    if (checkParsed.empty || checkParsed.value <= 0) {
      setStatus("Enter a check amount greater than zero.", true);
      return;
    }

    const check = checkParsed.value;
    let tip = 0;
    let total = 0;
    let percent = 0;
    let expression = "";

    if (tipState.direction === "forward") {
      const pctParsed = parseTipPercent(tipState.second);
      if (pctParsed.error) {
        setStatus(pctParsed.error, true);
        return;
      }
      if (pctParsed.empty || pctParsed.value < 0) {
        setStatus("Enter a tip percentage.", true);
        return;
      }
      percent = pctParsed.value;
      tip = check * (percent / 100);
      total = check + tip;
      expression = `${formatMoney(check)} @ ${formatDecimal(percent, 2)}%`;
    } else {
      const maxParsed = parseTipAmount(tipState.second);
      if (maxParsed.error) {
        setStatus(maxParsed.error, true);
        return;
      }
      if (maxParsed.empty || maxParsed.value <= 0) {
        setStatus("Enter a maximum spend amount.", true);
        return;
      }
      if (maxParsed.value <= check) {
        setStatus("Maximum spend must be greater than the check amount.", true);
        return;
      }
      total = maxParsed.value;
      tip = total - check;
      percent = (tip / check) * 100;
      expression = `${formatMoney(check)} max ${formatMoney(total)}`;
    }

    tipState.lastResult = {
      direction: tipState.direction,
      check,
      second: Number(tipState.second),
      tip,
      total,
      percent,
      expression,
    };

    addToHistory({
      expression,
      result: `tip ${formatMoney(tip)}, total ${formatMoney(total)} (${formatDecimal(percent, 2)}%)`,
      mode: "tip",
      base: total,
      tipData: { ...tipState.lastResult },
    });

    setStatus("");
    renderTip();
  }

  function renderTip() {
    if (!isTip()) return;

    const forward = tipState.direction === "forward";
    expressionEl.textContent =
      tipState.lastResult?.expression ||
      (forward
        ? "Enter check amount and tip percentage — tap = to calculate"
        : "Enter check amount and max spend — tap = to calculate");

    if (tipState.lastResult) {
      displayEl.textContent = formatMoney(tipState.lastResult.total);
      if (tipSummaryEl) {
        tipSummaryEl.hidden = false;
        tipSummaryEl.innerHTML =
          `Tip: <strong>${formatMoney(tipState.lastResult.tip)}</strong>` +
          ` · Rate: <strong>${formatDecimal(tipState.lastResult.percent, 2)}%</strong>` +
          ` · Check: <strong>${formatMoney(tipState.lastResult.check)}</strong>`;
      }
    } else {
      displayEl.textContent = tipState.check ? formatMoney(Number(tipState.check) || 0) : "$0.00";
      if (tipSummaryEl) {
        tipSummaryEl.hidden = true;
        tipSummaryEl.textContent = "";
      }
    }

    updateSendButtons(null);
    updateCalcChrome();
  }

  function getPrecision() {
    return Number(precisionSelect?.value) || 16;
  }

  function formatDecimal(value, maxDecimals = 8) {
    if (!Number.isFinite(value)) return "";
    return String(Number(value.toFixed(maxDecimals)));
  }

  function parseFraction(token) {
    const parts = token.split("/");
    if (parts.length !== 2) return null;
    const num = Number(parts[0]);
    const den = Number(parts[1]);
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
      return { meters: feet * METERS_PER_INTL_FOOT };
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
      inchesOnly =
        /^\d/.test(working) &&
        (working.includes('"') || /\bin\b/i.test(working) || working.includes("&"));
    }

    working = working.replace(/\s*in(?:ches)?\.?\s*$/i, "").replace(/"\s*$/, "").trim();

    if (!working && feet !== 0) {
      return { meters: feet * METERS_PER_INTL_FOOT };
    }

    if (working && working.includes("&")) {
      const parsedInches = parseInchesWithAmpersand(working);
      if (parsedInches.error) return parsedInches;
      inches = parsedInches.inches;
    } else if (working) {
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
          return { error: "Invalid feet-inch value." };
        }
      }
    }

    if (inchesOnly && feet === 0) {
      return { meters: inches * METERS_PER_INCH };
    }

    const totalFeet = feet + inches / 12;
    return { meters: totalFeet * METERS_PER_INTL_FOOT };
  }

  function parseInchesWithAmpersand(working) {
    const ampMatch = working.match(/^(-?\d+(?:\.\d+)?)?&(.+)$/);
    if (!ampMatch) {
      return { error: "Invalid feet-inch value." };
    }

    let inches = ampMatch[1] ? Number(ampMatch[1]) : 0;
    const fracPart = ampMatch[2].trim();

    const fracOnly = fracPart.match(/^(\d+\/\d+)$/);
    if (fracOnly) {
      const frac = parseFraction(fracOnly[1]);
      if (frac === null) return { error: "Invalid fraction." };
      inches += frac;
      return { inches };
    }

    const mixed = fracPart.match(/^(\d+)\s+(\d+\/\d+)$/);
    if (mixed) {
      inches += Number(mixed[1]);
      const frac = parseFraction(mixed[2]);
      if (frac === null) return { error: "Invalid fraction." };
      inches += frac;
      return { inches };
    }

    if (/^-?\d+(?:\.\d+)?$/.test(fracPart)) {
      inches += Number(fracPart);
      return { inches };
    }

    return { error: "Invalid fraction after &." };
  }

  function formatFeetInchesFraction(meters, precisionDenominator) {
    if (!Number.isFinite(meters)) return "0";

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
      if (fracUnits > 0) {
        const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
        const g = gcd(fracUnits, precisionDenominator);
        const num = fracUnits / g;
        const den = precisionDenominator / g;
        if (wholeInches > 0) result += wholeInches;
        result += "&" + num + "/" + den + '"';
      } else {
        result += wholeInches + '"';
      }
    }

    return result;
  }

  function setStatus(message, isError = false) {
    statusLine.textContent = message;
    statusLine.hidden = !message;
    statusLine.classList.toggle("is-error", isError);
  }

  function modeHint() {
    if (isTip()) {
      return tipState.direction === "forward"
        ? "Tip calculator — check amount and tip percentage"
        : "Tip calculator — check amount and maximum spend";
    }
    if (isStandard()) {
      return "Standard calculator — add, subtract, multiply, or divide";
    }
    const metric = state.inputSystem === "metric";
    if (state.mode === "area") return metric ? "Length × Width (metric)" : "Length × Width";
    if (state.mode === "volume") return metric ? "Length × Width × Depth (metric)" : "Length × Width × Depth";
    return metric
      ? "Add, subtract, multiply, or divide — enter decimal meters"
      : "Add, subtract, multiply, or divide — tap ft, &, ⁄, or in";
  }

  function requiredValues() {
    if (state.mode === "area") return 2;
    if (state.mode === "volume") return 3;
    return 2;
  }

  function formatMetricDisplay(meters) {
    return `${formatDecimal(meters, 6)} m`;
  }

  function formatStoredValue(value) {
    if (isStandard()) {
      return formatDecimal(value);
    }
    if (state.inputSystem === "metric") {
      return formatMetricDisplay(value);
    }
    return formatFeetInchesFraction(value, getPrecision());
  }

  function parseStandardBuffer(text) {
    const trimmed = text.trim();
    if (!trimmed) return { empty: true };
    if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      return { error: "Enter a number." };
    }
    return { value: Number(trimmed) };
  }

  function parseMetricBuffer(text) {
    const trimmed = text.trim();
    if (!trimmed) return { empty: true };

    if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      return { error: "Enter a decimal value in meters." };
    }

    return { meters: Number(trimmed) };
  }

  function formatResult(result) {
    if (result.mode === "standard") {
      return formatDecimal(result.base);
    }

    const metric = state.inputSystem === "metric";

    if (result.mode === "length") {
      return metric
        ? formatMetricDisplay(result.base)
        : formatFeetInchesFraction(result.base, getPrecision());
    }

    if (result.mode === "area") {
      return metric
        ? `${formatDecimal(result.base)} m²`
        : `${formatDecimal(result.base / M2_PER_SQ_FT)} sq ft`;
    }

    return metric
      ? `${formatDecimal(result.base)} m³`
      : `${formatDecimal(result.base / M3_PER_CU_FT)} ft³`;
  }

  function formatOperandForHistory(operand) {
    if (!operand) return "";
    if (operand.display !== undefined) return operand.display;
    if (operand.value !== undefined) return formatDecimal(operand.value);
    if (operand.scalar !== undefined) return String(operand.scalar);
    return formatStoredValue(operand.meters);
  }

  function buildHistoryExpression(operand) {
    if (isStandard()) {
      if (state.operator) {
        const rhs = formatOperandForHistory(operand);
        return rhs ? `${state.expression} ${rhs}`.trim() : state.expression;
      }
      if (operand) return formatOperandForHistory(operand);
      if (state.values.length) return formatDecimal(state.values[0]);
      return state.expression || state.buffer;
    }

    if (state.mode === "area" || state.mode === "volume") {
      if (state.operator) {
        const rhs = formatOperandForHistory(operand);
        return rhs ? `${state.expression} ${rhs}`.trim() : state.expression;
      }
      return state.expression;
    }

    if (state.operator) {
      const rhs = formatOperandForHistory(operand);
      return rhs ? `${state.expression} ${rhs}`.trim() : state.expression;
    }
    if (operand) return formatOperandForHistory(operand);
    if (state.values.length) return formatStoredValue(state.values[0]);
    return state.expression || state.buffer;
  }

  function addToHistory(entry) {
    history.unshift(entry);
    if (history.length > MAX_HISTORY) {
      history.length = MAX_HISTORY;
    }
    renderHistory();
  }

  function renderHistory() {
    if (!historyListEl) return;

    historyListEl.innerHTML = "";

    if (history.length === 0) {
      const empty = document.createElement("li");
      empty.className = "calc-history-empty";
      empty.textContent = "No calculations yet.";
      historyListEl.appendChild(empty);
      return;
    }

    history.forEach((item) => {
      const row = document.createElement("li");

      const button = document.createElement("button");
      button.type = "button";
      button.className = "calc-history-item";
      button.setAttribute("aria-label", `Use result ${item.result} in calculator`);

      const expression = document.createElement("span");
      expression.className = "calc-history-expression";
      expression.textContent = item.expression;

      const result = document.createElement("span");
      result.className = "calc-history-result";
      result.textContent = `= ${item.result}`;

      button.appendChild(expression);
      button.appendChild(result);
      button.addEventListener("click", () => applyHistoryEntry(item));
      row.appendChild(button);
      historyListEl.appendChild(row);
    });
  }

  function recordHistory(result, operand) {
    addToHistory({
      expression: buildHistoryExpression(operand),
      result: formatResult(result),
      mode: result.mode,
      base: result.base,
    });
  }

  function applyHistoryEntry(entry) {
    if (entry.mode === "tip") {
      if (!isTip()) {
        state.inputSystem = "tip";
        inputTabs.forEach((tab) => {
          const active = tab.dataset.calcInput === "tip";
          tab.classList.toggle("is-active", active);
          tab.setAttribute("aria-selected", active ? "true" : "false");
        });
        buildKeypad();
        updateCalcChrome();
      }
      if (entry.tipData) {
        tipState.direction = entry.tipData.direction;
        tipState.check = formatDecimal(entry.tipData.check, 2);
        tipState.second = formatDecimal(entry.tipData.second, 2);
        tipState.lastResult = { ...entry.tipData };
        updateTipDirectionUi();
        syncTipInputs();
        setStatus("Loaded from history.");
        renderTip();
      }
      return;
    }

    if (entry.mode === "standard") {
      if (!isStandard()) setInputSystem("standard");
    } else {
      if (isStandard()) setInputSystem("imperial");
      if (state.mode !== entry.mode) setMode(entry.mode);
    }

    state.buffer = "";
    state.values = [];
    state.operator = null;
    state.expression = "";
    state.freshEntry = true;
    state.lastResult = { mode: entry.mode, base: entry.base };
    setStatus("Loaded from history — continue with +, −, ×, or ÷.");
    render();
  }

  function updateSendButtons(result) {
    if (isStandard()) return;
    sendDistanceBtn.disabled = !(result && result.mode === "length");
    sendAreaBtn.disabled = !(result && result.mode === "area");
    sendVolumeBtn.disabled = !(result && result.mode === "volume");
  }

  function render() {
    if (isTip()) {
      renderTip();
      return;
    }
    expressionEl.textContent = state.expression || modeHint();
    displayEl.textContent = state.buffer || (state.lastResult ? formatResult(state.lastResult) : "0");
    if (tipSummaryEl) {
      tipSummaryEl.hidden = true;
      tipSummaryEl.textContent = "";
    }
    updateSendButtons(state.lastResult);
    updateCalcChrome();
  }

  function canChainFromLastResult() {
    return Boolean(state.freshEntry && state.lastResult && !state.buffer.trim());
  }

  function seedValuesFromLastResult() {
    if (!canChainFromLastResult()) return false;
    state.values = [state.lastResult.base];
    state.lastResult = null;
    return true;
  }

  function resetAll() {
    state.buffer = "";
    state.values = [];
    state.operator = null;
    state.expression = "";
    state.lastResult = null;
    state.freshEntry = true;
    setStatus("");
    render();
  }

  function clearEntry() {
    state.buffer = "";
    state.freshEntry = true;
    setStatus("");
    render();
  }

  function isBareNumber(text) {
    return /^-?\d+(?:\.\d+)?$/.test(text.trim());
  }

  function shouldParseAsScalar(text) {
    if (isStandard()) return false;
    return (
      state.mode === "length" &&
      (state.operator === "×" || state.operator === "÷") &&
      isBareNumber(text)
    );
  }

  function parseBuffer() {
    if (!state.buffer.trim()) {
      return { error: isStandard() ? "Enter a number." : "Enter a measurement." };
    }

    if (isStandard()) {
      const parsed = parseStandardBuffer(state.buffer);
      if (parsed.error) return parsed;
      if (parsed.empty) return { error: "Enter a number." };
      return { value: parsed.value };
    }

    if (shouldParseAsScalar(state.buffer)) {
      return { scalar: Number(state.buffer.trim()) };
    }

    const parsed =
      state.inputSystem === "metric"
        ? parseMetricBuffer(state.buffer)
        : parseFeetInchesFraction(state.buffer);
    if (parsed.error) return parsed;
    if (parsed.empty) return { error: "Enter a measurement." };
    return { meters: parsed.meters };
  }

  function commitBuffer() {
    const parsed = parseBuffer();
    if (parsed.error) {
      setStatus(parsed.error, true);
      return null;
    }
    if (parsed.value !== undefined) {
      return { value: parsed.value };
    }
    if (parsed.scalar !== undefined) {
      return { scalar: parsed.scalar };
    }
    return { meters: parsed.meters };
  }

  function appendToBuffer(text) {
    if (state.freshEntry && state.lastResult && !state.buffer) {
      state.buffer = "";
      state.lastResult = null;
      state.expression = "";
    }
    state.freshEntry = false;
    state.buffer += text;
    render();
  }

  function backspace() {
    if (!state.buffer) return;
    state.buffer = state.buffer.slice(0, -1);
    state.freshEntry = false;
    render();
  }

  function toggleSign() {
    if (!state.buffer) return;
    if (state.buffer.startsWith("-")) {
      state.buffer = state.buffer.slice(1);
    } else {
      state.buffer = "-" + state.buffer;
    }
    render();
  }

  function pressDigit(digit) {
    if (state.freshEntry && state.lastResult && !state.buffer) {
      state.buffer = "";
      state.lastResult = null;
      state.expression = "";
    }
    state.freshEntry = false;

    state.buffer += digit;
    setStatus("");
    render();
  }

  function pressFeet() {
    if (state.freshEntry) state.buffer = "";
    state.freshEntry = false;
    if (!state.buffer) {
      setStatus("Enter feet first, then tap ft.", true);
      return;
    }
    if (!state.buffer.endsWith("'")) {
      state.buffer += "'";
    }
    setStatus("");
    render();
  }

  function pressAmpersand() {
    if (state.inputSystem !== "imperial") return;
    if (!state.buffer || !/\d$/.test(state.buffer)) {
      setStatus("Enter whole inches before &.", true);
      return;
    }
    if (state.buffer.includes("&")) {
      setStatus("& already added.", true);
      return;
    }
    state.freshEntry = false;
    state.buffer += "&";
    setStatus("");
    render();
  }

  function pressInches() {
    if (state.inputSystem !== "imperial") return;
    if (!state.buffer) {
      setStatus("Enter a value before in.", true);
      return;
    }
    state.freshEntry = false;
    if (!state.buffer.endsWith('"')) {
      state.buffer += '"';
    }
    setStatus("");
    render();
  }

  function pressFractionSlash() {
    if (state.inputSystem === "metric") {
      setStatus("Fractions are available in Imperial (ft/in) mode.", true);
      return;
    }
    if (!state.buffer) return;
    if (state.buffer.includes("&") && /\d$/.test(state.buffer)) {
      state.buffer += "/";
    } else if (/ \d+$/.test(state.buffer)) {
      state.buffer += "/";
    } else if (/\d$/.test(state.buffer)) {
      state.buffer += " ";
    }
    state.freshEntry = false;
    setStatus("");
    render();
  }

  function pressDecimal() {
    if (state.freshEntry) {
      state.buffer = "0.";
      state.freshEntry = false;
    } else if (!state.buffer.includes(".")) {
      appendToBuffer(state.buffer ? "." : "0.");
      return;
    }
    render();
  }

  function parseAreaVolumeBuffer(text) {
    const trimmed = text.trim();
    if (!trimmed) return { empty: true };
    if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      return { error: "Enter a decimal value in the same units as the result." };
    }
    const n = Number(trimmed);
    if (state.inputSystem === "metric") {
      return { base: n };
    }
    return { base: state.mode === "area" ? n * M2_PER_SQ_FT : n * M3_PER_CU_FT };
  }

  function commitAreaVolumeBuffer() {
    const parsed = parseAreaVolumeBuffer(state.buffer);
    if (parsed.error) {
      setStatus(parsed.error, true);
      return null;
    }
    if (parsed.empty) {
      setStatus("Enter a value.", true);
      return null;
    }
    return { base: parsed.base, display: state.buffer.trim() };
  }

  function applyAreaVolumeOperator(a, b, opSymbol) {
    return applyStandardOperator(a, b, opSymbol);
  }

  function operandToMeters(operand) {
    if (operand.scalar !== undefined) {
      return operand.scalar * METERS_PER_INTL_FOOT;
    }
    return operand.meters;
  }

  function applyStandardOperator(a, b, opSymbol) {
    switch (opSymbol) {
      case "+":
        return a + b;
      case "−":
      case "-":
        return a - b;
      case "×":
        return a * b;
      case "÷":
        return b === 0 ? NaN : a / b;
      default:
        return b;
    }
  }

  function pressStandardOperator(opSymbol) {
    let value = null;

    if (state.buffer.trim()) {
      const operand = commitBuffer();
      if (operand === null) return;
      value = operand.value;
    } else if (!seedValuesFromLastResult() && state.values.length === 0) {
      setStatus("Enter a number.", true);
      return;
    }

    if (value !== null) {
      if (state.values.length === 0) {
        state.values.push(value);
      } else if (state.operator) {
        state.values[0] = applyStandardOperator(state.values[0], value, state.operator);
      } else {
        state.values[0] = value;
      }
    }

    state.operator = opSymbol;
    state.buffer = "";
    state.freshEntry = true;
    state.lastResult = null;
    state.expression = `${formatDecimal(state.values[0])} ${opSymbol}`;
    setStatus("");
    render();
  }

  function pressStandardEquals() {
    const operand = state.buffer ? commitBuffer() : null;
    if (state.values.length === 0 && operand === null && !canChainFromLastResult()) return;

    if (state.values.length === 0 && canChainFromLastResult()) {
      seedValuesFromLastResult();
    }

    let result;
    if (state.operator && operand !== null) {
      result = applyStandardOperator(state.values[0], operand.value, state.operator);
    } else if (operand !== null) {
      result = operand.value;
    } else {
      result = state.values[0];
    }

    if (!Number.isFinite(result)) {
      setStatus("Cannot divide by zero.", true);
      return;
    }

    state.lastResult = { mode: "standard", base: result };
    recordHistory(state.lastResult, operand);
    state.buffer = "";
    state.values = [];
    state.operator = null;
    state.expression = "";
    state.freshEntry = true;
    setStatus("");
    render();
  }

  function pressMultiplyChain() {
    if (isStandard() || state.mode === "length") {
      if (isStandard()) {
        pressStandardOperator("×");
      } else {
        pressOperator("×");
      }
      return;
    }

    if (canChainFromLastResult() && !state.buffer.trim()) {
      state.lastResult = null;
      state.values = [];
      state.expression = "";
      state.freshEntry = true;
      setStatus("");
      render();
      return;
    }

    const operand = commitBuffer();
    if (operand === null) return;

    state.values.push(operandToMeters(operand));
    state.buffer = "";
    state.freshEntry = true;

    const parts = state.values.map(formatStoredValue);
    state.expression = parts.join(" × ");
    setStatus("");

    const needed = requiredValues();
    if (state.values.length >= needed) {
      pressEquals();
    } else {
      render();
    }
  }

  function pressOperator(opSymbol) {
    if (isStandard()) {
      pressStandardOperator(opSymbol);
      return;
    }

    if (state.mode !== "length") {
      if (canChainFromLastResult() && opSymbol !== "×") {
        state.values = [state.lastResult.base];
        state.lastResult = null;
        state.operator = opSymbol;
        state.buffer = "";
        state.freshEntry = true;
        state.expression = `${formatResult({ mode: state.mode, base: state.values[0] })} ${opSymbol}`;
        setStatus("");
        render();
        return;
      }

      if (opSymbol === "×") {
        pressMultiplyChain();
      } else {
        setStatus("In Area/Volume mode, use × between dimensions.", true);
      }
      return;
    }

    let operand = null;

    if (state.buffer.trim()) {
      operand = commitBuffer();
      if (operand === null) return;
    } else if (!seedValuesFromLastResult() && state.values.length === 0) {
      setStatus("Enter a measurement.", true);
      return;
    }

    if (operand !== null) {
      if (state.values.length === 0) {
        state.values.push(operandToMeters(operand));
      } else if (state.operator) {
        state.values[0] = applyLengthOperator(state.values[0], operand, state.operator);
      } else {
        state.values[0] = operandToMeters(operand);
      }
    }

    state.operator = opSymbol;
    state.buffer = "";
    state.freshEntry = true;
    state.lastResult = null;
    state.expression = `${formatStoredValue(state.values[0])} ${opSymbol}`;
    setStatus("");
    render();
  }

  function scalarToMeters(scalar) {
    return state.inputSystem === "metric" ? scalar : scalar * METERS_PER_INTL_FOOT;
  }

  function applyLengthOperator(a, operand, opSymbol) {
    if (operand.scalar !== undefined) {
      const scalar = operand.scalar;
      switch (opSymbol) {
        case "+":
          return a + scalarToMeters(scalar);
        case "−":
        case "-":
          return a - scalarToMeters(scalar);
        case "×":
          return a * scalar;
        case "÷":
          return scalar === 0 ? NaN : a / scalar;
        default:
          return a;
      }
    }

    const b = operand.meters;
    switch (opSymbol) {
      case "+":
        return a + b;
      case "−":
      case "-":
        return a - b;
      case "×":
        return a * b;
      case "÷":
        return b === 0 ? NaN : a / b;
      default:
        return b;
    }
  }

  function pressEquals() {
    if (isStandard()) {
      pressStandardEquals();
      return;
    }

    if (state.mode === "length") {
      const operand = state.buffer ? commitBuffer() : null;
      if (state.values.length === 0 && operand === null && !canChainFromLastResult()) return;

      if (state.values.length === 0 && canChainFromLastResult()) {
        seedValuesFromLastResult();
      }

      let resultMeters;
      if (state.operator && operand !== null) {
        resultMeters = applyLengthOperator(state.values[0], operand, state.operator);
      } else if (operand !== null) {
        resultMeters = operand.scalar !== undefined ? scalarToMeters(operand.scalar) : operand.meters;
      } else {
        resultMeters = state.values[0];
      }

      if (!Number.isFinite(resultMeters)) {
        setStatus("Cannot divide by zero.", true);
        return;
      }

      state.lastResult = { mode: "length", base: resultMeters };
      recordHistory(state.lastResult, operand);
      state.buffer = "";
      state.values = [];
      state.operator = null;
      state.expression = "";
      state.freshEntry = true;
      setStatus("Length result ready — send to Distance Converter.");
      render();
      return;
    }

    if (state.operator && state.values.length > 0) {
      const operand = state.buffer ? commitAreaVolumeBuffer() : null;
      if (state.values.length === 0) return;

      let resultBase;
      if (state.operator && operand !== null) {
        resultBase = applyAreaVolumeOperator(state.values[0], operand.base, state.operator);
      } else if (operand !== null) {
        resultBase = operand.base;
      } else {
        resultBase = state.values[0];
      }

      if (!Number.isFinite(resultBase)) {
        setStatus("Cannot divide by zero.", true);
        return;
      }

      state.lastResult = { mode: state.mode, base: resultBase };
      recordHistory(state.lastResult, operand);
      state.buffer = "";
      state.values = [];
      state.operator = null;
      state.expression = "";
      state.freshEntry = true;
      setStatus(state.mode === "area" ? "Area calculated — send to Area Converter." : "Volume calculated — send to Volume Converter.");
      render();
      return;
    }

    if (state.buffer) {
      const operand = commitBuffer();
      if (operand === null) return;
      state.values.push(operandToMeters(operand));
      state.buffer = "";
    }

    const needed = requiredValues();
    if (state.values.length < needed) {
      setStatus(`Enter ${needed} dimensions separated by ×.`, true);
      return;
    }

    const dims = state.values.slice(0, needed);
    const parts = dims.map(formatStoredValue);
    state.expression = parts.join(" × ");

    if (state.mode === "area") {
      const areaM2 = dims[0] * dims[1];
      state.lastResult = { mode: "area", base: areaM2 };
      recordHistory(state.lastResult, null);
      setStatus("Area calculated — send to Area Converter.");
    } else {
      const volumeM3 = dims[0] * dims[1] * dims[2];
      state.lastResult = { mode: "volume", base: volumeM3 };
      recordHistory(state.lastResult, null);
      setStatus("Volume calculated — send to Volume Converter.");
    }

    state.values = [];
    state.freshEntry = true;
    render();
  }

  function setInputSystem(system) {
    state.inputSystem = system;
    inputTabs.forEach((tab) => {
      const active = tab.dataset.calcInput === system;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (isStandard() || isTip()) {
      state.mode = "length";
    }
    buildKeypad();
    updateCalcChrome();
    if (isTip()) {
      resetTipState();
      return;
    }
    resetAll();
  }

  function setMode(mode) {
    state.mode = mode;
    modeTabs.forEach((tab) => {
      const active = tab.dataset.calcMode === mode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    resetAll();
  }

  function sendToDistance() {
    if (!state.lastResult || state.lastResult.mode !== "length") return;
    if (!window.DistanceConverter?.setFromMeters) {
      setStatus("Distance converter is not available.", true);
      return;
    }
    window.DistanceConverter.setFromMeters(state.lastResult.base);
    setStatus("Sent to Dynamic Distance Converter.");
  }

  function sendToArea() {
    if (!state.lastResult || state.lastResult.mode !== "area") return;
    if (!window.AreaConverter?.setFromSquareMeters) {
      setStatus("Area converter is not available.", true);
      return;
    }
    window.AreaConverter.setFromSquareMeters(state.lastResult.base);
    setStatus("Sent to Dynamic Area Converter.");
  }

  function sendToVolume() {
    if (!state.lastResult || state.lastResult.mode !== "volume") return;
    if (!window.VolumeConverter?.setFromCubicMeters) {
      setStatus("Volume converter is not available.", true);
      return;
    }
    window.VolumeConverter.setFromCubicMeters(state.lastResult.base);
    setStatus("Sent to Dynamic Volume Converter.");
  }

  function handleTipKey(action, value) {
    tipState.lastResult = null;
    setStatus("");

    switch (action) {
      case "digit":
        appendTipDigit(value);
        break;
      case "decimal":
        appendTipDecimal();
        break;
      case "backspace":
        setTipActiveValue(getTipActiveValue().slice(0, -1));
        renderTip();
        break;
      case "clear":
        resetTipState();
        break;
      case "clear-entry":
        setTipActiveValue("");
        renderTip();
        break;
      case "equals":
        calculateTip();
        break;
      default:
        break;
    }
  }

  function appendTipDigit(digit) {
    let current = getTipActiveValue();
    const isMoney = tipState.activeField === "check" || tipState.direction === "reverse";
    if (isMoney && current.includes(".")) {
      const decimals = current.split(".")[1] || "";
      if (decimals.length >= 2) return;
    }
    if (current === "0" && digit !== ".") current = "";
    setTipActiveValue(current + digit);
    renderTip();
  }

  function appendTipDecimal() {
    let current = getTipActiveValue();
    if (!current) current = "0";
    if (!current.includes(".")) {
      setTipActiveValue(`${current}.`);
      renderTip();
    }
  }

  function handleKey(action, value) {
    if (isTip()) {
      handleTipKey(action, value);
      return;
    }

    switch (action) {
      case "digit":
        pressDigit(value);
        break;
      case "decimal":
        pressDecimal();
        break;
      case "feet":
        pressFeet();
        break;
      case "ampersand":
        pressAmpersand();
        break;
      case "inches":
        pressInches();
        break;
      case "fraction":
        pressFractionSlash();
        break;
      case "sign":
        toggleSign();
        break;
      case "backspace":
        backspace();
        break;
      case "clear":
        resetAll();
        break;
      case "clear-entry":
        clearEntry();
        break;
      case "add":
        pressOperator("+");
        break;
      case "subtract":
        pressOperator("−");
        break;
      case "multiply":
        pressMultiplyChain();
        break;
      case "divide":
        pressOperator("÷");
        break;
      case "equals":
        pressEquals();
        break;
      default:
        break;
    }
  }

  function getStandardKeypadRows() {
    return [
      [
        { action: "clear", label: "C", className: "calc-key--fn", col: 1 },
        { action: "clear-entry", label: "CE", className: "calc-key--fn", col: 2 },
        { action: "backspace", label: "⌫", className: "calc-key--fn", aria: "Backspace", col: 3 },
        { action: "divide", label: "÷", className: "calc-key--op", col: 4 },
      ],
      [
        { action: "digit", value: "7", label: "7", col: 1 },
        { action: "digit", value: "8", label: "8", col: 2 },
        { action: "digit", value: "9", label: "9", col: 3 },
        { action: "multiply", label: "×", className: "calc-key--op", col: 4 },
      ],
      [
        { action: "digit", value: "4", label: "4", col: 1 },
        { action: "digit", value: "5", label: "5", col: 2 },
        { action: "digit", value: "6", label: "6", col: 3 },
        { action: "subtract", label: "−", className: "calc-key--op", col: 4 },
      ],
      [
        { action: "digit", value: "1", label: "1", col: 1 },
        { action: "digit", value: "2", label: "2", col: 2 },
        { action: "digit", value: "3", label: "3", col: 3 },
        { action: "add", label: "+", className: "calc-key--op", col: 4 },
      ],
      [
        { action: "sign", label: "±", className: "calc-key--fn", col: 1 },
        { action: "digit", value: "0", label: "0", col: 2 },
        { action: "decimal", label: ".", className: "calc-key--fn", col: 3 },
        { action: "equals", label: "=", className: "calc-key--eq", col: 4 },
      ],
    ];
  }

  function getKeypadRows() {
    if (isStandard() || isTip()) {
      return getStandardKeypadRows();
    }

    if (state.inputSystem === "imperial") {
      return [
        [
          { action: "clear", label: "C", className: "calc-key--fn", col: 2 },
          { action: "clear-entry", label: "CE", className: "calc-key--fn", col: 3 },
          { action: "backspace", label: "⌫", className: "calc-key--fn", aria: "Backspace", col: 4 },
          { action: "divide", label: "÷", className: "calc-key--op", col: 5 },
        ],
        [
          { action: "feet", label: "ft", className: "calc-key--unit", col: 1 },
          { action: "digit", value: "7", label: "7", col: 2 },
          { action: "digit", value: "8", label: "8", col: 3 },
          { action: "digit", value: "9", label: "9", col: 4 },
          { action: "multiply", label: "×", className: "calc-key--op", col: 5 },
        ],
        [
          { action: "ampersand", label: "&", className: "calc-key--unit", aria: "Inches and fraction separator", col: 1 },
          { action: "digit", value: "4", label: "4", col: 2 },
          { action: "digit", value: "5", label: "5", col: 3 },
          { action: "digit", value: "6", label: "6", col: 4 },
          { action: "subtract", label: "−", className: "calc-key--op", col: 5 },
        ],
        [
          { action: "fraction", label: "⁄", className: "calc-key--unit", aria: "Fraction", col: 1 },
          { action: "digit", value: "1", label: "1", col: 2 },
          { action: "digit", value: "2", label: "2", col: 3 },
          { action: "digit", value: "3", label: "3", col: 4 },
          { action: "add", label: "+", className: "calc-key--op", col: 5 },
        ],
        [
          { action: "inches", label: "in", className: "calc-key--unit", col: 1 },
          { action: "sign", label: "±", className: "calc-key--fn", col: 2 },
          { action: "digit", value: "0", label: "0", col: 3 },
          { action: "decimal", label: ".", className: "calc-key--fn", col: 4 },
          { action: "equals", label: "=", className: "calc-key--eq", col: 5 },
        ],
      ];
    }

    return getStandardKeypadRows();
  }

  function buildKeypad() {
    keypadEl.classList.toggle("calc-keypad--imperial", state.inputSystem === "imperial");
    keypadEl.classList.toggle("calc-keypad--metric", state.inputSystem === "metric" || isStandard() || isTip());
    keypadEl.classList.toggle("calc-keypad--standard", isStandard() || isTip());
    keypadEl.innerHTML = "";
    getKeypadRows().forEach((row, rowIndex) => {
      row.forEach((key) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `calc-key ${key.className || ""}`.trim();
        button.textContent = key.label;
        button.dataset.action = key.action;
        if (key.value) button.dataset.value = key.value;
        if (key.aria) button.setAttribute("aria-label", key.aria);

        button.style.gridRow = String(rowIndex + 1);
        button.style.gridColumn = String(key.col);

        button.addEventListener("click", () => handleKey(key.action, key.value));
        keypadEl.appendChild(button);
      });
    });
  }

  modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.calcMode));
  });

  inputTabs.forEach((tab) => {
    tab.addEventListener("click", () => setInputSystem(tab.dataset.calcInput));
  });

  tipDirectionBtns.forEach((btn) => {
    btn.addEventListener("click", () => setTipDirection(btn.dataset.tipDirection));
  });

  document.querySelectorAll(".calc-tip-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!isTip() || tipState.direction !== "forward") return;
      tipState.activeField = "second";
      tipState.second = btn.dataset.tipPreset;
      tipState.lastResult = null;
      syncTipInputs();
      calculateTip();
    });
  });

  tipCheckInput?.addEventListener("focus", () => setTipActiveField("check"));
  tipSecondInput?.addEventListener("focus", () => setTipActiveField("second"));
  tipCheckField?.addEventListener("click", () => setTipActiveField("check"));
  tipSecondField?.addEventListener("click", () => setTipActiveField("second"));

  tipCheckInput?.addEventListener("input", () => {
    tipState.check = tipCheckInput.value.replace(/[^\d.]/g, "");
    tipState.lastResult = null;
    setStatus("");
    renderTip();
  });

  tipSecondInput?.addEventListener("input", () => {
    tipState.second = tipSecondInput.value.replace(/[^\d.]/g, "");
    tipState.lastResult = null;
    setStatus("");
    renderTip();
  });

  sendDistanceBtn.addEventListener("click", sendToDistance);
  sendAreaBtn.addEventListener("click", sendToArea);
  sendVolumeBtn.addEventListener("click", sendToVolume);

  precisionSelect?.addEventListener("change", () => {
    if (state.lastResult?.mode === "length" && state.inputSystem === "imperial") {
      render();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!event.target.closest(".construction-calc")) return;

    if (isTip()) {
      if (event.target.matches("#tip-check-input, #tip-second-input")) {
        if (event.key === "Enter") {
          event.preventDefault();
          calculateTip();
        }
        return;
      }

      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        handleTipKey("digit", event.key);
      } else if (event.key === ".") {
        event.preventDefault();
        handleTipKey("decimal");
      } else if (event.key === "Backspace") {
        event.preventDefault();
        handleTipKey("backspace");
      } else if (event.key === "Enter" || event.key === "=") {
        event.preventDefault();
        handleTipKey("equals");
      } else if (event.key === "Escape") {
        event.preventDefault();
        handleTipKey("clear");
      }
      return;
    }

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      pressDigit(event.key);
    } else if (event.key === ".") {
      event.preventDefault();
      pressDecimal();
    } else if (event.key === "Backspace") {
      event.preventDefault();
      backspace();
    } else if (event.key === "Enter" || event.key === "=") {
      event.preventDefault();
      pressEquals();
    } else if (event.key === "+") {
      event.preventDefault();
      pressOperator("+");
    } else if (event.key === "-") {
      event.preventDefault();
      pressOperator("−");
    } else if (event.key === "*") {
      event.preventDefault();
      pressMultiplyChain();
    } else if (event.key === "&") {
      event.preventDefault();
      pressAmpersand();
    } else if (event.key === "/") {
      event.preventDefault();
      if (event.shiftKey) {
        pressFractionSlash();
      } else {
        pressOperator("÷");
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      resetAll();
    }
  });

  buildKeypad();
  renderHistory();
  render();
})();
