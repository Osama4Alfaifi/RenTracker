import { login, logout, watchAuthState } from "./auth.js";
import {
  getBuildings,
  getUnits,
  getMonthRows,
  savePayment,
  getUnitHistory,
  addUnit,
  updateUnit,
  seedInitialData,
  hasAnyBuildings,
} from "./db.js";

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const METHOD_LABELS = { cash: "كاش", deposit: "إيداع مباشر", ejar: "إيجار (ejar)" };

const today = new Date();
const state = {
  year: today.getFullYear(),
  month: today.getMonth() + 1,
  buildings: [],
  rowsByUnitId: new Map(), // unitId -> payment object currently shown
};

// ---------------- Auth wiring ----------------

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userEmailEl = document.getElementById("user-email");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    await login(email, password);
  } catch (err) {
    loginError.textContent = `تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور. (${err.code || err.message})`;
    loginError.hidden = false;
  }
});

document.getElementById("logout-btn").addEventListener("click", () => logout());

watchAuthState(
  (user) => {
    loginView.hidden = true;
    appView.hidden = false;
    userEmailEl.textContent = user.email || "";
    initDashboard();
  },
  () => {
    loginView.hidden = false;
    appView.hidden = true;
  }
);

// ---------------- Tabs ----------------

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `${tab}-tab`));
  if (tab === "dashboard") initDashboard();
  if (tab === "history") loadHistoryTab();
  if (tab === "units") loadUnitsAdminTab();
}

// ---------------- Dashboard ----------------

const seedBanner = document.getElementById("seed-banner");
const monthLabel = document.getElementById("month-label");
const summaryBar = document.getElementById("summary-bar");
const buildingsContainer = document.getElementById("buildings-container");

document.getElementById("seed-btn").addEventListener("click", async () => {
  await seedInitialData();
  await initDashboard();
});

document.getElementById("prev-month").addEventListener("click", () => changeMonth(-1));
document.getElementById("next-month").addEventListener("click", () => changeMonth(1));

function changeMonth(delta) {
  state.month += delta;
  if (state.month < 1) {
    state.month = 12;
    state.year -= 1;
  } else if (state.month > 12) {
    state.month = 1;
    state.year += 1;
  }
  renderDashboard();
}

async function initDashboard() {
  const hasData = await hasAnyBuildings();
  seedBanner.hidden = hasData;
  if (!hasData) {
    monthLabel.textContent = "";
    summaryBar.innerHTML = "";
    buildingsContainer.innerHTML = "";
    return;
  }
  state.buildings = await getBuildings();
  await renderDashboard();
}

async function renderDashboard() {
  monthLabel.textContent = `${ARABIC_MONTHS[state.month - 1]} ${state.year}`;
  state.rowsByUnitId.clear();
  buildingsContainer.innerHTML = "";

  for (const building of state.buildings) {
    const units = await getUnits(building.id);
    const rows = await getMonthRows(units, state.year, state.month);

    const section = document.createElement("div");
    section.className = "building-section";
    section.innerHTML = `
      <h2>${building.name}</h2>
      <table class="unit-table">
        <thead>
          <tr>
            <th>الوحدة</th><th>المستأجر</th><th>الإيجار</th><th>الحالة</th>
            <th>طريقة الدفع</th><th>تاريخ الدفع</th><th>ملاحظات</th><th></th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    const tbody = section.querySelector("tbody");

    for (const row of rows) {
      state.rowsByUnitId.set(row.unit.id, row.payment);
      tbody.appendChild(buildUnitRow(row.unit, row.payment));
    }

    buildingsContainer.appendChild(section);
  }

  renderSummaryBar();
}

function renderSummaryBar() {
  let totalUnits = 0, paidCount = 0, totalDue = 0, totalCollected = 0;
  for (const payment of state.rowsByUnitId.values()) {
    totalUnits += 1;
    totalDue += Number(payment.rentDue) || 0;
    if (payment.status === "paid") {
      paidCount += 1;
      totalCollected += Number(payment.rentDue) || 0;
    }
  }

  summaryBar.innerHTML = `
    <div class="summary-chip"><span class="value">${totalUnits}</span><span class="label">إجمالي الوحدات</span></div>
    <div class="summary-chip"><span class="value">${paidCount}</span><span class="label">تم الدفع</span></div>
    <div class="summary-chip"><span class="value">${totalUnits - paidCount}</span><span class="label">لم يُدفع</span></div>
    <div class="summary-chip"><span class="value">${totalCollected.toLocaleString("ar")}</span><span class="label">إجمالي المُحصّل</span></div>
    <div class="summary-chip"><span class="value">${totalDue.toLocaleString("ar")}</span><span class="label">إجمالي المستحق</span></div>
  `;
}

function buildUnitRow(unit, payment) {
  const tr = document.createElement("tr");
  tr.dataset.unitId = unit.id;
  const isPaid = payment.status === "paid";

  tr.innerHTML = `
    <td data-label="الوحدة">${unit.label} <span style="color:var(--muted)">(${unit.type})</span></td>
    <td data-label="المستأجر"><input type="text" data-field="tenantName" value="${escapeAttr(payment.tenantName || "")}" /></td>
    <td data-label="الإيجار"><input type="number" data-field="rentDue" value="${payment.rentDue ?? 0}" min="0" /></td>
    <td data-label="الحالة">
      <button type="button" class="status-toggle ${isPaid ? "paid" : "unpaid"}" data-role="status-toggle">
        ${isPaid ? "مدفوع" : "غير مدفوع"}
      </button>
    </td>
    <td data-label="طريقة الدفع">
      <select data-field="method" class="method-field ${isPaid ? "visible" : ""}">
        <option value="">اختر</option>
        <option value="cash" ${payment.method === "cash" ? "selected" : ""}>كاش</option>
        <option value="deposit" ${payment.method === "deposit" ? "selected" : ""}>إيداع مباشر</option>
        <option value="ejar" ${payment.method === "ejar" ? "selected" : ""}>إيجار (ejar)</option>
      </select>
    </td>
    <td data-label="تاريخ الدفع">
      <input type="date" data-field="paidDate" class="date-field ${isPaid ? "visible" : ""}" value="${payment.paidDate || ""}" />
    </td>
    <td data-label="ملاحظات"><input type="text" data-field="notes" value="${escapeAttr(payment.notes || "")}" /></td>
    <td data-label=""><span class="save-indicator" data-role="save-indicator">✓ حُفظ</span></td>
  `;
  return tr;
}

buildingsContainer.addEventListener("change", (e) => {
  const field = e.target.dataset.field;
  if (!field) return;
  const tr = e.target.closest("tr");
  const unitId = tr.dataset.unitId;
  const payment = state.rowsByUnitId.get(unitId);
  if (!payment) return;

  if (field === "rentDue") payment.rentDue = Number(e.target.value) || 0;
  else payment[field] = e.target.value;

  saveRow(tr, payment);
});

buildingsContainer.addEventListener("click", (e) => {
  if (e.target.dataset.role !== "status-toggle") return;
  const tr = e.target.closest("tr");
  const unitId = tr.dataset.unitId;
  const payment = state.rowsByUnitId.get(unitId);
  if (!payment) return;

  payment.status = payment.status === "paid" ? "unpaid" : "paid";
  const isPaid = payment.status === "paid";
  e.target.classList.toggle("paid", isPaid);
  e.target.classList.toggle("unpaid", !isPaid);
  e.target.textContent = isPaid ? "مدفوع" : "غير مدفوع";
  tr.querySelector('[data-field="method"]').classList.toggle("visible", isPaid);
  tr.querySelector('[data-field="paidDate"]').classList.toggle("visible", isPaid);
  if (isPaid && !payment.paidDate) {
    const todayStr = new Date().toISOString().slice(0, 10);
    payment.paidDate = todayStr;
    tr.querySelector('[data-field="paidDate"]').value = todayStr;
  }

  saveRow(tr, payment);
});

async function saveRow(tr, payment) {
  await savePayment(payment);
  renderSummaryBar();
  const indicator = tr.querySelector('[data-role="save-indicator"]');
  indicator.classList.add("show");
  setTimeout(() => indicator.classList.remove("show"), 1200);
}

function escapeAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// ---------------- History ----------------

const historyBuildingSelect = document.getElementById("history-building-select");
const historyUnitSelect = document.getElementById("history-unit-select");
const historyResults = document.getElementById("history-results");

async function loadHistoryTab() {
  if (!state.buildings.length) state.buildings = await getBuildings();
  historyBuildingSelect.innerHTML = state.buildings
    .map((b) => `<option value="${b.id}">${b.name}</option>`)
    .join("");
  if (state.buildings.length) await loadHistoryUnits(state.buildings[0].id);
}

historyBuildingSelect.addEventListener("change", (e) => loadHistoryUnits(e.target.value));
historyUnitSelect.addEventListener("change", (e) => renderHistory(e.target.value));

async function loadHistoryUnits(buildingId) {
  const units = await getUnits(buildingId);
  historyUnitSelect.innerHTML = units.map((u) => `<option value="${u.id}">${u.label} (${u.type})</option>`).join("");
  if (units.length) await renderHistory(units[0].id);
  else historyResults.innerHTML = "";
}

async function renderHistory(unitId) {
  const records = await getUnitHistory(unitId);
  if (!records.length) {
    historyResults.innerHTML = `<p style="color:var(--muted)">لا يوجد سجل مدفوعات لهذه الوحدة بعد.</p>`;
    return;
  }
  historyResults.innerHTML = records
    .map((r) => {
      const isPaid = r.status === "paid";
      return `
        <div class="history-row">
          <span class="month">${ARABIC_MONTHS[r.month - 1]} ${r.year}</span>
          <span class="tenant">${r.tenantName || "—"}</span>
          <span class="status-toggle ${isPaid ? "paid" : "unpaid"}">${isPaid ? "مدفوع" : "غير مدفوع"}</span>
          <span>${r.rentDue ?? 0}</span>
          <span>${isPaid ? METHOD_LABELS[r.method] || "—" : "—"}</span>
          <span>${r.paidDate || "—"}</span>
          <span style="color:var(--muted)">${r.notes || ""}</span>
        </div>
      `;
    })
    .join("");
}

// ---------------- Units admin ----------------

const unitsAdminContainer = document.getElementById("units-admin-container");

async function loadUnitsAdminTab() {
  if (!state.buildings.length) state.buildings = await getBuildings();
  unitsAdminContainer.innerHTML = "";

  for (const building of state.buildings) {
    const units = await getUnits(building.id);
    const section = document.createElement("div");
    section.className = "units-admin-building";
    section.innerHTML = `
      <h2>${building.name}</h2>
      <div data-role="unit-rows"></div>
      <div class="unit-admin-row" data-role="add-row">
        <input type="text" placeholder="اسم الوحدة (مثال: غرفة 16)" data-new="label" />
        <select data-new="type">
          <option value="غرفة عزاب">غرفة عزاب</option>
          <option value="محل">محل</option>
        </select>
        <input type="number" placeholder="الإيجار" data-new="rentAmount" min="0" />
        <span></span>
        <button type="button" data-role="add-unit-btn">إضافة</button>
      </div>
    `;

    const rowsContainer = section.querySelector('[data-role="unit-rows"]');
    units.forEach((unit) => rowsContainer.appendChild(buildUnitAdminRow(unit)));

    section.querySelector('[data-role="add-unit-btn"]').addEventListener("click", async () => {
      const labelInput = section.querySelector('[data-new="label"]');
      const typeSelect = section.querySelector('[data-new="type"]');
      const rentInput = section.querySelector('[data-new="rentAmount"]');
      const label = labelInput.value.trim();
      if (!label) return;
      await addUnit({
        buildingId: building.id,
        label,
        type: typeSelect.value,
        rentAmount: Number(rentInput.value) || 0,
        unitNumber: units.length + 1,
        order: units.length + 1,
      });
      labelInput.value = "";
      rentInput.value = "";
      await loadUnitsAdminTab();
    });

    unitsAdminContainer.appendChild(section);
  }
}

function buildUnitAdminRow(unit) {
  const row = document.createElement("div");
  row.className = "unit-admin-row";
  row.dataset.unitId = unit.id;
  row.innerHTML = `
    <input type="text" data-field="label" value="${escapeAttr(unit.label)}" />
    <select data-field="type">
      <option value="غرفة عزاب" ${unit.type === "غرفة عزاب" ? "selected" : ""}>غرفة عزاب</option>
      <option value="محل" ${unit.type === "محل" ? "selected" : ""}>محل</option>
    </select>
    <input type="number" data-field="rentAmount" value="${unit.rentAmount ?? 0}" min="0" />
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
      <input type="checkbox" data-field="active" ${unit.active ? "checked" : ""} /> فعّالة
    </label>
    <span></span>
  `;
  row.addEventListener("change", async (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    const value = field === "active" ? e.target.checked
      : field === "rentAmount" ? Number(e.target.value) || 0
      : e.target.value;
    await updateUnit(unit.id, { [field]: value });
  });
  return row;
}
