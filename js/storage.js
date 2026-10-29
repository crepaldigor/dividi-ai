import { isValidPersonal } from './personal.js';
import { isValidGroupFinances, isMonth } from './group-finance.js';
import { validHistory } from './history.js';
import { currentMonth, assignLegacyPaymentMonths } from './months.js';
export const STORAGE_KEY = "dividi-ai:mvp:v1";
const THEME_KEY = "dividi-ai:theme";

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export { makeId };

export function emptyData() {
  return { version: 1, activeGroupId: null, groups: [] };
}

export function migrateData(data) {
  let changed = false;
  if (data.personal?.budget && !data.personal.budgets) {
    data.personal.budgets = { [currentMonth()]: data.personal.budget };
    delete data.personal.budget;
    changed = true;
  }
  for (const group of data.groups) changed = assignLegacyPaymentMonths(group) || changed;
  return changed;
}

function isValidData(state) {
  if (state?.history != null && !validHistory(state.history)) return false;
  if (state?.personal != null && !isValidPersonal(state.personal)) return false;
  if (
    !state ||
    state.version !== 1 ||
    !Array.isArray(state.groups) ||
    state.groups.length > 150
  )
    return false;
  const validId = (v) =>
    typeof v === "string" && v.length > 0 && v.length < 150;
  const text = (v, limit = 160) => typeof v === "string" && v.length <= limit;
  const validDate = value => text(value,10) && /^\d{4}-\d{2}-\d{2}$/.test(value) && isMonth(value.slice(0,7)) && Number(value.slice(8)) > 0 && new Date(`${value}T12:00:00`).getDate() === Number(value.slice(8));
  const validMoney = (v) =>
    Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000_000_00;
  const groupIds = new Set();
  for (const g of state.groups) {
    if (!g || typeof g !== 'object') return false;
    if (g.finances != null && !isValidGroupFinances(g.finances)) return false;
    if (g.closedMonths != null && (!Array.isArray(g.closedMonths) || g.closedMonths.length > 1200 || !g.closedMonths.every(isMonth))) return false;
    if (g.recurring != null) {
      if (!Array.isArray(g.recurring) || g.recurring.length > 100 || new Set(g.recurring.map(r => r?.id)).size !== g.recurring.length) return false;
      for (const r of g.recurring) {
        if (!r || !validId(r.id) || !isMonth(r.startMonth) || !Number.isInteger(r.day) || r.day < 1 || r.day > 31 || typeof r.active !== 'boolean' || !Array.isArray(r.handled) || r.handled.length > 1200 || !r.handled.every(isMonth)) return false;
        if (!isValidData({version:1,groups:[{...g, recurring:undefined, expenses:[r.expense], payments:[]}]})) return false;
      }
    }
    if (
      !validId(g.id) ||
      groupIds.has(g.id) ||
      !text(g.name) ||
      !Array.isArray(g.members) ||
      !Array.isArray(g.expenses) ||
      !Array.isArray(g.payments) ||
      g.members.length > 100 ||
      g.expenses.length > 20000 ||
      g.payments.length > 20000
    )
      return false;
    groupIds.add(g.id);
    const members = new Set();
    for (const m of g.members) {
      if (!validId(m.id) || members.has(m.id) || !text(m.name, 80))
        return false;
      members.add(m.id);
    }
    if (g.finances && Object.values(g.finances).some(rows=>rows.some(row=>!members.has(row.memberId)))) return false;
    if (g.statementMembers != null) {
      if (typeof g.statementMembers !== 'object' || Array.isArray(g.statementMembers) || Object.keys(g.statementMembers).length > 1200) return false;
      if (!Object.entries(g.statementMembers).every(([month, rows]) => isMonth(month) && Array.isArray(rows) && rows.length <= 100 && new Set(rows.map(m => m?.id)).size === rows.length && rows.every(m => m && members.has(m.id) && text(m.name,80)))) return false;
    }
    const entries = new Set();
    for (const e of g.expenses) {
      if (e.necessity != null && !['unknown','essential','discretionary'].includes(e.necessity)) return false;
      if (
        !validId(e.id) ||
        entries.has(e.id) ||
        !text(e.title) ||
        !validMoney(e.amount) ||
        e.amount <= 0 ||
        (e.payers == null && !members.has(e.payerId)) ||
        !e.shares ||
        typeof e.shares !== "object" ||
        Array.isArray(e.shares) ||
        !validDate(e.date) ||
        !text(e.category, 50) ||
        (e.note != null && !text(e.note, 1000))
      )
        return false;
      entries.add(e.id);
      if (e.payers != null) {
        if (typeof e.payers !== 'object' || Array.isArray(e.payers)) return false;
        const payments = Object.entries(e.payers);
        if (!payments.length || payments.some(([id, value]) => !members.has(id) || !validMoney(value) || value <= 0)) return false;
        if (payments.reduce((sum, [, value]) => sum + value, 0) !== e.amount) return false;
      }
      let total = 0;
      for (const [id, val] of Object.entries(e.shares)) {
        if (!members.has(id) || !validMoney(val)) return false;
        total += val;
      }
      if (total !== e.amount) return false;
    }
    for (const p of g.payments) {
      if (p.settlementMonth != null && !isMonth(p.settlementMonth)) return false;
      if (
        !validId(p.id) ||
        entries.has(p.id) ||
        !members.has(p.fromId) ||
        !members.has(p.toId) ||
        p.fromId === p.toId ||
        !validMoney(p.amount) ||
        p.amount <= 0 ||
        !validDate(p.date)
      )
        return false;
      entries.add(p.id);
    }
  }
  return true;
}
export { isValidData };

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const initial = emptyData();
      saveData(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (!isValidData(parsed)) return emptyData();
    if (migrateData(parsed)) saveData(parsed);
    // Remove only untouched examples from the old version; retain user-created data.
    const groups = parsed.groups.filter((group) => group.sample !== true);
    if (groups.length !== parsed.groups.length) {
      parsed.groups = groups;
      if (!groups.some((group) => group.id === parsed.activeGroupId))
        parsed.activeGroupId = groups[0]?.id || null;
      saveData(parsed);
    }
    return parsed;
  } catch (e) {
    console.warn("Não foi possível carregar os dados locais:", e);
    return emptyData();
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.warn("Armazenamento indisponível:", error);
    return false;
  }
}

export function getSavedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}
export function saveTheme(value) {
  try {
    localStorage.setItem(THEME_KEY, value);
  } catch {
    /* storage may be blocked */
  }
}
