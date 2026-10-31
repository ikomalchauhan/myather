/* Rizta Dash — client logic.
   Reads two optional sources the user connects themselves:
   1) A published-to-web CSV export of their ev_log_bot ride-log sheet.
   2) A JSON status endpoint on their own ether-dash instance (optional,
      since ether-dash's API shape isn't publicly documented — the user
      supplies the exact path if they have one).
   Nothing here talks to Ather directly. */

const LS_KEY = "rizta-dash-settings-v1";

const els = {
  settingsBtn: document.getElementById("settingsBtn"),
  sheetBackdrop: document.getElementById("sheetBackdrop"),
  cancelBtn: document.getElementById("cancelBtn"),
  saveBtn: document.getElementById("saveBtn"),
  sheetUrl: document.getElementById("sheetUrl"),
  dashUrl: document.getElementById("dashUrl"),
  settingsStatus: document.getElementById("settingsStatus"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  batteryVal: document.getElementById("batteryVal"),
  batteryBar: document.getElementById("batteryBar"),
  chargeState: document.getElementById("chargeState"),
  rangeVal: document.getElementById("rangeVal"),
  rangeSub: document.getElementById("rangeSub"),
  odoVal: document.getElementById("odoVal"),
  odoSub: document.getElementById("odoSub"),
  chart: document.getElementById("chart"),
  chartMeta: document.getElementById("chartMeta"),
  logList: document.getElementById("logList"),
  logMeta: document.getElementById("logMeta"),
};

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveSettings(s) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* private mode / storage blocked — still works for this session */
  }
}

function openSheet() {
  const s = loadSettings();
  els.sheetUrl.value = s.sheetUrl || "";
  els.dashUrl.value = s.dashUrl || "";
  els.settingsStatus.textContent = "";
  els.settingsStatus.className = "status-msg";
  els.sheetBackdrop.hidden = false;
}
function closeSheet() {
  els.sheetBackdrop.hidden = true;
}
els.settingsBtn.addEventListener("click", openSheet);
els.cancelBtn.addEventListener("click", closeSheet);
els.sheetBackdrop.addEventListener("click", (e) => {
  if (e.target === els.sheetBackdrop) closeSheet();
});

els.saveBtn.addEventListener("click", async () => {
  const s = {
    sheetUrl: els.sheetUrl.value.trim(),
    dashUrl: els.dashUrl.value.trim(),
  };
  saveSettings(s);
  els.settingsStatus.className = "status-msg";
  els.settingsStatus.textContent = "Loading…";
  try {
    await refreshAll(s);
    els.settingsStatus.className = "status-msg ok";
    els.settingsStatus.textContent = "Connected. Dashboard updated.";
    setTimeout(closeSheet, 700);
  } catch (err) {
    els.settingsStatus.className = "status-msg err";
    els.settingsStatus.textContent = err.message || "Could not load that source — check the URL and try again.";
  }
});

/* ---------- CSV parsing (minimal, handles quoted commas) ---------- */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, idx) => (obj[h] = (r[idx] || "").trim()));
    return obj;
  });
}

function pick(obj, ...keys) {
  for (const k of keys) {
    const hit = Object.keys(obj).find((key) => key.includes(k));
    if (hit && obj[hit] !== "") return obj[hit];
  }
  return "";
}
function num(v) {
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/* ---------- data fetch ---------- */
async function fetchSheetRides(sheetUrl) {
  if (!sheetUrl) return null;
  const res = await fetch(sheetUrl, { cache: "no-store" });
  if (!res.ok) throw new Error("Sheet link didn't load (HTTP " + res.status + "). Re-check the published CSV link.");
  const text = await res.text();
  if (/<html/i.test(text.slice(0, 200))) {
    throw new Error("That link returned a webpage, not CSV. Use the 'Publish to web → CSV' link, not the normal share link.");
  }
  const rows = parseCSV(text);
  const rides = rows
    .map((r) => ({
      date: pick(r, "date", "time"),
      distance: num(pick(r, "distance", "trip", "km", "mileage")),
      odo: num(pick(r, "odo", "odometer", "total")),
      whPerKm: num(pick(r, "wh/km", "whperkm", "efficiency", "consumption")),
    }))
    .filter((r) => r.distance !== null || r.odo !== null);
  return rides;
}

async function fetchDashStatus(dashUrl) {
  if (!dashUrl) return null;
  const base = dashUrl.replace(/\/+$/, "");
  const candidates = ["/api/status", "/api/vehicle", "/status.json", ""];
  let lastErr;
  for (const path of candidates) {
    try {
      const res = await fetch(base + path, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!res.ok) { lastErr = new Error("HTTP " + res.status); continue; }
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) { lastErr = new Error("not JSON"); continue; }
      const data = await res.json();
      return normalizeDashStatus(data);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    "Couldn't read live status from ether-dash automatically (its API isn't fixed/documented, and the browser may block cross-site requests to it). Mileage from the sheet still works — open ether-dash directly for live charging status."
  );
}
function normalizeDashStatus(data) {
  const flat = JSON.stringify(data);
  const find = (re) => {
    const m = flat.match(re);
    return m ? parseFloat(m[1]) : null;
  };
  return {
    batteryPct: find(/"(?:battery|soc)[a-z_]*"\s*:\s*(\d+(?:\.\d+)?)/i),
    rangeKm: find(/"range[a-z_]*"\s*:\s*(\d+(?:\.\d+)?)/i),
    charging: /"charg(?:e|ing)[a-z_]*"\s*:\s*true/i.test(flat),
  };
}

/* ---------- rendering ---------- */
function renderStatus(dash) {
  if (!dash) {
    els.statusDot.className = "dot off";
    els.statusText.textContent = "No live status source connected";
    return;
  }
  els.statusDot.className = dash.charging ? "dot live" : "dot stale";
  els.statusText.textContent = dash.charging ? "Charging now" : "Connected · not charging";

  if (dash.batteryPct != null) {
    els.batteryVal.textContent = Math.round(dash.batteryPct);
    els.batteryBar.style.width = Math.max(2, Math.min(100, dash.batteryPct)) + "%";
  }
  els.chargeState.innerHTML = dash.charging
    ? '<span class="pill charging">⚡ Charging</span>'
    : '<span class="pill idle">Idle</span>';

  if (dash.rangeKm != null) {
    els.rangeVal.textContent = Math.round(dash.rangeKm);
    els.rangeSub.textContent = "estimated at current battery";
  }
}

function renderOdoAndTrend(rides) {
  if (!rides || !rides.length) return;
  const withOdo = rides.filter((r) => r.odo != null);
  if (withOdo.length) {
    const latest = withOdo[withOdo.length - 1];
    els.odoVal.textContent = latest.odo.toLocaleString("en-IN");
    els.odoSub.textContent = "as of " + (latest.date || "latest ride");
  } else {
    els.odoSub.textContent = "Sheet has no odometer column yet";
  }

  const recent = rides.slice(-14);
  els.chartMeta.textContent = "last " + recent.length + " ride" + (recent.length === 1 ? "" : "s");
  drawChart(recent);

  els.logMeta.textContent = rides.length + " ride" + (rides.length === 1 ? "" : "s") + " logged";
  els.logList.innerHTML = rides
    .slice(-8)
    .reverse()
    .map(
      (r) => `
    <div class="log-row">
      <div class="glyph">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
      </div>
      <div class="main">
        <div class="title">Ride</div>
        <div class="when">${escapeHtml(r.date || "—")}</div>
      </div>
      <div class="val">${r.distance != null ? r.distance.toFixed(1) + " km" : "—"}</div>
    </div>`
    )
    .join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function drawChart(rides) {
  const W = 320, H = 120, padL = 4, padR = 4, padT = 10, padB = 18;
  const vals = rides.map((r) => r.distance).filter((v) => v != null);
  if (!vals.length) {
    els.chart.innerHTML = "";
    return;
  }
  const max = Math.max(...vals, 1);
  const n = rides.length;
  const stepX = n > 1 ? (W - padL - padR) / (n - 1) : 0;
  const y = (v) => H - padB - (v / max) * (H - padT - padB);
  const x = (i) => padL + i * stepX;

  let path = "";
  let points = [];
  rides.forEach((r, i) => {
    if (r.distance == null) return;
    const px = x(i), py = y(r.distance);
    points.push([px, py]);
    path += (path ? "L" : "M") + px.toFixed(1) + "," + py.toFixed(1);
  });

  const area = path
    ? path + ` L${points[points.length - 1][0].toFixed(1)},${(H - padB).toFixed(1)} L${points[0][0].toFixed(1)},${(H - padB).toFixed(1)} Z`
    : "";

  const dots = points
    .map(([px, py]) => `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.6" fill="var(--info)" />`)
    .join("");

  const gridLines = [0, 0.5, 1]
    .map((f) => {
      const gy = padT + f * (H - padT - padB);
      return `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`;
    })
    .join("");

  els.chart.innerHTML = `
    ${gridLines}
    <path d="${area}" fill="var(--info)" fill-opacity="0.12" stroke="none"/>
    <path d="${path}" fill="none" stroke="var(--info)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="${padL}" y="${H - 4}" font-size="9" fill="var(--fg-faint)">${escapeHtml(rides[0].date || "")}</text>
    <text x="${W - padR}" y="${H - 4}" font-size="9" fill="var(--fg-faint)" text-anchor="end">${escapeHtml(rides[rides.length - 1].date || "")}</text>
  `;
}

/* ---------- orchestration ---------- */
async function refreshAll(settings) {
  const s = settings || loadSettings();
  const tasks = [];
  let rides = null, dash = null, dashErr = null;

  if (s.sheetUrl) tasks.push(fetchSheetRides(s.sheetUrl).then((r) => (rides = r)));
  if (s.dashUrl) tasks.push(fetchDashStatus(s.dashUrl).then((d) => (dash = d)).catch((e) => (dashErr = e)));

  if (!tasks.length) return; // nothing configured yet — leave the example-empty state

  const results = await Promise.allSettled(tasks);
  renderStatus(dash);
  if (rides) renderOdoAndTrend(rides);

  const firstRejected = results.find((r) => r.status === "rejected");
  if (firstRejected && !rides) throw firstRejected.reason;
  if (dashErr && !dash) {
    els.statusText.textContent = dashErr.message;
  }
}

/* ---------- boot ---------- */
(async function init() {
  const s = loadSettings();
  if (!s.sheetUrl && !s.dashUrl) {
    openSheet(); // first run — ask for a source right away
    return;
  }
  try {
    await refreshAll(s);
  } catch {
    els.statusText.textContent = "Couldn't refresh — check Settings";
  }
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
