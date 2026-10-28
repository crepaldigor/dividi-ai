import { groupStats } from './engine.js';

export const budgetCategories = [
  ['housing', 'Paga aluguel ou parcela da moradia?', true],
  ['power', 'Paga conta de luz?', true],
  ['water', 'Paga água ou gás?', true],
  ['internet', 'Paga internet ou celular?', true],
  ['food', 'Faz compras no mercado?', true],
  ['transport', 'Gasta com transporte?', true],
  ['health', 'Tem gastos com saúde ou estudos?', true],
  ['debt', 'Paga dívidas ou parcelas?', true],
  ['leisure', 'Quanto gasta com saídas e passeios (sem delivery)?', false],
  ['shopping', 'Faz compras pessoais não essenciais?', false],
  ['delivery', 'Quanto gasta com delivery e comida por aplicativo?', false],
  ['subscriptions', 'Paga streaming, jogos ou outras assinaturas?', false],
  ['familySupport', 'Ajuda a família ou sustenta outras pessoas?', true],
  ['other', 'Tem outros gastos mensais?', true],
];

export function isValidPersonal(personal) {
  if (!personal || typeof personal !== 'object' || Array.isArray(personal)) return false;
  const ids = personal.identities;
  if (!ids || typeof ids !== 'object' || Array.isArray(ids) || Object.keys(ids).length > 150) return false;
  if (!Object.entries(ids).every(([key, value]) => key.length < 150 && typeof value === 'string' && value.length < 150)) return false;
  if (personal.budget == null) return true;
  const b = personal.budget;
  const money = v => Number.isSafeInteger(v) && v >= 0 && v <= 100_000_000_000;
  return typeof b === 'object' && money(b.income) && (b.targetPercent == null || (Number.isFinite(b.targetPercent) && b.targetPercent >= 0 && b.targetPercent <= 100)) &&
    ['alone','shared','family'].includes(b.housing) && !!b.costs && typeof b.costs === 'object' &&
    budgetCategories.every(([key]) => money(b.costs[key] ?? (['delivery','subscriptions','familySupport'].includes(key) ? 0 : undefined)));
}

export function personalBalances(groups, identities = {}) {
  const incoming = [], outgoing = [];
  let linked = 0;
  for (const group of groups) {
    const me = Object.hasOwn(identities, group.id) ? identities[group.id] : null;
    if (!group.members.some(m => m.id === me)) continue;
    linked++;
    for (const payment of groupStats(group).settlements) {
      const row = { ...payment, groupId:group.id, groupName:group.name,
        fromName:group.members.find(m => m.id === payment.fromId).name,
        toName:group.members.find(m => m.id === payment.toId).name };
      if (payment.toId === me) incoming.push(row);
      if (payment.fromId === me) outgoing.push(row);
    }
  }
  return { incoming, outgoing, linked,
    receivable:incoming.reduce((sum,r) => sum+r.amount,0),
    payable:outgoing.reduce((sum,r) => sum+r.amount,0) };
}

export function calculateBudget(budget) {
  if (!isValidPersonal({ identities:{}, budget })) throw new Error('Preencha valores válidos para o planejamento.');
  const essentials = budgetCategories.filter(c=>c[2]).reduce((sum,[key])=>sum+(budget.costs[key] || 0),0);
  const flexible = budgetCategories.filter(c=>!c[2]).reduce((sum,[key])=>sum+(budget.costs[key] || 0),0);
  const spending = essentials + flexible;
  const surplus = budget.income - spending;
  const target = Math.round(budget.income * (budget.targetPercent || 0) / 100);
  const reserve = Math.min(target, Math.max(0,surplus));
  return { essentials, flexible, spending, surplus, target, reserve,
    spendingLimit:budget.income-target,
    flexibleLimit:Math.max(0,budget.income-essentials-target),
    adjustment:Math.max(0,spending+target-budget.income),
    deficit:Math.max(0,-surplus) };
}

// Product heuristics, not official financial limits. No essential expense is cut.
export const reviewRules = [
  { key:'delivery', label:'Delivery', ratio:0.05, suggestion:'Experimente trocar alguns pedidos por refeições preparadas em casa. Considere o aumento no mercado antes de contar a economia.' },
  { key:'leisure', label:'Saídas e passeios', ratio:0.10, suggestion:'Alterne programas pagos com opções gratuitas e escolha quais saídas valem mais para você.' },
  { key:'shopping', label:'Compras não essenciais', ratio:0.10, suggestion:'Revise compras por impulso e adie itens que podem esperar, sem cortar necessidades pessoais.' },
  { key:'subscriptions', label:'Assinaturas', ratio:0.03, suggestion:'Confira serviços repetidos ou pouco usados. Cancele somente os que não fazem falta.' },
];

export function analyzeBudget(budget) {
  const totals = calculateBudget(budget);
  const income = budget.income;
  const ratio = income > 0 ? totals.spending/income : null;
  const status = income === 0 ? 'no-income' : totals.spending === 0 ? 'incomplete' :
    totals.deficit > 0 ? 'deficit' : ratio >= .90 ? 'tight' : ratio >= .75 ? 'attention' : 'room';
  const nonEssentialShare = income > 0 ? totals.flexible/income : null;
  const nonEssentialLevel = income === 0 ? 'unknown' :
    totals.flexible*100 >= income*30 ? 'high' : totals.flexible*100 >= income*25 ? 'attention' : 'within';
  const nonEssentialReference = Math.floor(income*.25);
  const breakdown = income === 0 ? [] : reviewRules.map(rule=>{
    const amount = budget.costs[rule.key] || 0;
    const reference = Math.round(income*rule.ratio);
    const excess = Math.max(0,amount-reference);
    return { ...rule, amount, reference, share:amount/income, excess,
      savingLow:Math.floor(excess*.25), savingHigh:Math.floor(excess*.50) };
  });
  const reviews = breakdown.filter(r=>r.excess > 0).sort((a,b)=>b.savingHigh-a.savingHigh);
  // Cash flow and spending habits are separate: a positive surplus isn't a clean bill of health.
  const assessment = ['no-income','incomplete','deficit','tight'].includes(status) ? status :
    nonEssentialLevel === 'high' ? 'nonessential-high' :
    nonEssentialLevel === 'attention' ? 'nonessential-attention' :
    reviews.length ? 'category-review' : status;
  const savingLow = reviews.reduce((sum,r)=>sum+r.savingLow,0);
  const savingHigh = reviews.reduce((sum,r)=>sum+r.savingHigh,0);
  const buffer = Math.round(income*.05);
  const reserveLow = Math.max(0,totals.surplus+savingLow-buffer);
  const reserveHigh = Math.max(0,totals.surplus+savingHigh-buffer);
  return { ...totals, ratio, status, assessment, reviews, breakdown, savingLow, savingHigh, buffer,
    nonEssentialShare, nonEssentialLevel, nonEssentialReference,
    aboveNonEssentialReference:Math.max(0,totals.flexible-nonEssentialReference),
    reserveLow, reserveHigh, currentReserve:Math.max(0,totals.surplus-buffer),
    essentialShare:income > 0 ? totals.essentials/income : null,
    remainingDeficit:Math.max(0,-totals.surplus-savingHigh),
    housingShare:income > 0 ? (budget.costs.housing || 0)/income : null };
}
