import { getBuildings, getUnits, getMonthRows, getBuildingHistory } from "./db.js";

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const C = {
  paid: "#15803d",
  partial: "#b45309",
  unpaid: "#dc2626",
  primary: "#4f46e5",
  accent: "#f59e0b",
  teal: "#0ea5e9",
  muted: "#9aa3b5",
  grid: "rgba(100,116,139,0.12)",
};

const today = new Date();
const anState = {
  year: today.getFullYear(),
  month: today.getMonth() + 1,
  scope: "all", // "all" or a buildingId
  buildings: [],
};

const charts = {}; // canvasId -> Chart instance

// DOM
const buildingSelect = document.getElementById("analytics-building-select");
const monthLabel = document.getElementById("an-month-label");
const kpiGrid = document.getElementById("analytics-kpis");
const emptyBox = document.getElementById("analytics-empty");
const contentBox = document.getElementById("analytics-content");
const buildingCard = document.getElementById("chart-building-card");

let wired = false;

function fmt(n) {
  return (Number(n) || 0).toLocaleString("ar-EG");
}

function ymToParts(ym) {
  const month = ((ym - 1) % 12) + 1;
  const year = Math.floor((ym - 1) / 12);
  return { year, month };
}

function monthShortLabel(ym) {
  const { year, month } = ymToParts(ym);
  return `${ARABIC_MONTHS[month - 1]} ${String(year).slice(2)}`;
}

export async function loadAnalyticsTab(buildings) {
  anState.buildings = buildings && buildings.length ? buildings : await getBuildings();

  if (!wired) {
    wired = true;
    buildingSelect.addEventListener("change", () => {
      anState.scope = buildingSelect.value;
      renderAnalytics();
    });
    document.getElementById("an-prev-month").addEventListener("click", () => shiftMonth(-1));
    document.getElementById("an-next-month").addEventListener("click", () => shiftMonth(1));
  }

  buildingSelect.innerHTML =
    `<option value="all">كل المجمعات</option>` +
    anState.buildings.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
  buildingSelect.value = anState.scope;

  await renderAnalytics();
}

function shiftMonth(delta) {
  anState.month += delta;
  if (anState.month < 1) { anState.month = 12; anState.year -= 1; }
  else if (anState.month > 12) { anState.month = 1; anState.year += 1; }
  renderAnalytics();
}

function targetBuildings() {
  return anState.scope === "all"
    ? anState.buildings
    : anState.buildings.filter((b) => b.id === anState.scope);
}

async function gatherCurrent() {
  const perBuilding = [];
  for (const b of targetBuildings()) {
    const units = await getUnits(b.id);
    const rows = await getMonthRows(units, anState.year, anState.month);
    perBuilding.push({ building: b, rows });
  }
  return perBuilding;
}

function summarize(rows) {
  const s = { units: 0, occupied: 0, paid: 0, partial: 0, unpaid: 0, due: 0, collected: 0, outstanding: 0, cash: 0, transfer: 0 };
  for (const { payment } of rows) {
    s.units += 1;
    if (payment.tenantName) s.occupied += 1;
    s.due += Number(payment.rentDue) || 0;
    const cash = Number(payment.cashAmount) || 0;
    const transfer = Number(payment.transferAmount) || 0;
    s.cash += cash;
    s.transfer += transfer;
    s.collected += cash + transfer;
    s.outstanding += Number(payment.outstanding) || 0;
    if (payment.status === "paid") s.paid += 1;
    else if (payment.status === "partial") s.partial += 1;
    else s.unpaid += 1;
  }
  return s;
}

async function gatherTrend(currentSnapshot) {
  const byYm = new Map();
  for (const b of targetBuildings()) {
    const recs = await getBuildingHistory(b.id);
    for (const r of recs) {
      const ym = r.ym ?? r.year * 12 + r.month;
      const due = Number(r.rentDue) || 0;
      const collected = (Number(r.cashAmount) || 0) + (Number(r.transferAmount) || 0);
      const cur = byYm.get(ym) || { ym, due: 0, collected: 0, outstanding: 0 };
      cur.due += due;
      cur.collected += collected;
      cur.outstanding += Math.max(0, due - collected);
      byYm.set(ym, cur);
    }
  }
  // Overlay the live current month (may be unsaved) so the trend ends on today's state.
  const curYm = anState.year * 12 + anState.month;
  byYm.set(curYm, { ym: curYm, due: currentSnapshot.due, collected: currentSnapshot.collected, outstanding: currentSnapshot.outstanding });

  return [...byYm.values()].sort((a, b) => a.ym - b.ym).slice(-12);
}

async function renderAnalytics() {
  monthLabel.textContent = `${ARABIC_MONTHS[anState.month - 1]} ${anState.year}`;

  if (typeof window.Chart === "undefined") {
    emptyBox.hidden = false;
    emptyBox.querySelector("p").textContent = "تعذر تحميل مكتبة الرسوم البيانية (تحقق من الاتصال بالإنترنت).";
    contentBox.hidden = true;
    return;
  }

  const perBuilding = await gatherCurrent();
  const allRows = perBuilding.flatMap((p) => p.rows);

  if (!allRows.length) {
    emptyBox.hidden = false;
    emptyBox.querySelector("p").textContent = "لا توجد بيانات كافية لعرض التحليلات بعد.";
    contentBox.hidden = true;
    return;
  }
  emptyBox.hidden = true;
  contentBox.hidden = false;

  const snap = summarize(allRows);
  const rate = snap.due > 0 ? Math.round((snap.collected / snap.due) * 100) : 0;
  const occPct = snap.units > 0 ? Math.round((snap.occupied / snap.units) * 100) : 0;

  renderKpis(snap, rate, occPct);
  renderStatusChart(snap);
  renderMethodChart(snap);

  const trend = await gatherTrend(snap);
  renderTrendChart(trend);
  renderRateChart(trend);
  renderBuildingsChart(perBuilding);
}

function kpiCard(icon, value, label, cls, extra = "") {
  return `
    <div class="kpi-card ${cls}">
      <div class="kpi-icon">${icon}</div>
      <div class="kpi-body">
        <span class="kpi-value">${value}</span>
        <span class="kpi-label">${label}</span>
        ${extra}
      </div>
    </div>`;
}

function renderKpis(s, rate, occPct) {
  kpiGrid.innerHTML = [
    kpiCard("٪", `${fmt(rate)}٪`, "نسبة التحصيل", "k-primary",
      `<div class="kpi-bar"><span style="width:${Math.min(100, rate)}%"></span></div>`),
    kpiCard("💰", fmt(s.collected), "إجمالي المُحصّل (ريال)", "k-paid"),
    kpiCard("⏳", fmt(s.outstanding), "إجمالي المتأخر (ريال)", "k-unpaid"),
    kpiCard("🏠", `${fmt(s.occupied)}/${fmt(s.units)}`, `نسبة الإشغال ${fmt(occPct)}٪`, "k-accent",
      `<div class="kpi-bar accent"><span style="width:${Math.min(100, occPct)}%"></span></div>`),
    kpiCard("📄", fmt(s.due), "إجمالي المستحق (ريال)", "k-teal"),
    kpiCard("✅", `${fmt(s.paid)}/${fmt(s.units)}`, "وحدات مدفوعة بالكامل", "k-paid"),
  ].join("");
}

function destroy(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function baseOpts(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { font: { family: "Segoe UI, Tahoma, sans-serif", size: 13 }, color: "#1c2333", padding: 14 } },
    },
    ...extra,
  };
}

function renderStatusChart(s) {
  destroy("chart-status");
  const ctx = document.getElementById("chart-status");
  charts["chart-status"] = new window.Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["مدفوع بالكامل", "دفع جزئي", "غير مدفوع"],
      datasets: [{ data: [s.paid, s.partial, s.unpaid], backgroundColor: [C.paid, C.partial, C.unpaid], borderWidth: 2, borderColor: "#fff" }],
    },
    options: baseOpts({ cutout: "62%", plugins: { legend: { position: "bottom", labels: { font: { size: 13 }, color: "#1c2333", padding: 14 } } } }),
  });
}

function renderMethodChart(s) {
  destroy("chart-method");
  const ctx = document.getElementById("chart-method");
  const empty = s.cash + s.transfer === 0;
  charts["chart-method"] = new window.Chart(ctx, {
    type: "doughnut",
    data: {
      labels: empty ? ["لا يوجد تحصيل"] : ["كاش", "تحويل"],
      datasets: [{ data: empty ? [1] : [s.cash, s.transfer], backgroundColor: empty ? [C.muted] : [C.accent, C.teal], borderWidth: 2, borderColor: "#fff" }],
    },
    options: baseOpts({ cutout: "62%", plugins: { legend: { position: "bottom", labels: { font: { size: 13 }, color: "#1c2333", padding: 14 } } } }),
  });
}

function renderTrendChart(trend) {
  destroy("chart-trend");
  const ctx = document.getElementById("chart-trend");
  const labels = trend.map((t) => monthShortLabel(t.ym));
  charts["chart-trend"] = new window.Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "المُحصّل", data: trend.map((t) => t.collected), backgroundColor: C.primary, borderRadius: 6, order: 2 },
        { label: "المتأخر", data: trend.map((t) => t.outstanding), backgroundColor: C.unpaid, borderRadius: 6, order: 3 },
      ],
    },
    options: baseOpts({
      plugins: { legend: { position: "bottom", labels: { color: "#1c2333", padding: 14 } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: C.muted } },
        y: { grid: { color: C.grid }, ticks: { color: C.muted }, beginAtZero: true },
      },
    }),
  });
}

function renderRateChart(trend) {
  destroy("chart-rate");
  const ctx = document.getElementById("chart-rate");
  const labels = trend.map((t) => monthShortLabel(t.ym));
  const rates = trend.map((t) => (t.due > 0 ? Math.round((t.collected / t.due) * 100) : 0));
  charts["chart-rate"] = new window.Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "نسبة التحصيل ٪",
        data: rates,
        borderColor: C.paid,
        backgroundColor: "rgba(21,128,61,0.12)",
        fill: true,
        tension: 0.35,
        pointBackgroundColor: C.paid,
        pointRadius: 4,
        borderWidth: 3,
      }],
    },
    options: baseOpts({
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: C.muted } },
        y: { grid: { color: C.grid }, ticks: { color: C.muted, callback: (v) => v + "٪" }, min: 0, max: 100 },
      },
    }),
  });
}

function renderBuildingsChart(perBuilding) {
  if (anState.scope !== "all" || perBuilding.length < 2) {
    buildingCard.hidden = true;
    destroy("chart-buildings");
    return;
  }
  buildingCard.hidden = false;
  destroy("chart-buildings");
  const ctx = document.getElementById("chart-buildings");
  const labels = perBuilding.map((p) => p.building.name);
  const collected = perBuilding.map((p) => summarize(p.rows).collected);
  const outstanding = perBuilding.map((p) => summarize(p.rows).outstanding);
  charts["chart-buildings"] = new window.Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "المُحصّل", data: collected, backgroundColor: C.primary, borderRadius: 6 },
        { label: "المتأخر", data: outstanding, backgroundColor: C.unpaid, borderRadius: 6 },
      ],
    },
    options: baseOpts({
      plugins: { legend: { position: "bottom", labels: { color: "#1c2333", padding: 14 } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: C.muted } },
        y: { grid: { color: C.grid }, ticks: { color: C.muted }, beginAtZero: true },
      },
    }),
  });
}
