import { escapeHTML as esc, icon } from './ui.js';
import { formatMoney } from './engine.js';
/** Confirmações acessíveis. Cancelar, Escape e fechar nunca executam a ação. */
export function requestDecision(message, options = {}) {
  const destructive = /^(Excluir|Apagar|Remover|Importar)/.test(message);
  const title = options.title || (message.startsWith('Importar') ? 'Substituir os dados atuais?' : destructive ? 'Revisar antes de remover' : 'Aplicar esta alteração?');
  const label = options.label || (message.startsWith('Importar') ? 'Substituir e importar' : destructive ? 'Confirmar remoção' : 'Aplicar alteração');
  const previous = document.activeElement;
  const modal = document.createElement('dialog');
  modal.className = 'app-dialog decision-dialog';
  modal.setAttribute('aria-labelledby', 'decision-title');
  modal.setAttribute('aria-describedby', 'decision-description');
  modal.innerHTML = `<form method="dialog"><div class="decision-content"><span class="decision-symbol" aria-hidden="true">${destructive ? '!' : '↔'}</span><p class="eyebrow">REVISE A DECISÃO</p><h2 id="decision-title"></h2><p id="decision-description"></p><ul class="decision-details"></ul><p class="field-hint decision-hint"></p></div><div class="form-actions"><button class="button secondary" value="cancel" autofocus>Voltar sem alterar</button><button class="button ${destructive ? 'danger' : 'primary'}" value="accept"></button></div></form>`;
  modal.querySelector('h2').textContent = title;
  modal.querySelector('h2').tabIndex = -1;
  modal.querySelector('#decision-description').textContent = message;
  modal.querySelector('[value="accept"]').textContent = label;
  modal.querySelector('.decision-symbol').innerHTML = icon(destructive ? 'trash' : 'chart', 24);
  modal.querySelector('.decision-hint').textContent = options.hint || (destructive ? 'A alteração será salva neste navegador e aparecerá no Histórico, onde poderá ser desfeita enquanto os dados relacionados não mudarem.' : 'Nada muda até você confirmar. A alteração e os novos saldos ficam registrados no Histórico.');
  if (options.metrics) {
    const metrics = document.createElement('div');
    metrics.className = 'decision-metrics';
    metrics.innerHTML = options.metrics.map(m => `<div><span>${esc(m.label)}</span><strong>${esc(m.value)}</strong></div>`).join('');
    modal.querySelector('#decision-description').after(metrics);
  }
  if (options.comparisons) {
    const cards = document.createElement('div');
    cards.className = 'decision-comparisons';
    cards.innerHTML = options.comparisons.map(row => `<article class="decision-person"><header><span class="decision-avatar">${esc(row.name.trim().slice(0, 1))}</span><div><h3>${esc(row.name)}</h3><span>${row.dependent ? 'Dependente · sem cobrança' : 'Contribuinte'}</span></div></header><div class="decision-values"><div><span>Parcela atual</span><strong>${formatMoney(row.before)}</strong></div>${icon('arrow')}<div class="proposed-value"><span>Nova parcela</span><strong>${formatMoney(row.after)}</strong></div></div>${row.limit != null && !row.dependent ? `<p class="decision-limit">Limite de ajuda <b>${formatMoney(row.limit)}</b></p>` : ''}</article>`).join('');
    modal.querySelector('ul').before(cards);
  }
  for (const detail of options.details || []) {
    const item = document.createElement('li');
    item.textContent = detail;
    modal.querySelector('ul').append(item);
  }
  modal.querySelector('ul').hidden = !options.details?.length;
  document.body.append(modal);
  return new Promise(resolve => {
    modal.addEventListener('click', event => {
      if (event.target === modal) modal.close('cancel');
    });
    modal.addEventListener('close', () => {
      const accepted = modal.returnValue === 'accept';
      modal.remove();
      if (previous?.isConnected) previous.focus();
      resolve(accepted);
    }, { once: true });
    modal.showModal();
    modal.querySelector('h2').focus({preventScroll:true});
    modal.scrollTop = 0;
  });
}
