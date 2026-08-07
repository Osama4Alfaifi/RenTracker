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

function paymentId(unitId, year, month) {
  return `${unitId}_${year}-${month}`;
}

function toYm(year, month) {
  return year * 12 + month;
}

function prevMonth(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
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

// Returns one row per unit for the given month, filling in sensible
// defaults (previous month's tenant name, unit's current rent) when no
// payment record exists yet for that unit/month.
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
    rows.push({
      unit,
      payment: {
        id: paymentId(unit.id, year, month),
        unitId: unit.id,
        buildingId: unit.buildingId,
        year,
        month,
        ym: toYm(year, month),
        tenantName: previous ? previous.tenantName : "",
        rentDue: unit.rentAmount ?? 0,
        status: "unpaid",
        method: null,
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
  await setDoc(
    doc(db, PAYMENTS, id),
    { ...payment, ym: toYm(payment.year, payment.month), updatedAt: serverTimestamp() },
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
      rentAmount: 0,
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
      rentAmount: 0,
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
      rentAmount: 0,
      order: 4 + i,
      active: true,
    });
  }

  await batch.commit();
  return true;
}
