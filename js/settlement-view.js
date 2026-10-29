import { escapeHTML as esc, icon, dateLabel as date } from './ui.js';
import { explainBalance, expensePayments, formatMoney as money, groupStats } from './engine.js';
import { monthLabel } from './months.js';

const name = (group,id) => group.members.find(m=>m.id===id)?.name || 'Participante';
const signed = value => `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;

function memberBreakdown(group, id, open) {
  const b = explainBalance(group,id);
  return `<details class="balance-explanation" ${open ? 'open' : ''}><summary><span class="explanation-person"><span class="explanation-avatar">${esc(name(group,id).slice(0,1))}</span><span><strong>${esc(name(group,id))}</strong><small>${b.balance < 0 ? 'Tem a pagar' : b.balance > 0 ? 'Tem a receber' : 'Tudo acertado'}</small></span></span><b class="${b.balance < 0 ? 'negative' : 'positive'}">${money(Math.abs(b.balance))}</b></summary><div class="explanation-body">
    <details class="balance-math"><summary>Conferir cálculo do saldo</summary><dl class="balance-formula"><div><dt>Adiantou nas despesas</dt><dd>+ ${money(b.paid)}</dd></div><div><dt>Sua parte nas despesas</dt><dd>− ${money(b.share)}</dd></div><div><dt>Acertos que enviou</dt><dd>+ ${money(b.sent)}</dd></div><div><dt>Acertos que recebeu</dt><dd>− ${money(b.received)}</dd></div><div class="formula-result"><dt>Saldo resultante</dt><dd class="${b.balance < 0 ? 'negative' : 'positive'}">${signed(b.balance)}</dd></div></dl></details>
    <h3 class="explanation-section-title">${icon('receipt',16)} Onde esse saldo começou</h3><p class="explanation-caption">Cada valor abaixo mostra o efeito da despesa no saldo desta pessoa, antes dos acertos.</p>
    <div class="origin-list">${[...b.expenses].sort((a,b)=>a.expense.date.localeCompare(b.expense.date)).map(row=>`<article class="origin-card"><header><div><h4>${esc(row.expense.title)}</h4><time>${esc(date(row.expense.date))}</time></div><span class="origin-effect ${row.effect < 0 ? 'negative' : row.effect > 0 ? 'positive' : ''}">${signed(row.effect)}</span></header><p>Total da conta: <b>${money(row.expense.amount)}</b> · ${esc(Object.entries(expensePayments(row.expense)).map(([payer,amount])=>`${name(group,payer)} pagou ${money(amount)}`).join(' · '))}</p><dl><div><dt>Adiantou nesta conta</dt><dd>${money(row.paid)}</dd></div><div><dt>Parte que lhe cabe</dt><dd>${money(row.share)}</dd></div></dl>${row.expense.note ? `<p class="origin-note">${esc(row.expense.note)}</p>` : ''}</article>`).join('') || '<p class="explanation-empty">Nenhuma despesa relacionada a esta pessoa neste mês. Confira o mês atribuído aos pagamentos abaixo.</p>'}</div>
    <h3 class="explanation-section-title">${icon('check',16)} O que já foi acertado</h3><div class="origin-payments">${[...b.payments].sort((a,b)=>a.payment.date.localeCompare(b.payment.date)).map(({payment,effect})=>`<div><span><strong>${effect > 0 ? 'Enviou para ' + esc(name(group,payment.toId)) : 'Recebeu de ' + esc(name(group,payment.fromId))}</strong><small>${esc(date(payment.date))} · acerto deste extrato</small></span><b>${signed(effect)}</b></div>`).join('') || '<p class="explanation-empty">Nenhum pagamento de acerto registrado para esta pessoa neste extrato.</p>'}</div>
  </div></details>`;
}

export function renderPendingExplanation(group, month, fromId, toId) {
  const stats = groupStats(group);
  const transfer = stats.settlements.find(p=>p.fromId===fromId && p.toId===toId);
  const ids = transfer ? [transfer.fromId,transfer.toId] : group.members.filter(m=>stats.balances[m.id]!==0).map(m=>m.id);
  return `<div class="pending-explanation"><div class="pending-context"><span>${esc(group.name)}</span><span>${esc(monthLabel(month))}</span></div><section class="pending-total"><span>${transfer ? 'Acerto sugerido' : 'Total que falta acertar neste mês'}</span><strong>${money(transfer?.amount ?? stats.pending)}</strong><p>${transfer ? `${esc(name(group,transfer.fromId))} paga para ${esc(name(group,transfer.toId))}` : `${stats.settlements.length} transferência(s) sugerida(s) para zerar os saldos.`}</p></section>

    ${!transfer && stats.settlements.length ? `<div class="pending-routes">${stats.settlements.map(p=>`<button data-action="explain-settlement" data-from="${esc(p.fromId)}" data-to="${esc(p.toId)}"><span>${esc(name(group,p.fromId))} ${icon('arrow',14)} ${esc(name(group,p.toId))}</span><b>${money(p.amount)}</b></button>`).join('')}</div>` : ''}
    <details class="pending-how"><summary>Como estes acertos são calculados?</summary><p class="pending-method">Quem adiantou mais do que sua parte tem a receber. Quem adiantou menos tem a pagar. Os pagamentos registrados já entram nessa conta.</p><p class="pending-netting">Os acertos compensam todos os saldos do mês. Por isso, o destinatário sugerido pode ser diferente de quem pagou uma compra. Pagamentos abatem o saldo da pessoa; não são vinculados automaticamente a uma despesa específica.</p></details>
    ${ids.map((id,index)=>memberBreakdown(group,id,Boolean(transfer) && index===0)).join('') || '<p class="explanation-empty">Não há saldo pendente neste mês.</p>'}
    <div class="form-actions">${transfer ? '<button class="button secondary" data-action="explain-pending">Ver todos os acertos</button>' : ''}<button class="button primary" data-action="close-dialog">Entendi</button></div></div>`;
}
