/** Motor financeiro do Dividi Aí — todos os valores são inteiros em centavos. */
export function parseMoney(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Valor inválido.");
    return Math.round(value * 100);
  }
  const raw = String(value ?? "")
    .trim()
    .replace(/R\$|\s/g, "");
  if (!raw) throw new Error("Informe um valor.");
  let normalized = raw;
  if (raw.includes(",") && raw.includes(".")) {
    normalized =
      raw.lastIndexOf(",") > raw.lastIndexOf(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    normalized = raw.replace(",", ".");
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized))
    throw new Error("Informe um valor válido, como 35,90.");
  const [whole, decimals = ""] = normalized.split(".");
  const result = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  if (
    !Number.isSafeInteger(result) ||
    result < 0 ||
    result > 1_000_000_000_00
  ) {
    throw new Error("Valor fora do limite permitido.");
  }
  return result;
}

export const formatMoney = (cents) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);

export function sharesForExpense(amount, ids, mode = "equal", values = {}) {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("A despesa precisa ser maior que zero.");
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error("Selecione pelo menos um participante.");
  }
  if (mode === "equal") {
    const base = Math.floor(amount / ids.length);
    const rest = amount % ids.length;
    return Object.fromEntries(
      ids.map((id, i) => [id, base + (i < rest ? 1 : 0)]),
    );
  }
  if (mode === "exact") {
    const shares = Object.fromEntries(
      ids.map((id) => [id, parseMoney(values[id] ?? "0")]),
    );
    if (Object.values(shares).reduce((a, b) => a + b, 0) !== amount) {
      throw new Error(
        "A soma das parcelas deve ser exatamente " + formatMoney(amount) + ".",
      );
    }
    return shares;
  }
  if (mode === "percent") {
    const parts = ids.map((id, order) => {
      const percentage = String(values[id] ?? "")
        .trim()
        .replace(",", ".");
      if (!/^\d+(?:\.\d{1,2})?$/.test(percentage))
        throw new Error("Use percentuais válidos com até duas casas decimais.");
      const weight = Math.round(Number(percentage) * 100);
      if (weight < 0 || weight > 10000)
        throw new Error("Cada percentual deve estar entre 0 e 100.");
      return { id, order, weight };
    });
    if (parts.reduce((s, p) => s + p.weight, 0) !== 10000) {
      throw new Error("Os percentuais precisam somar exatamente 100%.");
    }
    const allocated = parts.map((p) => ({
      ...p,
      cents: Math.floor((amount * p.weight) / 10000),
      fraction: (amount * p.weight) % 10000,
    }));
    let remaining = amount - allocated.reduce((sum, p) => sum + p.cents, 0);
    const priority = [...allocated].sort(
      (a, b) => b.fraction - a.fraction || a.order - b.order,
    );
    for (let i = 0; i < remaining; i++) priority[i].cents += 1;
    return Object.fromEntries(allocated.map((p) => [p.id, p.cents]));
  }
  throw new Error("Tipo de divisão não reconhecido.");
}

export function calculateBalances(group) {
  const totals = Object.fromEntries(group.members.map((m) => [m.id, 0]));
  for (const e of group.expenses) {
    if (!(e.payerId in totals)) continue;
    totals[e.payerId] += e.amount;
    for (const [id, share] of Object.entries(e.shares)) {
      if (id in totals) totals[id] -= share;
    }
  }
  for (const p of group.payments) {
    if (p.fromId in totals) totals[p.fromId] += p.amount;
    if (p.toId in totals) totals[p.toId] -= p.amount;
  }
  return totals;
}

export function suggestSettlements(balances) {
  const debtors = Object.entries(balances)
    .filter(([, value]) => value < 0)
    .map(([id, value]) => ({ id, left: -value }))
    .sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));
  const creditors = Object.entries(balances)
    .filter(([, value]) => value > 0)
    .map(([id, value]) => ({ id, left: value }))
    .sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));
  const result = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left);
    if (amount > 0)
      result.push({ fromId: debtors[i].id, toId: creditors[j].id, amount });
    debtors[i].left -= amount;
    creditors[j].left -= amount;
    if (debtors[i].left === 0) i++;
    if (creditors[j].left === 0) j++;
  }
  return result;
}

export function groupStats(group) {
  const balances = calculateBalances(group);
  const settlements = suggestSettlements(balances);
  return {
    balances,
    settlements,
    total: group.expenses.reduce((sum, e) => sum + e.amount, 0),
    pending: settlements.reduce((sum, e) => sum + e.amount, 0),
    count: group.expenses.length,
  };
}

export function paidBy(group, id) {
  return group.expenses
    .filter((e) => e.payerId === id)
    .reduce((s, e) => s + e.amount, 0);
}
export function owedBy(group, id) {
  return group.expenses.reduce((s, e) => s + (e.shares[id] || 0), 0);
}
