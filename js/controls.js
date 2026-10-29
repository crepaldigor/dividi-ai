import { escapeHTML as esc, icon } from './ui.js';

// Preserve the original fields for FormData, validation and application events.
const fields = new WeakMap();
const months = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleString('pt-BR', { month: 'long' }));
const pad = n => String(n).padStart(2, '0');
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const picker = document.createElement('dialog');
picker.className = 'control-dialog';
picker.setAttribute('aria-labelledby', 'control-title');
document.body.append(picker);
let source, trigger, year, month, mode;

function label(field) {
  return field.getAttribute('aria-label') || field.labels?.[0]?.textContent.trim() || 'Escolha uma opção';
}
function display(field) {
  if (field.tagName === 'SELECT') return field.selectedOptions[0]?.textContent || 'Selecionar';
  if (!field.value) return field.type === 'month' ? 'Escolher mês' : 'Escolher data';
  const [y, m, d] = field.value.split('-');
  return field.type === 'month' ? `${months[Number(m) - 1]} de ${y}` : `${d}/${m}/${y}`;
}
function sync(field, button) {
  const text = display(field);
  if (button.firstElementChild.textContent !== text) button.firstElementChild.textContent = text;
  if (button.disabled !== field.disabled) button.disabled = field.disabled;
  button.setAttribute('aria-label', `${label(field)}: ${text}`);
}
const fieldSelector = 'select, input[type="date"], input[type="month"]';
function enhance(root = document) {
  if (!root.isConnected || picker.contains(root)) return;
  const candidates = root.matches?.(fieldSelector) ? [root] : root.querySelectorAll(fieldSelector);
  candidates.forEach(field => {
    if (picker.contains(field)) return;
    let button = fields.get(field);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = `custom-control ${field.className}`;
      button.innerHTML = `<span></span>${field.tagName === 'SELECT' ? '<span class="control-chevron" aria-hidden="true">⌄</span>' : icon('calendar', 18)}`;
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
      button.dataset.controlFor = field.id;
      field.classList.add('enhanced-field');
      field.tabIndex = -1;
      field.setAttribute('aria-hidden', 'true');
      field.after(button);
      fields.set(field, button);
      button.addEventListener('click', () => open(field, button));
      field.addEventListener('change', () => queueMicrotask(() => { if (field.isConnected) sync(field, button); }));
    }
    sync(field, button);
  });
}
function commit(value) {
  const field = source;
  field.value = value;
  picker.close();
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  if (field.isConnected) sync(field, fields.get(field));
}
function allowed(value) {
  return (!source.min || value >= source.min) && (!source.max || value <= source.max);
}
function open(field, button) {
  source = field; trigger = button;
  const parts = (field.value || localToday()).split('-');
  year = Number(parts[0]); month = Number(parts[1]) - 1;
  mode = field.tagName === 'SELECT' ? 'options' : field.type === 'month' ? 'months' : 'days';
  render();
  button.setAttribute('aria-expanded', 'true');
  picker.showModal();
  picker.querySelector('[aria-pressed="true"], .control-search, .control-year')?.focus();
}
function render() {
  picker.innerHTML = `<header class="control-header"><div><p class="eyebrow">${mode === 'options' ? 'ESCOLHA UMA OPÇÃO' : 'SEU TEMPO, SUAS CONTAS'}</p><h2 id="control-title">${esc(label(source))}</h2></div><button type="button" class="control-close" aria-label="Fechar seletor">×</button></header><div class="control-content"></div><footer class="control-footer"><span>${mode === 'options' ? 'Selecione para confirmar' : source.type === 'date' ? 'Selecione o dia do lançamento' : 'Escolha o mês e o ano'}</span><button type="button" class="text-action" data-picker-cancel>Cancelar</button></footer>`;
  picker.querySelector('.control-close').onclick = () => picker.close();
  picker.querySelector('[data-picker-cancel]').onclick = () => picker.close();
  const content = picker.querySelector('.control-content');
  if (mode === 'options') {
    const options = Array.from(source.options);
    content.innerHTML = `${options.length > 7 ? '<input class="control-search" type="search" placeholder="Buscar opção…" aria-label="Buscar opção">' : ''}<div class="control-options"></div>`;
    const list = content.querySelector('.control-options');
    const draw = (query = '') => {
      const matching = options.map((o, i) => ({ o, i })).filter(({ o }) => !o.hidden && o.textContent.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
      list.innerHTML = matching.map(({ o, i }) => `<button type="button" data-option="${i}" aria-pressed="${o.selected}" ${o.disabled || o.parentElement.disabled ? 'disabled' : ''}><span>${esc(o.textContent)}</span>${o.selected ? icon('check') : ''}</button>`).join('') || '<p class="field-hint">Nenhuma opção encontrada.</p>';
      list.querySelectorAll('button').forEach(b => b.onclick = () => commit(options[Number(b.dataset.option)].value));
    };
    draw();
    content.querySelector('input')?.addEventListener('input', e => draw(e.target.value));
    return;
  }
  const minYear = Number(source.min?.slice(0, 4) || 1000);
  const maxYear = Number(source.max?.slice(0, 4) || 9998);
  const prefix = `${year}-${pad(month + 1)}`;
  content.innerHTML = `<div class="control-navigation"><button type="button" data-step="-1" aria-label="${mode === 'months' ? 'Ano' : 'Mês'} anterior">←</button><div>${mode === 'days' ? `<button type="button" class="control-month-name">${months[month]}</button>` : ''}<label class="control-year-label"><span class="sr-only">Ano</span><input class="control-year" type="number" inputmode="numeric" min="${minYear}" max="${maxYear}" value="${year}" aria-label="Ano"></label></div><button type="button" data-step="1" aria-label="${mode === 'months' ? 'Próximo ano' : 'Próximo mês'}">→</button></div><div class="control-calendar ${mode === 'months' ? 'is-months' : 'is-days'}"></div><button type="button" class="control-today">${source.type === 'month' ? 'Ir para o mês atual' : 'Selecionar hoje'}</button>`;
  content.querySelector('.control-year').onchange = e => {
    const value = Number(e.target.value);
    if (Number.isInteger(value) && value >= minYear && value <= maxYear) year = value;
    render(); picker.querySelector('.control-year').focus();
  };
  content.querySelector('.control-month-name')?.addEventListener('click', () => { mode = 'months'; render(); });
  content.querySelectorAll('[data-step]').forEach(b => {
    const step = Number(b.dataset.step);
    const date = new Date(year, month + (mode === 'days' ? step : 0), 1);
    const targetYear = mode === 'months' ? year + step : date.getFullYear();
    b.disabled = targetYear < minYear || targetYear > maxYear;
    b.onclick = () => { year = targetYear; month = date.getMonth(); render(); picker.querySelector(`[data-step="${step}"]`).focus(); };
  });
  const calendar = content.querySelector('.control-calendar');
  if (mode === 'months') {
    calendar.innerHTML = months.map((name, i) => {
      const value = `${year}-${pad(i + 1)}`;
      const enabled = source.type === 'month' ? allowed(value) : (!source.min || `${value}-31` >= source.min) && (!source.max || `${value}-01` <= source.max);
      return `<button type="button" data-month="${i}" aria-pressed="${source.value.slice(0, 7) === value}" ${enabled ? '' : 'disabled'}>${name}</button>`;
    }).join('');
    calendar.querySelectorAll('button').forEach(b => b.onclick = () => {
      month = Number(b.dataset.month);
      if (source.type === 'month') commit(`${year}-${pad(month + 1)}`);
      else { mode = 'days'; render(); picker.querySelector('.control-calendar button:not(:disabled)')?.focus(); }
    });
  } else {
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    calendar.innerHTML = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => `<span class="control-weekday">${d}</span>`).join('') + '<span aria-hidden="true"></span>'.repeat(offset) + Array.from({ length: count }, (_, i) => {
      const value = `${prefix}-${pad(i + 1)}`;
      return `<button type="button" data-date="${value}" aria-label="${i + 1} de ${months[month]} de ${year}" aria-pressed="${source.value === value}" ${value === localToday() ? 'aria-current="date"' : ''} ${allowed(value) ? '' : 'disabled'}>${i + 1}</button>`;
    }).join('');
    calendar.querySelectorAll('button').forEach(b => b.onclick = () => commit(b.dataset.date));
  }
  const today = source.type === 'month' ? localToday().slice(0, 7) : localToday();
  content.querySelector('.control-today').disabled = !allowed(today);
  content.querySelector('.control-today').onclick = () => commit(today);
}
picker.addEventListener('close', () => {
  trigger?.setAttribute('aria-expanded', 'false');
  if (trigger?.isConnected) trigger.focus();
});
picker.addEventListener('click', e => { if (e.target === picker && (e.clientX < picker.getBoundingClientRect().left || e.clientX > picker.getBoundingClientRect().right || e.clientY < picker.getBoundingClientRect().top || e.clientY > picker.getBoundingClientRect().bottom)) picker.close(); });
picker.addEventListener('keydown', e => {
  const buttons = [...picker.querySelectorAll('.control-calendar button:not(:disabled), .control-options button:not(:disabled)')];
  const index = buttons.indexOf(document.activeElement);
  const columns = mode === 'days' ? 7 : mode === 'months' ? 3 : 1;
  const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[e.key];
  if (index >= 0 && delta) { e.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, index + delta))]?.focus(); }
});
document.addEventListener('click', e => {
  if (e.target.closest('button')) return;
  const field = e.target.closest('label')?.control;
  if (field && fields.has(field)) { e.preventDefault(); fields.get(field).click(); }
});
// Inline validation replaces browser bubbles without bypassing constraint checks.
document.addEventListener('invalid', e => {
  e.preventDefault();
  const field = e.target;
  const target = fields.get(field) || field;
  let error = target.nextElementSibling;
  if (!error?.classList.contains('control-error')) {
    error = document.createElement('p'); error.className = 'control-error';
    error.id = `field-error-${field.id || Math.random().toString(36).slice(2)}`;
    error.setAttribute('role', 'alert'); target.after(error);
  }
  error.textContent = field.validationMessage;
  target.setAttribute('aria-invalid', 'true');
  target.setAttribute('aria-describedby', error.id);
  if (!field.form?.querySelector('[aria-invalid="true"]') || field.form.querySelector('[aria-invalid="true"]') === target) target.focus();
}, true);
function clearError(e) {
  const target = fields.get(e.target) || e.target;
  if (target.nextElementSibling?.classList.contains('control-error')) {
    target.nextElementSibling.remove();
    target.removeAttribute('aria-invalid'); target.removeAttribute('aria-describedby');
  }
}
document.addEventListener('input', clearError);
document.addEventListener('change', clearError);
// Inspect only changed controls/subtrees, never rescan the whole page while typing.
new MutationObserver(records => {
  const roots = new Set();
  for (const record of records) {
    if (picker.contains(record.target)) continue;
    const field = record.target.closest?.(fieldSelector);
    if (field) roots.add(field);
    if (record.type === 'childList') {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && !node.closest('.custom-control')) roots.add(node);
      }
    }
  }
  for (const root of roots) enhance(root);
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });
enhance();
