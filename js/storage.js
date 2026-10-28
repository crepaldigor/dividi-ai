import { isValidPersonal } from './personal.js';
import { isValidGroupFinances } from './group-finance.js';
export const STORAGE_KEY = "dividi-ai:mvp:v1";
const THEME_KEY = "dividi-ai:theme";

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export { makeId };

export function emptyData() {
  return { version: 1, activeGroupId: null, groups: [] };
}

function isValidData(state) {
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
  const validMoney = (v) =>
    Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000_000_00;
  const groupIds = new Set();
  for (const g of state.groups) {
    if (!g || typeof g !== 'object') return false;
    if (g.finances != null && !isValidGroupFinances(g.finances)) return false;
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
    const entries = new Set();
    for (const e of g.expenses) {
      if (e.necessity != null && !['unknown','essential','discretionary'].includes(e.necessity)) return false;
      if (
        !validId(e.id) ||
        entries.has(e.id) ||
        !text(e.title) ||
        !validMoney(e.amount) ||
        e.amount <= 0 ||
        !members.has(e.payerId) ||
        !e.shares ||
        typeof e.shares !== "object" ||
        Array.isArray(e.shares) ||
        !text(e.date, 40) ||
        !text(e.category, 50) ||
        (e.note != null && !text(e.note, 1000))
      )
        return false;
      entries.add(e.id);
      let total = 0;
      for (const [id, val] of Object.entries(e.shares)) {
        if (!members.has(id) || !validMoney(val)) return false;
        total += val;
      }
      if (total !== e.amount) return false;
    }
    for (const p of g.payments) {
      if (
        !validId(p.id) ||
        entries.has(p.id) ||
        !members.has(p.fromId) ||
        !members.has(p.toId) ||
        p.fromId === p.toId ||
        !validMoney(p.amount) ||
        p.amount <= 0 ||
        !text(p.date, 40)
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
