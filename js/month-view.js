import { escapeHTML as esc, icon } from './ui.js';
import { formatMoney as money } from './engine.js';
import { monthLabel, currentMonth, isClosed, pastStatements, compareMonths } from './months.js';
import { recurringDue } from './recurring.js';

export function monthToolbar(group, month) {
  const closed = group && isClosed(group, month);
  const current = month === currentMonth();
  const note = closed ? 'Extrato fechado. Acertos continuam disponíveis; reabra para editar despesas.' : group ? 'Ao fechar, seus lançamentos ficam no histórico e as pendências continuam visíveis.' : 'Sua análise pessoal fica salva em cada mês. Navegue para consultar outros períodos.';
  return `<section class="month-toolbar" aria-label="Período do extrato">
    <header class="month-toolbar-header"><div class="month-heading"><span class="month-calendar" aria-hidden="true">${icon('calendar',20)}</span><div><h2>Seu extrato</h2><p>Escolha o mês para acompanhar</p></div></div><span class="status-badge ${closed ? 'closed' : ''}"><span class="month-status-dot" aria-hidden="true"></span>${closed ? 'Fechado' : current ? 'Mês atual' : 'Em aberto'}</span></header>
    <div class="month-toolbar-controls"><div class="month-picker"><button class="month-step" data-action="previous-month" aria-label="Mês anterior" title="Mês anterior" ${month <= '1000-01' ? 'disabled' : ''}>${icon('arrow',18)}</button><label><span class="sr-only">Mês selecionado</span><input id="statement-month" type="month" min="1000-01" max="9998-12" value="${month}" required></label><button class="month-step" data-action="next-month" aria-label="Próximo mês" title="Próximo mês" ${month >= '9998-12' ? 'disabled' : ''}>${icon('arrow',18)}</button></div>
    <div class="month-actions"><button class="button secondary compact" data-action="history">${icon('receipt',16)} Histórico</button>${group ? `<button class="button secondary compact month-close" data-action="${closed ? 'reopen-month' : 'close-month'}" ${!closed && month > currentMonth() ? 'disabled title="Disponível quando este mês começar"' : ''}>${icon(closed ? 'edit' : 'check',16)} ${closed ? 'Reabrir mês' : 'Fechar mês'}</button>` : ''}</div></div>
    <footer class="month-toolbar-footer"><p class="month-note">${icon(closed ? 'shield' : 'receipt',14)}<span>${note}</span></p>${!current ? `<button class="month-today" data-action="current-month">Voltar ao mês atual ${icon('arrow',14)}</button>` : ''}</footer>
  </section>`;
}

export function renderPastPending(group, month) {
  const rows = pastStatements(group, month).filter(row => row.pending > 0);
  if (!rows.length) return '';
  return `<section class="carry-panel"><div class="section-head"><div><span class="eyebrow">AINDA FALTA ACERTAR</span><h2>Meses anteriores</h2><p class="section-description">São dívidas anteriores, não novas despesas deste mês.</p></div><strong class="carry-total">${money(rows.reduce((s, r) => s + r.pending, 0))}</strong></div><div class="statement-list">${rows.map(row => `<button class="statement-link" data-action="open-month" data-month="${row.month}"><span>${icon('calendar')} ${esc(monthLabel(row.month))}</span><span><b>${money(row.pending)}</b>${icon('arrow')}</span></button>`).join('')}</div></section>`;
}

export function renderComparison(group, month, names) {
  const c = compareMonths(group, month);
  const difference = c.totals[1] - c.totals[0];
  const delta = c.totals[0] ? `${Math.abs(difference / c.totals[0] * 100).toLocaleString('pt-BR', {maximumFractionDigits:1})}% ${difference >= 0 ? 'a mais' : 'a menos'}` : 'Sem base percentual';
  return `<section class="comparison-section"><div class="section-head"><div><span class="eyebrow">EVOLUÇÃO DOS GASTOS</span><h2 class="section-title">Um mês ao lado do outro</h2><p class="section-description">${month === currentMonth() && !isClosed(group, month) ? 'Mês atual em andamento: os valores ainda podem aumentar.' : 'Totais registrados, sem incluir pagamentos de acertos.'}</p></div></div><div class="comparison-summary"><article><span>${esc(monthLabel(c.previous))}</span><strong>${money(c.totals[0])}</strong></article><article><span>${esc(monthLabel(month))}</span><strong>${money(c.totals[1])}</strong></article><article><span>Diferença registrada</span><strong>${difference < 0 ? '−' : '+'}${money(Math.abs(difference))}</strong><small>${c.hasPrevious ? delta : 'Mês anterior sem registros'}</small></article></div><div class="comparison-categories">${c.categories.map(row => {
    const max = Math.max(...row.values, 1);
    return `<article class="comparison-category"><h3>${esc(names[row.category]?.name || 'Outros')}</h3>${row.values.map((value, i) => `<div class="comparison-row"><span>${i ? 'Selecionado' : 'Anterior'}</span><div class="comparison-track"><i class="${i ? 'current' : ''}" style="width:${Math.round(value / max * 100)}%"></i></div><strong>${money(value)}</strong></div>`).join('')}</article>`;
  }).join('') || '<p class="analysis-note">As categorias aparecem quando houver lançamentos.</p>'}</div><p class="field-hint">A comparação não presume que uma redução seja economia: confira se os dois meses estão completos e se o tamanho da casa mudou.</p></section>`;
}

export function renderRecurring(group, month) {
  const due = recurringDue(group, month);
  const templates = group.recurring || [];
  if (!templates.length) return '';
  return `<section class="recurring-panel"><div class="section-head"><div><span class="eyebrow">CONTAS DA ROTINA</span><h2 class="section-title">Revise antes de lançar</h2><p class="section-description">${due.length} conta(s) para revisar em ${esc(monthLabel(month))}. Nada entra no total automaticamente.</p></div></div><div class="recurring-list">${due.map(t => `<article class="recurring-card"><span class="recurring-icon">${icon('calendar')}</span><div><h3>${esc(t.expense.title)}</h3><p>Dia ${t.day} · valor sugerido</p><strong>${money(t.expense.amount)}</strong></div><div class="recurring-actions"><button class="button primary compact" data-action="review-recurring" data-id="${esc(t.id)}" ${isClosed(group, month) ? 'disabled' : ''}>Revisar conta</button><button class="text-action" data-action="skip-recurring" data-id="${esc(t.id)}" ${isClosed(group, month) ? 'disabled' : ''}>Pular este mês</button></div></article>`).join('')}</div><details class="recurring-settings"><summary>Gerenciar ${templates.length} conta(s) recorrente(s)</summary>${templates.map(t => `<div class="recurring-setting"><div><strong>${esc(t.expense.title)}</strong><span>${t.active ? 'Ativa' : 'Pausada'} · mensal · desde ${esc(monthLabel(t.startMonth))}</span></div><button class="button secondary compact" data-action="toggle-recurring" data-id="${esc(t.id)}">${t.active ? 'Pausar' : 'Retomar'}</button><button class="tertiary-button" data-action="delete-recurring" data-id="${esc(t.id)}" aria-label="Remover recorrência de ${esc(t.expense.title)}">${icon('trash')}</button></div>`).join('')}</details></section>`;
}

export function renderHistory(history = []) {
  return `<header class="page-head"><div><p class="eyebrow">SUA CONTA | ALTERAÇÕES</p><h1>O que mudou por aqui.</h1><p class="page-subtitle">Exclusões e edições recentes, com opção de desfazer.</p></div><button class="button secondary" data-view="overview">Voltar ao grupo</button></header><p class="history-notice">Guardamos até 40 alterações recentes, limitadas pelo espaço local. Você pode desfazer uma ação enquanto os dados afetados não tiverem mudado novamente. Exportar um backup continua sendo a forma de guardar todo o histórico disponível.</p><div class="history-list">${[...history].reverse().map(row => {
    const names = [...new Set(row.patches.map(p => p.before?.title || p.after?.title || p.before?.name || p.after?.name).filter(Boolean))];
    return `<article class="history-card"><span class="history-icon">${icon(row.undoneAt ? 'check' : 'receipt')}</span><div><time>${esc(new Date(row.at).toLocaleString('pt-BR'))}</time><h2>${esc(row.label)}</h2><p>${esc(row.context || '')}</p>${names.length ? `<div class="history-tags">${names.slice(0, 4).map(name => `<span>${esc(name)}</span>`).join('')}</div>` : ''}${row.undoneAt ? '<span class="status-badge">Desfeita</span>' : ''}</div>${!row.undoneAt ? `<button class="button secondary compact" data-action="undo-change" data-id="${esc(row.id)}">Desfazer</button>` : ''}</article>`;
  }).join('') || '<div class="panel empty-state"><h2>Nenhuma alteração registrada ainda</h2><p>As próximas edições e exclusões aparecerão aqui.</p></div>'}</div>`;
}
