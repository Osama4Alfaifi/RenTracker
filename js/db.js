import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-init.js";

const BUILDINGS = "buildings";
const UNITS = "units";
const PAYMENTS = "payments";
const TENANCIES = "tenancies";

function paymentId(unitId, year, month) {
  return `${unitId}_${year}-${month}`;
}

function toYm(year, month) {
  return year * 12 + month;
}

function prevMonth(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

// Derives paid/partial/unpaid and the remaining balance from amounts actually
// paid, instead of relying on a manually-clicked toggle.
export function computeStatus(rentDue, cashAmount, transferAmount) {
  const due = Number(rentDue) || 0;
  const paid = (Number(cashAmount) || 0) + (Number(transferAmount) || 0);
  const outstanding = Math.max(0, due - paid);
  let status;
  if (due > 0 && outstanding === 0) status = "paid";
  else if (paid > 0) status = "partial";
  else status = "unpaid";
  return { status, outstanding };
}

export async function getBuildings() {
  const snap = await getDocs(query(collection(db, BUILDINGS), orderBy("order")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getUnits(buildingId) {
  const snap = await getDocs(
    query(collection(db, UNITS), where("buildingId", "==", buildingId), orderBy("order"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPayment(unitId, year, month) {
  const snap = await getDoc(doc(db, PAYMENTS, paymentId(unitId, year, month)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getActiveTenancy(unitId) {
  const snap = await getDocs(
    query(collection(db, TENANCIES), where("unitId", "==", unitId), where("active", "==", true))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function getTenancyHistory(unitId) {
  const snap = await getDocs(
    query(collection(db, TENANCIES), where("unitId", "==", unitId), orderBy("moveInDate", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getBuildingTenancyHistory(buildingId) {
  const snap = await getDocs(
    query(collection(db, TENANCIES), where("buildingId", "==", buildingId), orderBy("moveInDate", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function startTenancy(data) {
  return addDoc(collection(db, TENANCIES), { ...data, moveOutDate: null, active: true });
}

export async function updateTenancy(tenancyId, changes) {
  return updateDoc(doc(db, TENANCIES, tenancyId), changes);
}

export async function endTenancy(tenancyId, moveOutDate) {
  return updateDoc(doc(db, TENANCIES, tenancyId), { moveOutDate, active: false });
}

// Returns one row per unit for the given month, filling in sensible
// defaults (active tenancy's info, unit's current rent, and last month's
// unpaid balance carried forward) when no payment record exists yet for
// that unit/month.
export async function getMonthRows(units, year, month) {
  const { year: py, month: pm } = prevMonth(year, month);
  const rows = [];
  for (const unit of units) {
    const existing = await getPayment(unit.id, year, month);
    if (existing) {
      rows.push({ unit, payment: existing, isNew: false });
      continue;
    }
    const previous = await getPayment(unit.id, py, pm);
    const previousOutstanding = previous
      ? computeStatus(previous.rentDue, previous.cashAmount, previous.transferAmount).outstanding
      : 0;
    const tenancy = await getActiveTenancy(unit.id);
    const baseRent = tenancy?.rentAmount ?? 0;

    rows.push({
      unit,
      payment: {
        id: paymentId(unit.id, year, month),
        unitId: unit.id,
        buildingId: unit.buildingId,
        year,
        month,
        ym: toYm(year, month),
        tenancyId: tenancy?.id || null,
        tenantName: tenancy?.tenantName || "",
        tenantPhone: tenancy?.tenantPhone || "",
        contractNumber: tenancy?.contractNumber || "",
        guarantorName: tenancy?.guarantorName || "",
        guarantorPhone: tenancy?.guarantorPhone || "",
        rentDue: baseRent + previousOutstanding,
        cashAmount: 0,
        transferAmount: 0,
        transferMethod: null,
        status: "unpaid",
        outstanding: baseRent + previousOutstanding,
        paidDate: null,
        notes: "",
      },
      isNew: true,
    });
  }
  return rows;
}

export async function savePayment(payment) {
  const id = paymentId(payment.unitId, payment.year, payment.month);
  const { status, outstanding } = computeStatus(payment.rentDue, payment.cashAmount, payment.transferAmount);
  await setDoc(
    doc(db, PAYMENTS, id),
    { ...payment, status, outstanding, ym: toYm(payment.year, payment.month), updatedAt: serverTimestamp() },
    { merge: true }
  );
  return id;
}

export async function getUnitHistory(unitId) {
  const snap = await getDocs(
    query(collection(db, PAYMENTS), where("unitId", "==", unitId), orderBy("ym", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getBuildingHistory(buildingId) {
  const snap = await getDocs(
    query(collection(db, PAYMENTS), where("buildingId", "==", buildingId), orderBy("ym", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addUnit(unit) {
  return addDoc(collection(db, UNITS), { active: true, ...unit });
}

export async function updateUnit(unitId, changes) {
  return updateDoc(doc(db, UNITS, unitId), changes);
}

export async function hasAnyBuildings() {
  const snap = await getDocs(collection(db, BUILDINGS));
  return !snap.empty;
}

export async function seedInitialData() {
  if (await hasAnyBuildings()) return false;

  const batch = writeBatch(db);

  const limonRef = doc(collection(db, BUILDINGS));
  batch.set(limonRef, { name: "مجمع ليمون", order: 1 });
  const mashaarifRef = doc(collection(db, BUILDINGS));
  batch.set(mashaarifRef, { name: "مجمع المشارف", order: 2 });

  for (let i = 1; i <= 15; i++) {
    const unitRef = doc(collection(db, UNITS));
    batch.set(unitRef, {
      buildingId: limonRef.id,
      type: "غرفة عزاب",
      label: `غرفة ${i}`,
      unitNumber: i,
      order: i,
      active: true,
    });
  }

  for (let i = 1; i <= 4; i++) {
    const unitRef = doc(collection(db, UNITS));
    batch.set(unitRef, {
      buildingId: mashaarifRef.id,
      type: "محل",
      label: `محل ${i}`,
      unitNumber: i,
      order: i,
      active: true,
    });
  }
  for (let i = 1; i <= 23; i++) {
    const unitRef = doc(collection(db, UNITS));
    batch.set(unitRef, {
      buildingId: mashaarifRef.id,
      type: "غرفة عزاب",
      label: `غرفة ${i}`,
      unitNumber: i,
      order: 4 + i,
      active: true,
    });
  }

  await batch.commit();
  return true;
}
