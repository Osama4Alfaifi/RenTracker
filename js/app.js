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
  getActiveTenancy,
  getTenancyHistory,
  startTenancy,
  endTenancy,
  updateTenancy,
  computeStatus,
} from "./db.js";

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const TRANSFER_METHOD_LABELS = { deposit: "إيداع مباشر", ejar: "إيجار (ejar)" };
const STATUS_LABELS = { paid: "مدفوع بالكامل", partial: "دفع جزئي", unpaid: "غير مدفوع" };

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
            <th>الوحدة</th><th>المستأجر</th><th>الإيجار</th><th>كاش</th><th>تحويل</th>
            <th>نوع التحويل</th><th>المتأخر</th><th>الحالة</th><th>تاريخ الدفع</th><th>ملاحظات</th><th></th>
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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function renderSummaryBar() {
  let totalUnits = 0, paidCount = 0, partialCount = 0, totalDue = 0, totalCollected = 0, totalOutstanding = 0;
  for (const payment of state.rowsByUnitId.values()) {
    totalUnits += 1;
    totalDue += Number(payment.rentDue) || 0;
    totalCollected += (Number(payment.cashAmount) || 0) + (Number(payment.transferAmount) || 0);
    totalOutstanding += Number(payment.outstanding) || 0;
    if (payment.status === "paid") paidCount += 1;
    else if (payment.status === "partial") partialCount += 1;
  }

  summaryBar.innerHTML = `
    <div class="summary-chip"><span class="value">${totalUnits}</span><span class="label">إجمالي الوحدات</span></div>
    <div class="summary-chip"><span class="value">${paidCount}</span><span class="label">مدفوع بالكامل</span></div>
    <div class="summary-chip"><span class="value">${partialCount}</span><span class="label">دفع جزئي</span></div>
    <div class="summary-chip"><span class="value">${totalUnits - paidCount - partialCount}</span><span class="label">لم يُدفع</span></div>
    <div class="summary-chip"><span class="value">${totalCollected.toLocaleString("ar")}</span><span class="label">إجمالي المُحصّل</span></div>
    <div class="summary-chip"><span class="value">${totalOutstanding.toLocaleString("ar")}</span><span class="label">إجمالي المتأخر</span></div>
  `;
}

function buildUnitRow(unit, payment) {
  const tr = document.createElement("tr");
  tr.dataset.unitId = unit.id;

  tr.innerHTML = `
    <td data-label="الوحدة">${unit.label} <span style="color:var(--muted)">(${unit.type})</span></td>
    <td data-label="المستأجر">
      ${escapeAttr(payment.tenantName || "شاغرة")}
      ${payment.tenantPhone ? `<br><span style="color:var(--muted);font-size:12px">جوال: ${escapeAttr(payment.tenantPhone)}</span>` : ""}
      ${payment.guarantorName ? `<br><span style="color:var(--muted);font-size:12px">كفيل: ${escapeAttr(payment.guarantorName)}${payment.guarantorPhone ? " - " + escapeAttr(payment.guarantorPhone) : ""}</span>` : ""}
    </td>
    <td data-label="الإيجار"><input type="number" data-field="rentDue" value="${payment.rentDue ?? 0}" min="0" /></td>
    <td data-label="كاش"><input type="number" data-field="cashAmount" value="${payment.cashAmount ?? 0}" min="0" /></td>
    <td data-label="تحويل"><input type="number" data-field="transferAmount" value="${payment.transferAmount ?? 0}" min="0" /></td>
    <td data-label="نوع التحويل">
      <select data-field="transferMethod" class="method-field ${payment.transferAmount > 0 ? "visible" : ""}">
        <option value="">اختر</option>
        <option value="deposit" ${payment.transferMethod === "deposit" ? "selected" : ""}>إيداع مباشر</option>
        <option value="ejar" ${payment.transferMethod === "ejar" ? "selected" : ""}>إيجار (ejar)</option>
      </select>
    </td>
    <td data-label="المتأخر" data-role="outstanding" style="color:${payment.outstanding > 0 ? "var(--unpaid)" : "var(--muted)"}">${(payment.outstanding ?? 0).toLocaleString("ar")}</td>
    <td data-label="الحالة"><span class="status-toggle ${payment.status}" data-role="status-badge">${STATUS_LABELS[payment.status]}</span></td>
    <td data-label="تاريخ الدفع">
      <input type="date" data-field="paidDate" class="date-field ${payment.status !== "unpaid" ? "visible" : ""}" value="${payment.paidDate || ""}" />
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

  if (field === "rentDue" || field === "cashAmount" || field === "transferAmount") {
    payment[field] = Number(e.target.value) || 0;
  } else {
    payment[field] = e.target.value;
  }

  const { status, outstanding } = computeStatus(payment.rentDue, payment.cashAmount, payment.transferAmount);
  payment.status = status;
  payment.outstanding = outstanding;
  if (status !== "unpaid" && !payment.paidDate) payment.paidDate = todayStr();

  tr.querySelector('[data-field="transferMethod"]').classList.toggle("visible", payment.transferAmount > 0);
  tr.querySelector('[data-field="paidDate"]').classList.toggle("visible", status !== "unpaid");
  tr.querySelector('[data-field="paidDate"]').value = payment.paidDate || "";
  const badge = tr.querySelector('[data-role="status-badge"]');
  badge.className = `status-toggle ${status}`;
  badge.textContent = STATUS_LABELS[status];
  const outstandingCell = tr.querySelector('[data-role="outstanding"]');
  outstandingCell.textContent = outstanding.toLocaleString("ar");
  outstandingCell.style.color = outstanding > 0 ? "var(--unpaid)" : "var(--muted)";

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
const historyTenancyResults = document.getElementById("history-tenancy-results");

async function loadHistoryTab() {
  if (!state.buildings.length) state.buildings = await getBuildings();
  historyBuildingSelect.innerHTML = state.buildings
    .map((b) => `<option value="${b.id}">${b.name}</option>`)
    .join("");
  if (state.buildings.length) await loadHistoryUnits(state.buildings[0].id);
}

historyBuildingSelect.addEventListener("change", (e) => loadHistoryUnits(e.target.value));
historyUnitSelect.addEventListener("change", (e) => {
  renderHistory(e.target.value);
  renderTenancyHistory(e.target.value);
});

async function loadHistoryUnits(buildingId) {
  const units = await getUnits(buildingId);
  historyUnitSelect.innerHTML = units.map((u) => `<option value="${u.id}">${u.label} (${u.type})</option>`).join("");
  if (units.length) {
    await renderHistory(units[0].id);
    await renderTenancyHistory(units[0].id);
  } else {
    historyResults.innerHTML = "";
    historyTenancyResults.innerHTML = "";
  }
}

async function renderHistory(unitId) {
  const records = await getUnitHistory(unitId);
  if (!records.length) {
    historyResults.innerHTML = `<p style="color:var(--muted)">لا يوجد سجل مدفوعات لهذه الوحدة بعد.</p>`;
    return;
  }
  historyResults.innerHTML = records
    .map((r) => {
      const transferLabel = r.transferAmount > 0 ? TRANSFER_METHOD_LABELS[r.transferMethod] || "تحويل" : null;
      return `
        <div class="history-row">
          <span class="month">${ARABIC_MONTHS[r.month - 1]} ${r.year}</span>
          <span class="tenant">${r.tenantName || "—"}</span>
          <span class="status-toggle ${r.status}">${STATUS_LABELS[r.status] || r.status}</span>
          <span>الإيجار: ${r.rentDue ?? 0}</span>
          <span>كاش: ${r.cashAmount ?? 0}</span>
          <span>${transferLabel ? `${transferLabel}: ${r.transferAmount}` : "بدون تحويل"}</span>
          <span>المتأخر: ${r.outstanding ?? 0}</span>
          <span>${r.paidDate || "—"}</span>
          <span style="color:var(--muted)">${r.notes || ""}</span>
        </div>
      `;
    })
    .join("");
}

async function renderTenancyHistory(unitId) {
  const tenancies = await getTenancyHistory(unitId);
  if (!tenancies.length) {
    historyTenancyResults.innerHTML = `<p style="color:var(--muted)">لا يوجد سجل مستأجرين لهذه الوحدة بعد.</p>`;
    return;
  }
  historyTenancyResults.innerHTML = tenancies
    .map(
      (t) => `
        <div class="history-row">
          <span class="month">${t.moveInDate || "—"} ← ${t.moveOutDate || "حتى الآن"}</span>
          <span class="tenant">${escapeAttr(t.tenantName || "—")}</span>
          <span>${t.tenantPhone ? `جوال المستأجر: ${escapeAttr(t.tenantPhone)}` : ""}</span>
          <span>${t.guarantorName ? `الكفيل: ${escapeAttr(t.guarantorName)}` : ""}</span>
          <span>${t.guarantorPhone ? `جوال الكفيل: ${escapeAttr(t.guarantorPhone)}` : ""}</span>
          <span>الإيجار: ${t.rentAmount ?? 0}</span>
        </div>
      `
    )
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
    for (const unit of units) {
      rowsContainer.appendChild(await buildUnitAdminRow(unit));
    }

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

function field(label, inputHtml) {
  return `<span class="tfield-group"><span class="tfield-label">${label}</span>${inputHtml}</span>`;
}

async function buildUnitAdminRow(unit) {
  const wrapper = document.createElement("div");

  const row = document.createElement("div");
  row.className = "unit-admin-row";
  row.dataset.unitId = unit.id;
  row.innerHTML = `
    <span>${escapeAttr(unit.label)}</span>
    <span style="color:var(--muted)">${escapeAttr(unit.type)}</span>
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
  wrapper.appendChild(row);

  const tenancy = await getActiveTenancy(unit.id);
  const tenancyBlock = document.createElement("div");
  tenancyBlock.className = "tenancy-block";

  if (tenancy) {
    tenancyBlock.innerHTML = `
      ${field("اسم المستأجر", `<input type="text" data-tfield="tenantName" value="${escapeAttr(tenancy.tenantName || "")}" />`)}
      ${field("جوال المستأجر", `<input type="text" data-tfield="tenantPhone" value="${escapeAttr(tenancy.tenantPhone || "")}" />`)}
      ${field("اسم الكفيل", `<input type="text" data-tfield="guarantorName" value="${escapeAttr(tenancy.guarantorName || "")}" />`)}
      ${field("رقم هوية الكفيل", `<input type="text" data-tfield="guarantorIdNumber" value="${escapeAttr(tenancy.guarantorIdNumber || "")}" />`)}
      ${field("جوال الكفيل", `<input type="text" data-tfield="guarantorPhone" value="${escapeAttr(tenancy.guarantorPhone || "")}" />`)}
      ${field("تاريخ التأجير (بداية السكن)", `<span style="font-size:13px">${tenancy.moveInDate || "—"}</span>`)}
      ${field("تاريخ الخروج (عند الإنهاء)", `<input type="date" data-role="move-out-date" value="${todayStr()}" />`)}
      <button type="button" data-role="end-tenancy-btn">تسجيل الخروج</button>
    `;
    tenancyBlock.addEventListener("change", async (e) => {
      const field = e.target.dataset.tfield;
      if (!field) return;
      await updateTenancy(tenancy.id, { [field]: e.target.value });
    });
    tenancyBlock.querySelector('[data-role="end-tenancy-btn"]').addEventListener("click", async () => {
      const moveOutDate = tenancyBlock.querySelector('[data-role="move-out-date"]').value || todayStr();
      await endTenancy(tenancy.id, moveOutDate);
      await loadUnitsAdminTab();
    });
  } else {
    tenancyBlock.innerHTML = `
      <span style="font-size:13px;color:var(--muted);flex-basis:100%">شاغرة — لا يوجد مستأجر حاليًا</span>
      ${field("اسم المستأجر", `<input type="text" data-nt="tenantName" />`)}
      ${field("جوال المستأجر", `<input type="text" data-nt="tenantPhone" />`)}
      ${field("اسم الكفيل", `<input type="text" data-nt="guarantorName" />`)}
      ${field("رقم هوية الكفيل", `<input type="text" data-nt="guarantorIdNumber" />`)}
      ${field("جوال الكفيل", `<input type="text" data-nt="guarantorPhone" />`)}
      ${field("تاريخ التأجير (بداية السكن)", `<input type="date" data-nt="moveInDate" value="${todayStr()}" />`)}
      ${field("الإيجار الشهري", `<input type="number" data-nt="rentAmount" value="${unit.rentAmount ?? 0}" min="0" />`)}
      <button type="button" data-role="start-tenancy-btn">تسجيل مستأجر جديد</button>
    `;
    tenancyBlock.querySelector('[data-role="start-tenancy-btn"]').addEventListener("click", async () => {
      const get = (field) => tenancyBlock.querySelector(`[data-nt="${field}"]`).value;
      const tenantName = get("tenantName").trim();
      if (!tenantName) return;
      await startTenancy({
        unitId: unit.id,
        buildingId: unit.buildingId,
        tenantName,
        tenantPhone: get("tenantPhone"),
        guarantorName: get("guarantorName"),
        guarantorIdNumber: get("guarantorIdNumber"),
        guarantorPhone: get("guarantorPhone"),
        moveInDate: get("moveInDate") || todayStr(),
        rentAmount: Number(get("rentAmount")) || 0,
      });
      await loadUnitsAdminTab();
    });
  }
  wrapper.appendChild(tenancyBlock);

  return wrapper;
}
