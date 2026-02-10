(() => {
  const DEFAULT_YEAR = 2026;
  const configuredYear = Number(window.OOF_TRACKER_CONFIG?.year);
  const YEAR = Number.isInteger(configuredYear) && configuredYear >= 1970 && configuredYear <= 2100
    ? configuredYear
    : DEFAULT_YEAR;
  const STORAGE_KEY = `oof-tracker:entries:${YEAR}`;
  const THEME_STORAGE_KEY = "oof-tracker:theme-mode";
  const APP_VERSION = "1.0.0";

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const calendarEl = document.getElementById("calendar");
  const monthTemplate = document.getElementById("month-template");
  const totalDaysEl = document.getElementById("total-days");
  const totalHoursEl = document.getElementById("total-hours");
  const yearLabelEl = document.getElementById("year-label");
  const exportBtn = document.getElementById("export-btn");
  const importInput = document.getElementById("import-input");
  const themeModeSelect = document.getElementById("theme-mode");
  const statusEl = document.getElementById("status");
  const rootEl = document.documentElement;
  const prefersDarkMq = window.matchMedia("(prefers-color-scheme: dark)");

  const holidays = getHolidaySet(YEAR);
  const state = {
    year: YEAR,
    entries: loadEntries()
  };

  yearLabelEl.textContent = String(YEAR);
  initializeThemeMode();
  renderYear();
  refreshTotals();
  bindControls();

  function bindControls() {
    exportBtn.addEventListener("click", exportJson);
    importInput.addEventListener("change", onImportFile);
    themeModeSelect.addEventListener("change", onThemeModeChange);
    prefersDarkMq.addEventListener("change", onSystemThemeChange);
  }

  function renderYear() {
    calendarEl.innerHTML = "";
    for (let month = 0; month < 12; month += 1) {
      calendarEl.appendChild(renderMonth(month));
    }
  }

  function renderMonth(monthIndex) {
    const fragment = monthTemplate.content.cloneNode(true);
    const monthRoot = fragment.querySelector(".month");
    const title = fragment.querySelector(".month-title");
    const grid = fragment.querySelector(".month-grid");

    title.textContent = monthNames[monthIndex];

    const firstDay = new Date(YEAR, monthIndex, 1);
    const lastDay = new Date(YEAR, monthIndex + 1, 0);

    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - firstDay.getDay());

    const gridEnd = new Date(lastDay);
    gridEnd.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

    for (const date of datesBetween(gridStart, gridEnd)) {
      const iso = toIso(date);
      const inMonth = date.getMonth() === monthIndex;
      const editable = isEditableDate(date, monthIndex);

      const cell = document.createElement("div");
      cell.className = "day-cell";
      if (!inMonth) cell.classList.add("out-of-month");
      if (!editable) cell.classList.add("disabled");
      cell.dataset.date = iso;

      const dayNumber = document.createElement("div");
      dayNumber.className = "day-number";
      dayNumber.textContent = String(date.getDate());

      const input = document.createElement("input");
      input.className = "day-input";
      input.type = "number";
      input.min = "1";
      input.max = "8";
      input.step = "1";
      input.placeholder = editable ? "" : "-";

      const current = state.entries[iso];
      if (typeof current === "number") {
        input.value = String(current);
      }

      if (editable) {
        input.addEventListener("input", () => {
          handleEntryChange(iso, input.value);
          const nextValue = state.entries[iso];
          input.value = typeof nextValue === "number" ? String(nextValue) : "";
          applyCellTone(cell, state.entries[iso]);
        });
      } else {
        input.disabled = true;
      }

      cell.appendChild(dayNumber);
      cell.appendChild(input);
      grid.appendChild(cell);

      applyCellTone(cell, current);
    }

    return monthRoot;
  }

  function handleEntryChange(iso, raw) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      delete state.entries[iso];
      persistEntries();
      refreshTotals();
      setStatus("Saved.");
      return;
    }

    const num = Number(trimmed);
    if (!Number.isInteger(num)) {
      return;
    }

    const clamped = Math.max(1, Math.min(8, num));
    state.entries[iso] = clamped;
    persistEntries();
    refreshTotals();
    setStatus("Saved.");
  }

  function refreshTotals() {
    const totalHours = Object.values(state.entries).reduce((sum, value) => sum + value, 0);
    const totalDays = totalHours / 8;

    totalHoursEl.textContent = String(totalHours);
    totalDaysEl.textContent = formatDays(totalDays);
  }

  function applyCellTone(cell, value) {
    cell.style.backgroundColor = "";
    cell.style.color = "";

    if (typeof value !== "number") {
      return;
    }

    const t = value / 8;
    const lightness = 97 - t * 38;
    const saturation = 68;
    cell.style.backgroundColor = `hsl(22 ${saturation}% ${lightness}%)`;

    if (value >= 7) {
      cell.style.color = "#ffffff";
    }
  }

  function persistEntries() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
  }

  function loadEntries() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }

      const cleaned = {};
      for (const [date, value] of Object.entries(parsed)) {
        if (!isValidIsoDate(date, YEAR)) continue;
        if (!Number.isInteger(value) || value < 1 || value > 8) continue;
        if (!isEditableIso(date)) continue;
        cleaned[date] = value;
      }
      return cleaned;
    } catch {
      return {};
    }
  }

  function exportJson() {
    const exportObj = {
      app: "oof-tracker",
      version: APP_VERSION,
      year: YEAR,
      exportedAt: new Date().toISOString(),
      entries: state.entries
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oof-tracker-${YEAR}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("Export complete.");
  }

  async function onImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedEntries = validateImport(parsed);
      const shouldReplace = window.confirm(`Replace existing entries for ${YEAR} with imported data?`);

      if (!shouldReplace) {
        setStatus("Import canceled.");
        importInput.value = "";
        return;
      }

      state.entries = importedEntries;
      persistEntries();
      renderYear();
      refreshTotals();
      setStatus("Import complete.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      setStatus(message);
    } finally {
      importInput.value = "";
    }
  }

  function validateImport(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Import failed: JSON root must be an object.");
    }

    if (payload.year !== YEAR) {
      throw new Error(`Import failed: file year must be ${YEAR}.`);
    }

    if (!payload.entries || typeof payload.entries !== "object" || Array.isArray(payload.entries)) {
      throw new Error("Import failed: missing entries object.");
    }

    const cleaned = {};
    for (const [date, value] of Object.entries(payload.entries)) {
      if (!isValidIsoDate(date, YEAR)) {
        throw new Error(`Import failed: invalid date ${date}.`);
      }
      if (!Number.isInteger(value) || value < 1 || value > 8) {
        throw new Error(`Import failed: invalid hours for ${date}.`);
      }
      if (!isEditableIso(date)) {
        throw new Error(`Import failed: ${date} is not an editable workday.`);
      }
      cleaned[date] = value;
    }

    return cleaned;
  }

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function initializeThemeMode() {
    const savedMode = localStorage.getItem(THEME_STORAGE_KEY);
    const mode = isValidThemeMode(savedMode) ? savedMode : "auto";
    themeModeSelect.value = mode;
    applyThemeMode(mode);
  }

  function onThemeModeChange() {
    const mode = themeModeSelect.value;
    if (!isValidThemeMode(mode)) return;
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    applyThemeMode(mode);
    setStatus(`Theme set to ${mode}.`);
  }

  function onSystemThemeChange() {
    if (themeModeSelect.value === "auto") {
      applyThemeMode("auto");
    }
  }

  function applyThemeMode(mode) {
    if (mode === "auto") {
      rootEl.setAttribute("data-theme", prefersDarkMq.matches ? "dark" : "light");
      return;
    }
    rootEl.setAttribute("data-theme", mode);
  }

  function isValidThemeMode(value) {
    return value === "auto" || value === "light" || value === "dark";
  }

  function toIso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function* datesBetween(start, end) {
    const cursor = new Date(start);
    while (cursor <= end) {
      yield new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  function formatDays(value) {
    return Number(value.toFixed(3)).toString();
  }

  function isValidIsoDate(iso, year) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return false;

    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (y !== year) return false;

    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }

  function isEditableIso(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return isEditableDate(date, month - 1);
  }

  function isEditableDate(date, monthIndexForGrid) {
    const inMonth = date.getMonth() === monthIndexForGrid;
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const holiday = holidays.has(toIso(date));
    return inMonth && !weekend && !holiday;
  }

  function getHolidaySet(year) {
    const set = new Set();

    const fixedHolidays = [
      new Date(year, 0, 1),
      new Date(year, 6, 4),
      new Date(year, 11, 24),
      new Date(year, 11, 25)
    ];

    fixedHolidays.forEach((date) => {
      set.add(toIso(date));
      const observed = getObservedDate(date);
      if (observed) set.add(toIso(observed));
    });

    set.add(toIso(nthWeekdayOfMonth(year, 0, 1, 3)));
    set.add(toIso(nthWeekdayOfMonth(year, 1, 1, 3)));
    set.add(toIso(lastWeekdayOfMonth(year, 4, 1)));
    set.add(toIso(nthWeekdayOfMonth(year, 8, 1, 1)));

    const thanksgiving = nthWeekdayOfMonth(year, 10, 4, 4);
    const dayAfterThanksgiving = new Date(thanksgiving);
    dayAfterThanksgiving.setDate(thanksgiving.getDate() + 1);
    set.add(toIso(dayAfterThanksgiving));

    return set;
  }

  function getObservedDate(date) {
    const day = date.getDay();
    if (day === 6) {
      const observed = new Date(date);
      observed.setDate(date.getDate() - 1);
      return observed;
    }
    if (day === 0) {
      const observed = new Date(date);
      observed.setDate(date.getDate() + 1);
      return observed;
    }
    return null;
  }

  function nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
    const first = new Date(year, monthIndex, 1);
    const offset = (7 + weekday - first.getDay()) % 7;
    return new Date(year, monthIndex, 1 + offset + (nth - 1) * 7);
  }

  function lastWeekdayOfMonth(year, monthIndex, weekday) {
    const last = new Date(year, monthIndex + 1, 0);
    const offset = (7 + last.getDay() - weekday) % 7;
    return new Date(year, monthIndex, last.getDate() - offset);
  }
})();
