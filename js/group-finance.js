import { expensePayments } from './engine.js';

export const isMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && !value.startsWith('0000');
export const necessityOptions = [['unknown','Ainda não classificada'],['essential','Essencial / inevitável'],['discretionary','Não essencial / ajustável']];
const money = value => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000_000;

export function isValidGroupFinances(finances) {
  if (!finances || typeof finances !== 'object' || Array.isArray(finances) || Object.keys(finances).length > 120) return false;
  return Object.entries(finances).every(([month, rows]) => {
    if (!isMonth(month) || !Array.isArray(rows) || rows.length > 100) return false;
    const ids = new Set();
    return rows.every(row => {
      if (!row || typeof row.memberId !== 'string' || !row.memberId || row.memberId.length >= 150 || ids.has(row.memberId)) return false;
      ids.add(row.memberId);
      if (row.role != null && !['contributor','dependent'].includes(row.role)) return false;
      if (row.role === 'dependent' && (row.contributes || row.contribution !== 0 || row.income !== null)) return false;
      if (row.role === 'contributor' && !row.contributes) return false;
      return typeof row.contributes === 'boolean' && (row.income === null || money(row.income)) &&
        (row.contribution === null || money(row.contribution)) &&
        (row.contributes || row.contribution === 0) &&
        (row.income === null || row.contribution === null || row.contribution <= row.income);
    });
  });
}

export function analyzeGroupMonth(group, month) {
  if (!isMonth(month)) throw new Error('Escolha um mês válido.');
  const records = group.finances?.[month] || [];
  const expenses = group.expenses.filter(e => e.date.slice(0,7) === month);
  const members = group.members.map(member => {
    const record = records.find(r=>r.memberId === member.id);
    return { ...member, role:record?.role ?? null, income:record?.role === 'dependent' ? null : record?.income ?? null, contributes:record?.contributes ?? null,
      contribution:record?.contribution ?? null,
      allocated:expenses.reduce((sum,e)=>sum+(e.shares[member.id] || 0),0),
      advanced:expenses.reduce((sum,e)=>sum+(expensePayments(e)[member.id] || 0),0),
      incomplete:!record || (record.role !== 'dependent' && record.income === null) || (record.contributes && record.contribution === null) };
  });
  const sum = (rows,key) => rows.reduce((total,row)=>total+(row[key] || 0),0);
  const contributors = members.filter(m=>m.contributes === true);
  const totalIncome = sum(members,'income');
  const contributorIncome = sum(contributors,'income');
  const available = sum(contributors,'contribution');
  const spending = sum(expenses,'amount');
  const essential = sum(expenses.filter(e=>e.necessity === 'essential'),'amount');
  const discretionary = sum(expenses.filter(e=>e.necessity === 'discretionary'),'amount');
  const unclassified = spending-essential-discretionary;
  const missing = members.filter(m=>m.incomplete).length;
  const dependents = members.filter(m=>m.role === 'dependent');
  const familyReady = members.length > 0 && missing === 0 && members.every(m=>m.role !== null);
  const proposed = familyReady && available > 0 ? allocateByCapacity(Math.min(spending,available),contributors.map(m=>({id:m.id,capacity:m.contribution}))) : {};
  for (const member of members) {
    member.suggested = familyReady ? proposed[member.id] || 0 : null;
    member.protectedIncome = member.income === null ? null : member.income-(member.contribution || 0);
    member.afterSuggested = member.income === null || member.suggested === null ? null : member.income-member.suggested;
    member.capShare = member.income > 0 ? member.contribution/member.income : null;
  }
  const categoryTotals = new Map();
  for (const expense of expenses) categoryTotals.set(expense.category,(categoryTotals.get(expense.category)||0)+expense.amount);
  const consumption = [...categoryTotals].map(([category,total])=>({category,total,perPerson:members.length ? Math.round(total/members.length) : 0})).sort((a,b)=>b.total-a.total);
  const ratio = available > 0 ? spending/available : null;
  const discretionaryRatio = available > 0 ? discretionary/available : null;
  const individualPressure = contributors.filter(m=>m.contribution !== null && m.allocated > m.contribution);
  const unfundedShares = sum(members.filter(m=>m.contributes === false),'allocated');
  const status = !members.length ? 'empty' : missing ? 'incomplete' : !contributors.length ? 'no-contributors' :
    available === 0 ? 'no-capacity' : !expenses.length ? 'no-expenses' : spending > available ? 'over' :
    ratio >= .9 ? 'tight' : discretionaryRatio >= .3 ? 'high' : discretionaryRatio >= .25 ? 'attention' :
    individualPressure.length || unfundedShares > 0 ? 'distribution' : unclassified > 0 ? 'unclassified' : 'fits';
  return { month, members, contributors, dependents, familyReady, consumption, missing, expenses, spending, essential, discretionary, unclassified,
    totalIncome, contributorIncome, available, ratio, discretionaryRatio, status, individualPressure, unfundedShares,
    headcount:members.length, payerCount:new Set(expenses.flatMap(e=>Object.keys(expensePayments(e)))).size,
    perPerson:members.length ? Math.round(spending/members.length) : null,
    perContributor:contributors.length ? Math.round(spending/contributors.length) : null,
    remaining:available-spending, unavoidableGap:Math.max(0,essential-available) };
}

// Integer cents + largest remainder: no participant exceeds a declared capacity.
export function allocateByCapacity(amount, capacities) {
  if (!Number.isSafeInteger(amount) || amount < 0 || !Array.isArray(capacities) || capacities.some(r=>!money(r.capacity)) || new Set(capacities.map(r=>r.id)).size !== capacities.length) throw new Error('Valores inválidos para a divisão familiar.');
  const total = capacities.reduce((sum,r)=>sum+r.capacity,0);
  if (amount > total) throw new Error('A despesa ultrapassa o limite disponível da família. Reveja os limites ou a divisão antes de registrar.');
  if (!total) {
    if (amount) throw new Error('Informe pelo menos um contribuinte com limite disponível.');
    return Object.fromEntries(capacities.map(r=>[r.id,0]));
  }
  const rows = capacities.map((r,index)=>{
    const product=BigInt(amount)*BigInt(r.capacity);
    return { ...r,index,value:Number(product/BigInt(total)),remainder:product%BigInt(total) };
  });
  const rest=amount-rows.reduce((sum,r)=>sum+r.value,0);
  const priority=[...rows].sort((a,b)=>a.remainder===b.remainder ? a.index-b.index : a.remainder>b.remainder ? -1 : 1);
  for(let i=0;i<rest;i++) priority[i].value++;
  return Object.fromEntries(rows.map(r=>[r.id,r.value]));
}

export function familyExpenseShares(group, date, amount, excludingId=null) {
  const month=date.slice(0,7);
  const a=analyzeGroupMonth(group,month);
  if (!a.familyReady) throw new Error('Complete os papéis e os limites da família para este mês.');
  const capacities=a.contributors.map(m=>({id:m.id,capacity:Math.max(0,m.contribution-group.expenses.filter(e=>e.id!==excludingId && e.date.slice(0,7)===month).reduce((sum,e)=>sum+(e.shares[m.id]||0),0))}));
  return allocateByCapacity(amount,capacities);
}

export function proposeFamilyMonth(group, month) {
  const a=analyzeGroupMonth(group,month);
  if (!a.familyReady || !a.contributors.length) throw new Error('Complete os papéis e os limites da família neste mês.');
  if (a.spending>a.available) throw new Error('Os gastos ultrapassam os limites da família. Não é possível dividir o total sem exceder esses limites.');
  const capacities=a.contributors.map(m=>({id:m.id,capacity:m.suggested}));
  return [...a.expenses].sort((x,y)=>x.date.localeCompare(y.date)||x.id.localeCompare(y.id)).map(expense=>{
    const shares=allocateByCapacity(expense.amount,capacities);
    for(const row of capacities) row.capacity-=shares[row.id]||0;
    return { id:expense.id,shares };
  });
}
