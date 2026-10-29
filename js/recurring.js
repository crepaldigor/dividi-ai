export function recurringDue(group, month) {
  return (group.recurring || []).filter(template => template.active && month >= template.startMonth && !(template.handled || []).includes(month) && !group.expenses.some(e => e.recurringId === template.id && e.date.slice(0, 7) === month));
}
export function recurringExpense(template, month) {
  const [year, number] = month.split('-').map(Number);
  const last = new Date(year, number, 0).getDate();
  const date = `${month}-${String(Math.min(template.day, last)).padStart(2, '0')}`;
  return { ...structuredClone(template.expense), id: null, date };
}
