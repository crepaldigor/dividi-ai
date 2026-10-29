import { groupStats, calculateBalances } from './engine.js';

export const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
export const monthLabel = month => monthFormatter.format(new Date(`${month}-15T12:00:00`));
export function shiftMonth(month, offset) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, number - 1 + offset, 15);
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
export const paymentMonth = payment => payment.settlementMonth || payment.date.slice(0, 7);
export const isClosed = (group, month) => (group.closedMonths || []).includes(month);
export function nextOpenMonth(group, month = currentMonth()) {
  let next = month;
  while (group && isClosed(group, next)) next = shiftMonth(next, 1);
  return next;
}

// Backward compatibility: old transfers had a date but no statement month.
// Allocate them to the oldest matching debtor/creditor balance, without changing
// dates or the total money transferred. Unmatched advances keep their date month.
export function assignLegacyPaymentMonths(group) {
  if (!group.payments.some(p => !p.settlementMonth)) return false;
  const months = [...new Set(group.expenses.map(e => e.date.slice(0, 7)))].sort();
  const balances = Object.fromEntries(months.map(month => [month, calculateBalances({...group, expenses:group.expenses.filter(e => e.date.slice(0,7) === month), payments:[]})]));
  const balanceFor = month => balances[month] ||= Object.fromEntries(group.members.map(m => [m.id, 0]));
  const apply = (p, month, amount) => {
    const balance = balanceFor(month);
    balance[p.fromId] += amount; balance[p.toId] -= amount;
  };
  const assigned = [];
  for (const payment of [...group.payments].sort((a,b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''))) {
    if (payment.settlementMonth) { apply(payment,payment.settlementMonth,payment.amount); assigned.push(payment); continue; }
    let remaining = payment.amount;
    const allocations = new Map();
    for (const month of Object.keys(balances).sort().filter(m => m <= payment.date.slice(0,7))) {
      const b = balanceFor(month);
      const amount = Math.min(remaining, Math.max(0,-b[payment.fromId]), Math.max(0,b[payment.toId]));
      if (amount) { allocations.set(month,amount); apply(payment,month,amount); remaining -= amount; }
      if (!remaining) break;
    }
    if (remaining) {
      const month = payment.date.slice(0,7);
      allocations.set(month,(allocations.get(month) || 0) + remaining); apply(payment,month,remaining);
    }
    let index = 0;
    for (const [month,amount] of allocations) assigned.push({...payment,id:index++ ? crypto.randomUUID() : payment.id,amount,settlementMonth:month,legacyMonthAssigned:true,legacyOriginalId:payment.id});
  }
  group.payments = assigned;
  return true;
}
export function groupMonths(group) {
  return [...new Set([
    ...group.expenses.map(e => e.date.slice(0, 7)),
    ...group.payments.map(paymentMonth),
    ...Object.keys(group.finances || {}),
    ...(group.closedMonths || []),
  ])].sort();
}
export function monthGroup(group, month) {
  return { ...group, members:isClosed(group,month) && group.statementMembers?.[month] ? group.statementMembers[month] : group.members, expenses: group.expenses.filter(e => e.date.slice(0, 7) === month), payments: group.payments.filter(p => paymentMonth(p) === month) };
}
export function pastStatements(group, before) {
  return groupMonths(group).filter(month => month < before).map(month => ({ month, ...groupStats(monthGroup(group, month)) }));
}
export function compareMonths(group, month) {
  const previous = shiftMonth(month, -1);
  const rows = [previous, month].map(m => monthGroup(group, m));
  const totals = rows.map(g => g.expenses.reduce((sum, e) => sum + e.amount, 0));
  const categories = [...new Set(rows.flatMap(g => g.expenses.map(e => e.category)))];
  return { previous, totals, hasPrevious: groupMonths(group).includes(previous), categories: categories.map(category => ({ category, values: rows.map(g => g.expenses.filter(e => e.category === category).reduce((sum, e) => sum + e.amount, 0)) })).sort((a, b) => b.values[1] - a.values[1]) };
}
