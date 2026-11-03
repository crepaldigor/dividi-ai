import { currentMonth, nextOpenMonth, monthLabel, shiftMonth, monthGroup, paymentMonth, isClosed } from './months.js';
import { monthToolbar, renderPastPending, renderComparison, renderRecurring, renderHistory } from './month-view.js';
import { recordChange, undoChange } from './history.js';
import { recurringDue, recurringExpense } from './recurring.js';
import './controls.js';
import { escapeHTML, icon, dateLabel } from "./ui.js";
import { renderPendingExplanation } from './settlement-view.js';
import { requestDecision } from "./decisions.js";
import { expensePresets } from "./expense-presets.js";
import { renderBudgetAnalysis } from "./analysis-view.js";
import { renderGroupFinance } from './group-finance-view.js';
import { isMonth, isValidGroupFinances, necessityOptions, analyzeGroupMonth, familyExpenseShares, proposeFamilyMonth } from './group-finance.js';
import {
  expensePayments,
  parseMoney,
  formatMoney,
  sharesForExpense,
  completeSplit,
  groupStats,
  paidBy,
  owedBy,
} from "./engine.js";
import {
  loadData,
  migrateData,
  saveData,
  emptyData,
  isValidData,
  makeId,
  getSavedTheme,
  saveTheme,
} from "./storage.js";

import {
  personalGroupCosts,
  integratedBudget,
  budgetCategories,
  personalBalances,
  analyzeBudget,
} from "./personal.js";

const $ = (selector, root = document) => root.querySelector(selector);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const typeNames = {
  trip: "Viagem",
  home: "Casa",
  friends: "Amigos",
  event: "Evento",
  other: "Outros",
};
const categories = {
  food: { name: "Alimentação", icon: "cup", color: "#ffad78" },
  delivery: { name: "Delivery", icon: "cup", color: "#ff9f8e" },
  subscriptions: { name: "Assinaturas", icon: "receipt", color: "#c9a4ff" },
  stay: { name: "Moradia e hospedagem", icon: "house", color: "#b5e56b" },
  health: { name: "Saúde", icon: "shield", color: "#7ce5c1" },
  education: { name: "Educação", icon: "receipt", color: "#eab4ee" },
  transport: { name: "Transporte", icon: "car", color: "#83b4ff" },
  leisure: { name: "Lazer", icon: "party", color: "#b69bfa" },
  shopping: { name: "Compras", icon: "bag", color: "#f2cd6d" },
  other: { name: "Outros", icon: "receipt", color: "#a7a9a1" },
};
const nameOf = (group, id) =>
  group.members.find((m) => m.id === id)?.name || "Participante";
const payerNames = (group, expense) => Object.keys(expensePayments(expense)).map(id => nameOf(group, id)).join(" + ");
const payerSummary = (group, expense) => {
  const entries = Object.entries(expensePayments(expense));
  return entries.length === 1 ? `${nameOf(group, entries[0][0])} pagou` : entries.map(([id, value]) => `${nameOf(group, id)}: ${formatMoney(value)}`).join(' + ');
};
const avatar = (name, index = 0) =>
  `<span class="avatar" data-index="${index % 4}">${escapeHTML(
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x[0] || "")
      .join("")
      .toUpperCase(),
  )}</span>`;
const shortAvatar = (name) =>
  `<span class="settle-avatar">${escapeHTML(
    name
      .trim()
      .split(/\s+/)
      .map((x) => x[0] || "")
      .slice(0, 2)
      .join("")
      .toUpperCase(),
  )}</span>`;

let db = loadData();
let lastSaved = structuredClone(db);
let view = "overview";
let selectedMonth = nextOpenMonth(db.groups.find(g => g.id === db.activeGroupId) || db.groups[0]);
let expenseFilter = { text: "", category: "all" };
let expenseDraft = null;
let toastTimer;
const savedTheme = getSavedTheme();
let theme =
  savedTheme === "dark" || savedTheme === "light" ? savedTheme : "dark";

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  $('meta[name="theme-color"]').setAttribute(
    "content",
    theme === "dark" ? "#101114" : "#f2f3f7",
  );
  $("#theme-caption").textContent =
    theme === "dark" ? "Tema escuro" : "Tema claro";
}
function notify(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 3500);
}
function persist(message, { audit = true } = {}) {
  if (audit && message) recordChange(lastSaved, db, message, `${groupNow()?.name || 'Conta pessoal'} · ${monthLabel(selectedMonth)}`);
  if (!isValidData(db) || !saveData(db)) {
    db = structuredClone(lastSaved);
    notify('Não foi possível salvar. A alteração não foi aplicada. Exporte um backup e confira o espaço do navegador.');
    render();
    return false;
  }
  lastSaved = structuredClone(db);
  render();
  if (message) {
    notify(message);
    const latest = db.history?.at(-1);
    if (audit && latest && !latest.undoneAt) {
      const button = document.createElement('button');
      button.className = 'toast-undo'; button.dataset.action = 'undo-change'; button.dataset.id = latest.id;
      button.textContent = 'Desfazer'; $('#toast').append(button);
    }
  }
  return true;
}
function assertOpen(month = selectedMonth) {
  if (isClosed(groupNow(), month)) throw new Error('Este mês está fechado. Reabra o extrato antes de alterar despesas ou rendas.');
}
function defaultExpenseDate() { return selectedMonth === currentMonth() ? today() : selectedMonth + '-01'; }
function groupNow() {
  return (
    db.groups.find((g) => g.id === db.activeGroupId) || db.groups[0] || null
  );
}
function sortEntries(entries) {
  return [...entries].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
}
function renderSidebar() {
  $("#group-list").innerHTML =
    db.groups
      .map(
        (g) =>
          `<button type="button" class="group-link ${groupNow()?.id === g.id ? "active" : ""}" data-group="${escapeHTML(g.id)}" aria-label="Abrir grupo ${escapeHTML(g.name)}" title="${escapeHTML(g.name)}"><span class="group-symbol" data-type="${escapeHTML(g.type || "other")}">${icon({home:'house',trip:'car',friends:'people',event:'party'}[g.type] || 'receipt',16)}</span><span class="group-link-name">${escapeHTML(g.name)}</span></button>`,
      )
      .join("") || '<p class="groups-empty">Seu próximo rolê começa aqui.</p>';
  for (const b of document.querySelectorAll(".nav-link[data-view]")) {
    b.classList.toggle("active", b.dataset.view === view);
    if (b.dataset.view === view) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
}
function render() {
  const group = groupNow();
  renderSidebar();
  $("#topbar-group").textContent = group?.name || "Painel";
  const mobileGroupSelect = $("#mobile-group-select");
  mobileGroupSelect.innerHTML =
    db.groups
      .map(
        (g) =>
          `<option value="${escapeHTML(g.id)}" ${g.id === group?.id ? "selected" : ""}>${escapeHTML(g.name)}</option>`,
      )
      .join("") + '<option value="__new__">+ Novo grupo</option>';
  if (!group) mobileGroupSelect.value = "__new__";
  if (view === "history") { $("#workspace").innerHTML = renderHistory(db.history); return; }
  if (view === "personal") {
    $("#topbar-group").textContent = "Meu painel";
    $("#workspace").innerHTML = monthToolbar(null, selectedMonth) + renderPersonal();
    return;
  }
  if (!group) {
    $("#workspace").innerHTML = renderWelcome();
    return;
  }
  const monthly = monthGroup(group, selectedMonth);
  const stats = groupStats(monthly);
  const period = monthToolbar(group, selectedMonth) + renderPastPending(group, selectedMonth);
  if (view === 'group-finance') {
    $('#workspace').innerHTML = period + renderGroupFinance(monthly, selectedMonth);
    return;
  }
  if (view === "expenses")
    $("#workspace").innerHTML = period + renderExpensesView(monthly) + renderRecurring(group, selectedMonth);
  else if (view === "people")
    $("#workspace").innerHTML = period + renderPeopleView(monthly, stats);
  else $("#workspace").innerHTML = period + renderOverview(monthly, stats) + renderRecurring(group, selectedMonth) + renderComparison(group, selectedMonth, categories);
}
function renderWelcome() {
  return `<section class="welcome">
    <div class="welcome-copy"><p class="eyebrow">MENOS CONTA. MAIS ENCONTRO.</p>
    <h1>Bom mesmo<br>é dividir<br><span>o momento.</span></h1>
    <p class="page-subtitle">A pizza, o apê, a próxima viagem. Organize os gastos da galera e deixe os acertos com a gente.</p>
    <div class="welcome-actions"><button class="button primary" data-action="new-group">Criar meu primeiro grupo ${icon("arrow")}</button><button class="button secondary" data-action="import">Importar backup</button></div>
    <p class="welcome-caption">${icon("shield", 14)} Sem cadastro. Seus dados ficam neste navegador.</p></div>
    <div class="welcome-art" aria-label="Seu espaço está vazio e pronto para o primeiro grupo">
      <div class="art-label">UMA CONTA. TODO MUNDO JUNTO.</div>
      <div class="receipt-card"><div class="receipt-brand">dividiaí<span>®</span></div><div class="receipt-rule"></div><p class="receipt-kicker">SEU PRÓXIMO ROLÊ</p><div class="receipt-total">R$ 0<span>,00</span></div><p class="receipt-description">Ainda sem gastos.<br>Cheio de possibilidades.</p><div class="receipt-rule"></div><div class="receipt-row"><span>Grupos criados</span><strong>00</strong></div><div class="receipt-row"><span>Despesas registradas</span><strong>00</strong></div><div class="receipt-stamp">BORA COMEÇAR ${icon("arrow")}</div><div class="receipt-barcode" aria-hidden="true"></div></div>
      <div class="split-token" aria-hidden="true">÷</div><div class="art-footnote"><span>CRIE SEU GRUPO</span><span>O RESTO A GENTE CALCULA ↗</span></div>
    </div>
  </section><section class="start-guide" aria-label="Como funciona"><article><span class="step-number">01</span><div><h2>Junta a galera</h2><p>Um grupo para cada viagem, casa ou encontro.</p></div>${icon("people")}</article><article><span class="step-number">02</span><div><h2>Anota os gastos</h2><p>Quem pagou, quanto foi e quem vai dividir.</p></div>${icon("receipt")}</article><article><span class="step-number">03</span><div><h2>Fecha a conta</h2><p>Veja os saldos e registre cada acerto.</p></div>${icon("check")}</article></section>`;
}
function pageHead(group, heading, description, actions = true) {
  return `<header class="page-head"><div><p class="eyebrow">${escapeHTML(typeNames[group.type] || "SEU GRUPO")} | ${escapeHTML(group.name)}${group.sample ? '<span class="note-chip">EXEMPLO</span>' : ""}</p><h1>${heading}</h1><p class="page-subtitle">${description}</p></div>${actions ? `<div class="head-buttons"><button class="icon-button" data-action="edit-group" aria-label="Gerenciar grupo" title="Gerenciar grupo">${icon("edit")}</button><button class="button secondary" data-action="group-access">${icon("people")} Acesso ao grupo</button><button class="button secondary" data-action="share">${icon("upload")} Compartilhar resumo</button><button class="button primary" data-action="new-expense" ${isClosed(group,selectedMonth) ? 'disabled' : ''}>${icon("plus")} Nova despesa</button></div>` : ""}</header>`;
}
function statBlock(label, iconName, value, foot, accent = false) {
  return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon ${accent ? "accent" : ""}">${icon(iconName)}</span></div><div class="stat-number">${value}</div><p class="stat-foot">${foot}</p></article>`;
}
function renderOverview(group, stats) {
  return `${pageHead(group, "O grupo em números.", "Os gastos, a galera e o que falta acertar.")}
  <section class="finance-entry"><div><span class="eyebrow">RENDA | CONTRIBUIÇÃO | DESPESAS</span><h2>O que cabe no orçamento do grupo?</h2><p>Informe as rendas, quem ajuda a pagar e o valor disponível de cada pessoa.</p></div><button class="button secondary" data-action="group-finance">Analisar orçamento do grupo ${icon('arrow')}</button></section>
  <section class="stats-grid" aria-label="Resumo financeiro">
    ${statBlock("Total de despesas", "wallet", formatMoney(stats.total), "Valor das despesas do mês selecionado")}
    ${statBlock("Participantes", "people", String(group.members.length), `${group.members.length === 1 ? "Pessoa cadastrada" : "Pessoas dividindo as contas"}`)}
    ${statBlock("Falta acertar", "receipt", formatMoney(stats.pending), `${stats.settlements.length} ${stats.settlements.length === 1 ? "transferência sugerida" : "transferências sugeridas"}<button class="stat-drilldown" data-action="explain-pending">Ver de onde vem ${icon('arrow',14)}</button>`, true)}
  </section>
  <section class="overview-grid" aria-label="Saldos e acertos">
    <article class="panel settlement-panel"><p class="panel-kicker">HORA DE ACERTAR</p><h2>Quem paga quem?</h2><p class="panel-lead">Calculamos os saldos para reduzir as transferências necessárias.</p>
    ${renderSettlementItems(group, stats)}
    <div class="settle-footer"><span>${stats.settlements.length ? `${stats.settlements.length} ${stats.settlements.length === 1 ? "acerto sugerido" : "acertos sugeridos"}` : "Nenhuma pendência no momento"}</span><button data-action="new-payment">+ Registrar pagamento</button></div></article>
    <article class="panel balance-panel"><h2>Saldo por pessoa</h2><p class="panel-caption">Quem tem a receber e quem ficou devendo.</p>${renderBalances(group, stats.balances)}</article>
  </section>
  <section class="lower-grid"><div><div class="section-head"><div><h2 class="section-title">Últimas despesas</h2><p class="section-description">O que movimentou o grupo recentemente.</p></div><button class="text-action" data-view="expenses">Ver todas ${icon("arrow")}</button></div>
    <div class="panel">${renderActivity(group)}</div></div>
    <div><div class="section-head"><div><h2 class="section-title">Para onde foi?</h2><p class="section-description">Despesas organizadas por categoria.</p></div></div>
    <div class="panel panel-pad">${renderCategoryBreakdown(group)}</div></div>
  </section>`;
}
function renderSettlementItems(group, stats) {
  if (!stats.settlements.length)
    return `<div class="settle-item">${shortAvatar("✓")}<div class="settle-copy"><strong>Tudo em dia!</strong><br>Nenhum valor pendente entre o grupo.</div></div>`;
  return `<div class="settle-list">${stats.settlements
    .slice(0, 4)
    .map(
      (p) =>
        `<div class="settle-item">${shortAvatar(nameOf(group, p.fromId))}<div class="settle-copy"><strong>${escapeHTML(nameOf(group, p.fromId))}</strong> paga para <strong>${escapeHTML(nameOf(group, p.toId))}</strong><span class="settle-money">${formatMoney(p.amount)}</span><button class="settle-explain" data-action="explain-settlement" data-from="${escapeHTML(p.fromId)}" data-to="${escapeHTML(p.toId)}">Por que este valor? ${icon('arrow',12)}</button></div><button class="settle-confirm" data-action="settle" data-from="${escapeHTML(p.fromId)}" data-to="${escapeHTML(p.toId)}" data-amount="${p.amount}" title="Registrar este pagamento">Marcar pago</button></div>`,
    )
    .join(
      "",
    )}${stats.settlements.length > 4 ? `<p style="color:#c1c5bd;font-size:11px;margin:8px 0">+${stats.settlements.length - 4} acertos. Veja todos em “Registrar pagamento”.</p>` : ""}</div>`;
}
function renderBalances(group, balances) {
  if (!group.members.length)
    return `<div class="empty-state"><p>Adicione pessoas para visualizar os saldos.</p></div>`;
  const max = Math.max(...Object.values(balances).map((v) => Math.abs(v)), 1);
  return `<div class="balance-bars">${group.members
    .map((m) => {
      const value = balances[m.id] || 0;
      return `<div class="balance-row"><span class="balance-name">${escapeHTML(m.name)}</span><span class="balance-amount ${value > 0 ? "positive" : value < 0 ? "negative" : ""}">${value > 0 ? "+" : value < 0 ? "−" : ""}${formatMoney(Math.abs(value))}</span><div class="balance-track"><span class="balance-fill ${value < 0 ? "negative" : ""}" style="width:${Math.max(0, (Math.abs(value) / max) * 100).toFixed(2)}%"></span></div></div>`;
    })
    .join(
      "",
    )}</div><p class="muted-note">Saldo positivo: tem a receber. Negativo: deve pagar.</p>`;
}
function categoryBubble(category) {
  return `<div class="category-bubble">${icon(categories[category]?.icon || "receipt")}</div>`;
}
function renderActivity(group) {
  const last = sortEntries(group.expenses).slice(0, 4);
  if (!last.length)
    return `<div class="empty-state"><div class="empty-illustration">+</div><h3>Nada por aqui ainda</h3><p>Adicione a primeira despesa para ver a movimentação.</p><button class="button secondary compact" data-action="new-expense">Adicionar despesa</button></div>`;
  return `<div class="activity-list">${last.map((e) => `<div class="activity-item">${categoryBubble(e.category)}<div class="activity-main"><div class="activity-title">${escapeHTML(e.title)}</div><div class="activity-sub">${escapeHTML(payerSummary(group, e))} · ${dateLabel(e.date)}</div></div><div class="activity-value">${formatMoney(e.amount)}<span class="small-text">${escapeHTML(categories[e.category]?.name || "Outros")}</span></div></div>`).join("")}</div>`;
}
function renderCategoryBreakdown(group) {
  const totals = {};
  for (const e of group.expenses)
    totals[e.category] = (totals[e.category] || 0) + e.amount;
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const sum = entries.reduce((s, [, v]) => s + v, 0);
  if (!sum)
    return `<div class="empty-state"><p>As categorias aparecem depois que você registra despesas.</p></div>`;
  return `<p class="panel-kicker">DISTRIBUIÇÃO DOS GASTOS</p><div class="category-chart" role="img" aria-label="Gráfico de proporção dos gastos por categoria">${entries.map(([id, value]) => `<span title="${escapeHTML(categories[id]?.name || "Outros")}: ${formatMoney(value)}" style="width:${((value / sum) * 100).toFixed(2)}%;background:${categories[id]?.color || "#aaa"}"></span>`).join("")}</div><div class="category-list">${entries.map(([id, value]) => `<div class="category-line"><span class="category-dot" style="background:${categories[id]?.color || "#aaa"}"></span><span>${escapeHTML(categories[id]?.name || "Outros")}</span><span class="category-money">${formatMoney(value)}</span></div>`).join("")}</div>`;
}
function renderExpenseResults(group) {
  const needle = expenseFilter.text.toLocaleLowerCase("pt-BR");
  const entries = sortEntries(group.expenses).filter(
    (e) =>
      (expenseFilter.category === "all" ||
        e.category === expenseFilter.category) &&
      `${e.title} ${payerNames(group, e)} ${e.note || ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(needle),
  );
  return `<section class="panel" id="expense-results"><div class="table-intro"><span>Despesas lançadas</span><span>${entries.length} de ${group.expenses.length} ${group.expenses.length === 1 ? "despesa" : "despesas"}</span></div>
  ${entries.length ? entries.map((e) => `<div class="expense-item"><div class="expense-grid">${categoryBubble(e.category)}<div><div class="expense-title">${escapeHTML(e.title)}</div><div class="expense-meta">${dateLabel(e.date)} · ${escapeHTML(payerSummary(group, e))} · Dividida entre ${Object.keys(e.shares).length}</div></div><div class="expense-value">${formatMoney(e.amount)}</div><div class="expense-edit"><button class="tertiary-button" data-action="edit-expense" ${isClosed(group,selectedMonth) ? 'disabled' : ''} data-id="${escapeHTML(e.id)}" aria-label="Editar ${escapeHTML(e.title)}" title="Editar">${icon("edit")}</button><button class="tertiary-button" data-action="delete-expense" ${isClosed(group,selectedMonth) ? 'disabled' : ''} data-id="${escapeHTML(e.id)}" aria-label="Excluir ${escapeHTML(e.title)}" title="Excluir">${icon("trash")}</button></div></div>${e.note ? `<div class="expense-note">${escapeHTML(e.note)}</div>` : ""}</div>`).join("") : `<div class="empty-state"><div class="empty-illustration">${icon("receipt")}</div><h3>${group.expenses.length ? "Nenhum resultado" : "Seu histórico começa aqui"}</h3><p>${group.expenses.length ? "Tente outra busca ou categoria." : "Registre o primeiro gasto para organizar a divisão."}</p>${group.expenses.length ? "" : '<button class="button primary compact" data-action="new-expense">Nova despesa</button>'}</div>`}</section>`;
}
function renderExpensesView(group) {
  return `${pageHead(group, "Despesas do grupo.", "Tudo registrado, fácil de encontrar e revisar.")}
  <div class="toolbar"><label class="searchbox">${icon("search")}<input type="search" id="expense-search" placeholder="Buscar despesas, pessoas..." value="${escapeHTML(expenseFilter.text)}" aria-label="Buscar despesas" /></label><select class="select-filter" id="expense-filter" aria-label="Filtrar categoria"><option value="all">Todas as categorias</option>${Object.entries(
    categories,
  )
    .map(
      ([id, c]) =>
        `<option value="${id}" ${expenseFilter.category === id ? "selected" : ""}>${escapeHTML(c.name)}</option>`,
    )
    .join("")}</select></div>
  ${renderExpenseResults(group)}
  <section class="panel ledger"><div class="table-intro"><span>Pagamentos registrados</span><span>${group.payments.length} ${group.payments.length === 1 ? "pagamento" : "pagamentos"}</span></div>${
    group.payments.length
      ? sortEntries(group.payments)
          .map(
            (p) =>
              `<div class="payment-item"><div><div class="payment-title">${escapeHTML(nameOf(group, p.fromId))} pagou ${escapeHTML(nameOf(group, p.toId))}</div><div class="payment-sub">${dateLabel(p.date)} · Acerto de ${escapeHTML(monthLabel(paymentMonth(p)))}${p.legacyMonthAssigned ? ' · Mês atribuído ao registro antigo; use Editar para revisar' : ''}</div></div><div class="payment-right"><span class="payment-amount">${formatMoney(p.amount)}</span><button class="tertiary-button" data-action="edit-payment" data-id="${escapeHTML(p.id)}" aria-label="Editar pagamento e mês">${icon("edit")}</button><button class="tertiary-button" data-action="delete-payment" data-id="${escapeHTML(p.id)}" aria-label="Excluir pagamento" title="Excluir registro">${icon("trash")}</button></div></div>`,
          )
          .join("")
      : '<div class="empty-state"><p>Nenhum pagamento registrado neste grupo.</p></div>'
  }<div style="padding:0 22px 18px;text-align:right"><button class="text-action" data-action="new-payment">+ Registrar pagamento</button></div></section>`;
}
function renderPeopleView(group, stats) {
  return `${pageHead(group, "Cada pessoa, sua parte.", `Participação e acertos de ${escapeHTML(monthLabel(selectedMonth))}.`, false)}
    <div class="people-actions head-buttons"><button class="button secondary" data-action="group-access">${icon("people")} Acesso ao grupo <span class="access-soon">Em breve</span></button><button class="button secondary" data-action="group-finance">${icon('chart')} Orçamento da família</button><button class="button secondary" data-action="edit-group">${icon('edit')} Configurar grupo</button><button class="button primary" data-action="new-person">${icon('plus')} Adicionar pessoa</button></div>
    <div class="people-grid">${group.members.map((member, i) => {
      const balance = stats.balances[member.id] || 0;
      const record = group.finances?.[selectedMonth]?.find(row => row.memberId === member.id);
      const dependent = record?.role === 'dependent';
      return `<article class="person-card member-card"><header class="member-header">${avatar(member.name, i)}<div><h2>${escapeHTML(member.name)}</h2><span class="member-role">${dependent ? 'Dependente' : record?.contributes ? 'Contribui com a casa' : 'Participação não informada'}</span></div><button class="tertiary-button" data-action="delete-person" data-id="${escapeHTML(member.id)}" aria-label="Remover ${escapeHTML(member.name)}">${icon('trash')}</button></header>
      <section class="member-balance"><span>${balance > 0 ? 'Tem a receber neste mês' : balance < 0 ? 'Falta pagar neste mês' : 'Acertos deste mês em dia'}</span><strong class="${balance > 0 ? 'positive' : balance < 0 ? 'negative' : ''}">${formatMoney(Math.abs(balance))}</strong></section>
      <dl class="member-expenses"><div><dt>Adiantou nas contas</dt><dd>${formatMoney(paidBy(group, member.id))}</dd></div><div><dt>Parte nas despesas</dt><dd>${formatMoney(owedBy(group, member.id))}</dd></div></dl>
      ${personIncomeCard(group, member)}</article>`;
    }).join('') || '<div class="panel empty-state"><h2>Quem faz parte do grupo?</h2><p>Adicione as pessoas para organizar suas contribuições.</p></div>'}</div>
    <p class="field-hint">Adiantamentos são valores pagos na hora da compra. A parte de cada pessoa é sua responsabilidade nas despesas. Os acertos registrados já estão descontados do saldo.</p>`;
}
function personIncomeCard(group, member) {
  const record = group.finances?.[selectedMonth]?.find(row => row.memberId === member.id);
  const dependent = record?.role === 'dependent';
  const money = value => value == null ? 'Não informado' : formatMoney(value);
  const hasIncome = record?.income != null || record?.contribution != null;
  const ratio = record?.income > 0 && record?.contribution != null ? Math.min(100, record.contribution / record.income * 100) : null;
  return `<section class="member-income"><div class="member-section-title">${icon('wallet', 16)} <h3>Renda e contribuição</h3></div>${dependent ? '<p class="member-dependent">Participa dos gastos da casa, sem renda ou cobrança na divisão familiar.</p>' : hasIncome ? `<dl class="member-income-values"><div><dt>Renda líquida</dt><dd>${money(record?.income)}</dd></div><div><dt>Limite de ajuda</dt><dd>${money(record?.contribution)}</dd></div></dl>${ratio != null ? `<div class="contribution-track" role="img" aria-label="${ratio.toFixed(0)}% da renda disponível para ajudar"><i style="width:${ratio}%"></i></div><p class="member-protected"><span>${ratio.toFixed(0)}% para o grupo</span><span>${formatMoney(record.income - record.contribution)} reservado à pessoa</span></p>` : '<p class="member-income-hint">Complete os valores para definir quanto pode ajudar.</p>'}` : '<div class="member-income-empty"><p>Renda e limite ainda não informados.</p><span>Defina quanto pode contribuir, preservando sua renda pessoal.</span></div>'}
    <div class="member-income-action"><button class="button secondary compact" data-action="person-income" data-id="${escapeHTML(member.id)}" ${isClosed(group, selectedMonth) ? 'disabled' : ''}>${icon('edit', 16)} ${record ? 'Editar contribuição' : 'Informar renda e limite'}</button></div></section>`;
}

function personIncomeForm(id) {
  if (isClosed(groupNow(),selectedMonth)) return notify("Reabra o mês antes de alterar as contribuições.");
  const member = groupNow().members.find(m => m.id === id);
  if (!member) return;
  const month = selectedMonth;
  const row = groupNow().finances?.[month]?.find(r => r.memberId === id);
  const number = value => value == null ? '' : (value / 100).toFixed(2).replace('.', ',');
  openDialog(`${dialogTitle('Salário e contribuição', escapeHTML(member.name) + ' · Valores deste mês')}
    <form id="person-income-form" class="dialog-body" data-member-id="${escapeHTML(id)}" data-month="${month}">
    <p class="field-hint">Esses valores são de ${month}. Para consultar ou alterar outros meses, abra o orçamento do grupo.</p>
    <div class="field"><label for="income-role">Participação na casa</label><select id="income-role" name="role">${optionsFor([['contributor', 'Ajuda a pagar'], ['dependent', 'Dependente — não paga']], row?.role || 'contributor')}</select></div>
    <div class="field"><label for="member-income">Salário / renda líquida mensal (R$)</label><input id="member-income" name="income" inputmode="decimal" placeholder="Não informado" value="${number(row?.income)}" ${row?.role === 'dependent' ? 'disabled' : ''}></div>
    <div class="field"><label for="member-contribution">Quanto pode ajudar neste grupo (R$)</label><input id="member-contribution" name="contribution" inputmode="decimal" placeholder="Não informado" value="${number(row?.contribution)}" ${row?.role === 'dependent' ? 'disabled' : ''}></div>
    <p class="field-hint">Só o limite de ajuda entra no orçamento disponível. Dependentes contam no tamanho da casa, sem renda nem cobrança na divisão familiar. Salvar não altera as parcelas de despesas já registradas.</p>
    <p id="person-income-error" class="budget-error" role="alert"></p><div class="form-actions"><button type="button" class="button secondary" data-action="close-dialog">Cancelar</button><button class="button primary" type="submit">Salvar contribuição</button></div></form>`);
}

function savePersonIncome(form) {
  try {
    assertOpen(form.dataset.month);
    const data = new FormData(form);
    const dependent = data.get('role') === 'dependent';
    const optionalMoney = key => String(data.get(key) || '').trim() ? parseMoney(data.get(key)) : null;
    const row = { memberId: form.dataset.memberId, role: dependent ? 'dependent' : 'contributor', contributes: !dependent, income: dependent ? null : optionalMoney('income'), contribution: dependent ? 0 : optionalMoney('contribution') };
    const group = groupNow();
    const month = form.dataset.month;
    const finances = { ...group.finances, [month]: [...(group.finances?.[month] || []).filter(r => r.memberId !== row.memberId), row] };
    if (!isValidGroupFinances(finances)) throw new Error('O limite de ajuda não pode ultrapassar a renda informada.');
    group.finances = finances;
    group.sample = false;
    closeDialog();
    persist('Salário e contribuição salvos.');
  } catch (error) { $('#person-income-error').textContent = error.message; }
}

function renderPersonal() {
  const personal = db.personal || { identities: {}, budgets: {} };
  const budget = personal.budgets?.[selectedMonth] || null;
  const totals = personalBalances(db.groups, personal.identities);
  const rows = (items, incoming) =>
    items.length
      ? `<div class="personal-table-wrap"><table class="personal-table"><thead><tr><th>${incoming ? "Quem paga você" : "Para quem pagar"}</th><th>Grupo</th><th>Falta pagar</th><th>Ação</th></tr></thead><tbody>${items.map((r) => `<tr><td>${escapeHTML(incoming ? r.fromName : r.toName)}</td><td>${escapeHTML(r.groupName)}<small class="table-month">${escapeHTML(monthLabel(r.month))}</small></td><td>${formatMoney(r.amount)}</td><td><button class="text-action" data-action="personal-payment" data-payment-group="${escapeHTML(r.groupId)}" data-month="${r.month}" data-from="${escapeHTML(r.fromId)}" data-to="${escapeHTML(r.toId)}" data-amount="${r.amount}">Registrar ${incoming ? "recebimento" : "pagamento"}</button></td></tr>`).join("")}</tbody><tfoot><tr><th colspan="2">Total</th><td>${formatMoney(incoming ? totals.receivable : totals.payable)}</td><td></td></tr></tfoot></table></div>`
      : `<div class="empty-state"><p>${totals.linked ? "Nenhum acerto pendente nos grupos vinculados." : "Escolha quem é você nos grupos abaixo para ver seus acertos."}</p></div>`;
  return `<header class="page-head"><div><p class="eyebrow">SÓ SEU | VISÃO PESSOAL</p><h1>Seu dinheiro, de perto.</h1><p class="page-subtitle">Todos os seus grupos e um plano para o mês.</p></div><button class="button secondary" data-action="new-group">${icon("plus")} Criar grupo</button></header>
    <section class="stats-grid" aria-label="Seus totais"><!-- Amounts remain separate: money owed is not available income. -->${statBlock("Você tem a receber", "wallet", formatMoney(totals.receivable), "Acertos pendentes nos grupos vinculados")}${statBlock("Você ainda tem a pagar", "receipt", formatMoney(totals.payable), "Pagamentos pendentes nos grupos vinculados")}${statBlock("Grupos vinculados", "people", `${totals.linked} de ${db.groups.length}`, "Escolha seu participante em cada grupo")}</section>
    <details class="panel personal-identities" ${totals.linked < db.groups.length || !db.groups.length ? "open" : ""}><summary>Quem é você em cada grupo?</summary><p class="field-hint">Selecione seu nome. Grupos sem vínculo ficam fora dos totais. Nomes iguais em grupos diferentes não são unidos automaticamente.</p><div class="identity-grid">${
      db.groups.length
        ? db.groups
            .map(
              (g) =>
                `<div class="field"><label for="identity-${escapeHTML(g.id)}">${escapeHTML(g.name)}</label><select id="identity-${escapeHTML(g.id)}" data-identity-group="${escapeHTML(g.id)}"><option value="">Não incluir este grupo</option>${optionsFor(
                  g.members.map((m) => [m.id, m.name]),
                  personal.identities[g.id],
                )}</select></div>`,
            )
            .join("")
        : '<p class="page-subtitle">Você pode planejar seu mês mesmo sem criar um grupo.</p>'
    }</div></details>
    <section class="personal-section"><h2 class="section-title">Quem ainda precisa acertar com você</h2><p class="section-description">Acertos sugeridos a partir do saldo de cada mês de cada grupo, já descontando os pagamentos registrados. A divisão pode redirecionar quem paga quem; não é uma lista de dívidas originais por despesa.</p><div class="panel">${rows(totals.incoming, true)}</div></section>
    <details class="panel personal-identities"><summary>Seus pagamentos pendentes · ${formatMoney(totals.payable)}</summary>${rows(totals.outgoing, false)}</details>
    <section class="personal-section"><div class="section-head"><div><h2 class="section-title">Seu dinheiro está indo para onde?</h2><p class="section-description">Entenda o peso dos gastos na sua renda e onde pode haver espaço para economizar. Sem precisar definir uma meta.</p></div></div>${renderBudgetForm(budget)}</section>`;
}

function renderBudgetForm(budget) {
  const linked = personalGroupCosts(db.groups, db.personal?.identities || {}, selectedMonth);
  const value = (amount) =>
    amount == null ? "" : (amount / 100).toFixed(2).replace(".", ",");
  return `<section class="group-costs-card"><div><span class="eyebrow">SUA PARTE NOS GRUPOS</span><h3>${formatMoney(linked.total)}</h3><p>Responsabilidade nas despesas de ${escapeHTML(monthLabel(selectedMonth))}. Adiantamentos e acertos não são contados outra vez.</p></div><details><summary>Conferir ${linked.rows.length} parcela(s)</summary><div class="linked-cost-list">${linked.rows.map(row => `<div><span><strong>${escapeHTML(row.title)}</strong><small>${escapeHTML(row.groupName)}</small></span><b>${formatMoney(row.amount)}</b></div>`).join('') || '<p>Nenhuma parcela neste mês nos grupos vinculados.</p>'}</div></details>${linked.unclassified ? `<p class="warning-text">${formatMoney(linked.unclassified)} ainda não foram classificados como essenciais ou opcionais. A análise usa as categorias cadastradas; revise a classificação no grupo para avaliar melhor os não essenciais.</p>` : ''}</section>
  <div class="budget-layout"><details class="budget-editor" ${!budget || budget.analysisVersion !== 2 ? "open" : ""}><summary><span>Seus dados de ${escapeHTML(monthLabel(selectedMonth))}</span><span class="editor-caption">${budget ? "Editar valores" : "Preencher para analisar"}</span></summary><form id="budget-form" class="panel panel-pad"><h3>Como é sua rotina neste mês?</h3><p class="field-hint">Os valores são guardados por mês. Mudar o período não apaga as análises anteriores.</p>
    ${!budget && db.personal?.budgets?.[shiftMonth(selectedMonth, -1)] ? '<button type="button" class="button secondary compact" data-action="copy-budget">Usar os valores pessoais do mês anterior</button>' : ''}
    <section class="integration-choice"><label class="payer-toggle"><input type="checkbox" name="includeGroupShares" id="include-group-shares" ${budget?.includeGroupShares ? 'checked' : ''}> Somar automaticamente minha parte nos grupos</label><p id="integration-hint">${budget?.includeGroupShares ? 'Preencha abaixo somente gastos fora dos grupos. Suas parcelas serão somadas por categoria, uma única vez.' : 'Os campos abaixo representam seus gastos totais, incluindo os grupos. Para ativar a soma automática, retire primeiro desses campos os valores já cadastrados nos grupos.'}</p><span>${budget?.includeGroupShares ? 'Integração ativa' : 'Preenchimento manual'} · ${formatMoney(linked.total)} identificados nos grupos</span></section>
    <div class="field"><label for="budget-income">Quanto você recebe por mês, líquido? (R$)</label><input id="budget-income" name="income" inputmode="decimal" required placeholder="Ex.: 2.500,00" value="${value(budget?.income)}"><p class="field-hint">Se variar, use um valor conservador. Valores a receber dos grupos não entram nesta renda automaticamente.</p></div>
    <div class="field"><label for="budget-housing">Com quem você mora?</label><select id="budget-housing" name="housing">${optionsFor(
      [
        ["family", "Com a família"],
        ["shared", "Divido a casa"],
        ["alone", "Moro sozinho(a)"],
      ],
      budget?.housing || "family",
    )}</select><p class="field-hint">Inclua aluguel, sua contribuição em casa e ajuda a dependentes. Morar com a família não significa morar sem custos.</p></div>
    ${budget && budget.analysisVersion !== 2 ? '<p class="warning-text">Atualizamos as categorias. Antes, delivery estava junto de passeios e assinaturas junto de compras. Redistribua esses valores nos novos campos, sem somá-los duas vezes. A análise antiga será substituída ao salvar.</p>' : ""}
    <fieldset class="budget-costs"><legend>Quais gastos fazem parte do seu mês?</legend>${budgetCategories.map(([key, label]) => `<div class="budget-cost"><label class="check-person" for="has-${key}"><input type="checkbox" id="has-${key}" data-budget-cost="${key}" ${budget?.costs[key] > 0 ? "checked" : ""}><span>${label}</span></label><input class="split-amount" id="cost-${key}" name="cost-${key}" aria-label="Valor mensal em reais: ${label}" inputmode="decimal" placeholder="R$ 0,00" ${budget?.costs[key] > 0 ? "" : "disabled"} value="${value(budget?.costs[key] || 0)}"></div>`).join("")}</fieldset>
    <p id="budget-error" class="budget-error" role="alert"></p><div class="form-actions"><button class="button primary" type="submit">Analisar meus gastos ${icon("arrow")}</button>${budget ? '<button type="button" class="button secondary" data-action="delete-budget">Apagar análise</button>' : ""}</div><p class="field-hint">Tudo é calculado gratuitamente neste navegador. Renda e gastos também entram no arquivo de backup; compartilhe esse arquivo somente se quiser incluir essas informações.</p></form></details>
    <div id="budget-result" class="panel panel-pad budget-result" aria-live="polite">${budget ? renderBudgetResult(budget) : '<div class="empty-state"><div class="empty-illustration">' + icon("chart") + "</div><h3>Seu mês começa pelos números</h3><p>Preencha sua renda e os gastos. Vamos analisar o que pesa mais e o que pode ser revisto na sua rotina.</p></div>"}</div></div>`;
}

function renderBudgetResult(budget) {
  const linked = personalGroupCosts(db.groups, db.personal?.identities || {}, selectedMonth);
  return renderBudgetAnalysis(integratedBudget(budget, linked));
}

function saveGroupFinances(form) {
  const group = groupNow();
  if (!group) return;
  const data = new FormData(form);
  const optionalMoney = value => String(value ?? '').trim() === '' ? null : parseMoney(value);
  try {
    assertOpen();
    const records = group.members.map((member,i) => {
      try {
        const role = data.get(`role-${i}`);
        if (!['contributor','dependent'].includes(role)) throw new Error('escolha se contribui ou é dependente.');
        const contributes = role === 'contributor';
        const income = contributes ? optionalMoney(data.get(`income-${i}`)) : null;
        const contribution = contributes ? optionalMoney(data.get(`contribution-${i}`)) : 0;
        if (income !== null && contribution !== null && contribution > income) throw new Error('o valor disponível não pode ser maior que a renda mensal informada.');
        return {memberId:member.id, role, income, contributes, contribution};
      } catch (error) { throw new Error(`${member.name}: ${error.message}`); }
    });
    const finances = {...group.finances,[selectedMonth]:records};
    if (!isValidGroupFinances(finances)) throw new Error('Confira os valores. É possível guardar até 120 meses por grupo.');
    group.finances = finances;
    group.sample = false;
    persist('Rendas e contribuições deste mês salvas.');
  } catch (error) { $('#group-finance-error').textContent = error.message; }
}

function saveBudget(form) {
  const fields = new FormData(form);
  try {
    const costs = Object.fromEntries(
      budgetCategories.map(([key]) => [
        key,
        $(`#has-${key}`).checked ? parseMoney(fields.get(`cost-${key}`) || "0") : 0,
      ]),
    );
    const budget = {
      income: parseMoney(fields.get("income")),
      housing: fields.get("housing"),
      analysisVersion: 2,
      includeGroupShares: fields.get("includeGroupShares") === "on",
      costs,
    };
    analyzeBudget(budget);
    db.personal ||= { identities: {}, budget: null };
    db.personal.budgets ||= {};
    db.personal.budgets[selectedMonth] = budget;
    delete db.personal.budget;
    persist("Análise dos gastos salva neste navegador.");
    $("#budget-result").scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  } catch (error) {
    $("#budget-error").textContent = error.message;
  }
}

const dialog = $("#app-dialog");
function openDialog(content) {
  dialog.classList.remove('explanation-dialog');
  $("#dialog-body").innerHTML = content;
  if (!dialog.open) dialog.showModal();
  const first = $(
    'input:not([type="hidden"]), select, button',
    $("#dialog-body"),
  );
  first?.focus();
}
function closeDialog() {
  if (dialog.open) dialog.close();
  expenseDraft = null;
}
function dialogTitle(title, subtitle) {
  return `<header class="dialog-header"><div><h2 id="dialog-title">${title}</h2><p>${subtitle}</p></div><button type="button" class="dialog-close" data-action="close-dialog" aria-label="Fechar janela">×</button></header>`;
}
function groupForm(group = null) {
  const isEdit = !!group;
  openDialog(`${dialogTitle(isEdit ? "Editar grupo" : "Um novo grupo, sem complicar.", isEdit ? "Atualize as informações do grupo." : "Dê um nome ao grupo e comece a organizar as despesas.")}
  <form id="group-form" class="dialog-body"><input type="hidden" name="id" value="${escapeHTML(group?.id || "")}" />
  <div class="field"><label for="group-name">Nome do grupo</label><input id="group-name" name="name" placeholder="Ex.: Apê 302, Viagem para Ubatuba" maxlength="70" required value="${escapeHTML(group?.name || "")}" /></div>
  <div class="field"><label for="group-type">Tipo de grupo</label><select id="group-type" name="type">${Object.entries(
    typeNames,
  )
    .map(
      ([id, label]) =>
        `<option value="${id}" ${group?.type === id ? "selected" : ""}>${label}</option>`,
    )
    .join("")}</select></div>
  ${!isEdit ? `<div class="field"><label for="initial-people">Participantes (opcional)</label><textarea id="initial-people" name="people" maxlength="1500" placeholder="Um nome por linha ou separado por vírgula, por exemplo:&#10;Ana&#10;Bruno&#10;Você"></textarea><p class="field-hint">Pode adicionar mais pessoas depois. Cadastre até 100 participantes.</p></div>` : '<p class="field-hint" style="margin-bottom:20px">Para gerenciar participantes, use a aba Participantes.</p>'}
  <div class="form-actions group-form-actions">${isEdit ? `<button type="button" class="button danger" data-action="delete-group">${icon("trash")} Excluir grupo</button>` : ""}<button type="button" class="button secondary" data-action="close-dialog">Cancelar</button><button type="submit" class="button primary">${isEdit ? "Salvar alterações" : "Criar grupo"} ${icon("arrow")}</button></div></form>`);
}
function personForm() {
  openDialog(`${dialogTitle("Adicionar participante", "Quem vai dividir as contas com o grupo?")}
  <form id="person-form" class="dialog-body"><div class="field"><label for="person-name">Nome</label><input id="person-name" name="name" maxlength="60" placeholder="Ex.: Mariana" required autocomplete="off" /></div><div class="form-actions"><button class="button secondary" data-action="close-dialog" type="button">Cancelar</button><button class="button primary" type="submit">Adicionar pessoa</button></div></form>`);
}
const optionsFor = (items, selected) =>
  items
    .map(
      ([id, label]) =>
        `<option value="${escapeHTML(id)}" ${selected === id ? "selected" : ""}>${escapeHTML(label)}</option>`,
    )
    .join("");
function expenseForm(id = null, recurring = null) {
  const group = groupNow();
  if (!group?.members.length) {
    notify("Adicione pelo menos um participante antes de registrar despesas.");
    personForm();
    return;
  }
  const e = recurring ? recurringExpense(recurring, selectedMonth) : id ? group.expenses.find((e) => e.id === id) : null;
  if (isClosed(group, (e?.date || defaultExpenseDate()).slice(0,7))) return notify("Reabra este mês antes de alterar despesas.");
  const family = analyzeGroupMonth(group,(e?.date || defaultExpenseDate()).slice(0,7));
  expenseDraft = {
    id: e?.id || null,
    recurringId: recurring?.id || null,
    recurringMonth: recurring ? selectedMonth : null,
    selectedIds: e ? Object.keys(e.shares) : family.members.filter(m=>m.role !== 'dependent').map(m=>m.id),
    mode: e?.mode || (family.familyReady ? 'family' : 'equal'),
    values: e?.values ? { ...e.values } : {},
    edited: new Set(e ? Object.keys(e.shares) : []),
    modes: {},
    originalShares: e?.shares || {},
    multiplePayers: e ? Object.keys(expensePayments(e)).length > 1 : false,
    payerValues: e ? Object.fromEntries(Object.entries(expensePayments(e)).map(([id, amount]) => [id, (amount / 100).toFixed(2).replace('.', ',')])) : {},
  };
  if (
    e &&
    expenseDraft.mode === "exact" &&
    !Object.keys(expenseDraft.values).length
  ) {
    expenseDraft.values = Object.fromEntries(
      Object.entries(e.shares).map(([id, value]) => [
        id,
        (value / 100).toFixed(2).replace(".", ","),
      ]),
    );
  }
  openDialog(`${dialogTitle(id ? "Editar despesa" : "Nova despesa", "Registre quem pagou e como dividir o valor.")}
    <form id="expense-form" class="dialog-body"><div class="field"><label for="expense-title">Descrição</label><input id="expense-title" name="title" required maxlength="120" placeholder="Escreva ou escolha uma sugestão abaixo" value="${escapeHTML(e?.title || "")}" /><div class="expense-presets" aria-label="Sugestões de despesas">${expensePresets.slice(0, 6).map(([title], i) => `<button type="button" class="preset-chip" data-action="expense-preset" data-preset="${i}">${escapeHTML(title)}</button>`).join('')}</div><details class="more-presets"><summary>Mais sugestões</summary><div class="expense-presets">${expensePresets.slice(6).map(([title], i) => `<button type="button" class="preset-chip" data-action="expense-preset" data-preset="${i + 6}">${escapeHTML(title)}</button>`).join('')}</div></details></div>
    <div class="field-row"><div class="field"><label for="expense-amount">Valor total (R$)</label><input id="expense-amount" name="amount" required inputmode="decimal" placeholder="0,00" autocomplete="off" value="${e ? (e.amount / 100).toFixed(2).replace(".", ",") : ""}" /></div><div class="field"><label for="expense-date">Data</label><input id="expense-date" name="date" required type="date" value="${escapeHTML(e?.date || defaultExpenseDate())}" /></div></div>
    <div class="field-row"><div class="field"><label for="expense-payer">Quem pagou?</label><select id="expense-payer" name="payerId">${optionsFor(
      group.members.map((m) => [m.id, m.name]),
      (e ? Object.keys(expensePayments(e))[0] : null) || family.contributors[0]?.id || group.members[0].id,
    )}</select></div><div class="field"><label for="expense-category">Categoria</label><select id="expense-category" name="category">${optionsFor(
      Object.entries(categories).map(([key, c]) => [key, c.name]),
      e?.category || "food",
    )}</select></div></div>
    <div class="payer-box"><label class="payer-toggle"><input type="checkbox" id="multiple-payers" ${expenseDraft.multiplePayers ? 'checked' : ''}> Mais de uma pessoa pagou esta conta</label><p class="field-hint">Registre o que cada pessoa desembolsou. A parte que cada um deve assumir é definida em “Como dividir?”.</p><div id="payer-editor"></div></div>
    <div class="field"><label for="expense-necessity">Como este gasto entra na análise do grupo?</label><select id="expense-necessity" name="necessity">${optionsFor(necessityOptions,e?.necessity || 'unknown')}</select><p class="field-hint">Uma categoria pode ter gastos necessários e opcionais. Classifique pela realidade do grupo.</p></div>
    <div class="field"><label for="expense-note">Observação (opcional)</label><input id="expense-note" name="note" maxlength="400" placeholder="Algo importante sobre este gasto?" value="${escapeHTML(e?.note || "")}" /></div>
    ${recurring ? `<p class="recurring-review-note">${icon('calendar')} Revise o valor, quem pagou e a divisão. Esta conta só será lançada ao salvar.</p>` : `<label class="payer-toggle recurring-checkbox"><input type="checkbox" name="makeRecurring" ${group.recurring?.some(t=>t.expense.id===e?.id) ? 'disabled' : ''}> Repetir mensalmente, com revisão antes de lançar</label><p class="field-hint">A partir do próximo mês, esta conta aparecerá como sugestão. Você pode pausar ou pular meses.</p>`}<div class="split-box"><div class="split-box-title">Como dividir?</div><div id="split-editor"></div></div>
    <div class="form-actions"><button type="button" class="button secondary" data-action="close-dialog">Cancelar</button><button type="submit" class="button primary">${e ? "Salvar despesa" : "Registrar despesa"} ${icon("arrow")}</button></div></form>`);
  renderPayerEditor();
  renderSplitEditor();
}
function renderPayerEditor() {
  const multiple = expenseDraft.multiplePayers;
  $('#expense-payer').disabled = multiple;
  $('#expense-payer').closest('.field').hidden = multiple;
  $('#payer-editor').innerHTML = multiple ? `<div class="payer-inputs">${groupNow().members.map((m, i) => `<div class="field"><label for="payer-value-${i}">${escapeHTML(m.name)} pagou (R$)</label><input id="payer-value-${i}" data-payer-id="${escapeHTML(m.id)}" inputmode="decimal" placeholder="0,00" value="${escapeHTML(expenseDraft.payerValues[m.id] || '')}"></div>`).join('')}</div><p id="payer-summary" class="field-hint" role="status"></p>` : '';
  updatePayerPreview();
}
function readExpensePayers(amount) {
  if (!expenseDraft.multiplePayers) return { [$('#expense-payer').value]: amount };
  const payers = Object.fromEntries(groupNow().members.map(m => [m.id, parseMoney(expenseDraft.payerValues[m.id] || '0')]).filter(([, value]) => value > 0));
  if (Object.values(payers).reduce((sum, value) => sum + value, 0) !== amount || !Object.keys(payers).length) {
    throw new Error('A soma de quem pagou precisa ser igual ao valor total da despesa.');
  }
  return payers;
}
function updatePayerPreview() {
  const summary = $('#payer-summary');
  if (!summary) return;
  try {
    const amount = parseMoney($('#expense-amount').value || '0');
    const total = Object.values(expenseDraft.payerValues).reduce((sum, value) => sum + parseMoney(value || '0'), 0);
    const difference = amount - total;
    summary.textContent = `Informado: ${formatMoney(total)} · ${difference > 0 ? 'Falta informar ' + formatMoney(difference) : difference < 0 ? 'Acima do total: ' + formatMoney(-difference) : 'Valores conferem'}`;
    summary.classList.toggle('negative', difference !== 0);
  } catch { summary.textContent = 'Use valores válidos, como 35,90.'; }
}
function renderSplitEditor() {
  if (!expenseDraft || !$("#split-editor")) return;
  const group = groupNow();
  const month = $('#expense-date')?.value?.slice(0,7);
  const family = isMonth(month) ? analyzeGroupMonth(group,month) : null;
  const participants = group.members.filter(m=>!family?.dependents.some(d=>d.id===m.id));
  expenseDraft.selectedIds = expenseDraft.selectedIds.filter(id=>participants.some(m=>m.id===id));
  const modes = [
    ["equal", "Igualmente"],
    ["exact", "Por valor"],
    ["percent", "Percentual"],
  ];
  if (family?.familyReady || expenseDraft.mode === 'family') modes.unshift(['family','Familiar']);
  if (expenseDraft.mode === 'family') {
    $('#split-editor').innerHTML = `<div class="split-tabs family-tabs" role="group" aria-label="Modo de divisão">${modes.map(([id,label])=>`<button type="button" data-mode="${id}" class="split-tab ${expenseDraft.mode===id?'active':''}" aria-pressed="${expenseDraft.mode===id}">${label}</button>`).join('')}</div><p class="field-hint">A divisão familiar usa o limite ainda disponível de cada contribuinte neste mês. Dependentes não recebem parcelas. Para registrar um gasto real acima dos limites, use uma divisão manual entre contribuintes; a análise continuará apontando a sobrecarga.</p><div class="split-preview" id="split-preview" aria-live="polite"></div>`;
    updateSplitPreview();
    return;
  }
  $("#split-editor").innerHTML =
    `<div class="split-tabs" role="group" aria-label="Modo de divisão">${modes.map(([id, label]) => `<button type="button" data-mode="${id}" class="split-tab ${expenseDraft.mode === id ? "active" : ""}" aria-pressed="${expenseDraft.mode === id}">${label}</button>`).join("")}</div>
    ${expenseDraft.mode !== "equal" ? '<p class="field-hint">O restante é dividido automaticamente entre os campos que você ainda não editou. Seus valores ficam preservados. Para voltar um campo ao automático, apague o valor e saia dele.</p>' : ""}${family?.dependents.length ? '<p class="field-hint">Dependentes não entram na divisão de pagamento deste mês.</p>' : ''}<div class="participant-rows">${participants.map((m) => `<div class="split-person-row"><label class="check-person"><input type="checkbox" data-share-id="${escapeHTML(m.id)}" ${expenseDraft.selectedIds.includes(m.id) ? "checked" : ""} /><span>${escapeHTML(m.name)}</span></label>${expenseDraft.mode === "equal" || !expenseDraft.selectedIds.includes(m.id) ? "" : `<input class="split-amount" data-split-id="${escapeHTML(m.id)}" inputmode="decimal" placeholder="${expenseDraft.mode === "percent" ? "0,00 %" : "R$ 0,00"}" aria-label="${expenseDraft.mode === "percent" ? "Percentual" : "Valor"} de ${escapeHTML(m.name)}" value="${escapeHTML(expenseDraft.values[m.id] ?? "")}" />`}</div>`).join("")}</div><div class="split-preview" id="split-preview" aria-live="polite"></div>`;
  updateSplitPreview();
}
function readSplitInputs() {
  if (!expenseDraft) return;
  for (const input of document.querySelectorAll("[data-split-id]"))
    expenseDraft.values[input.dataset.splitId] = input.value;
}
function completeDraftSplit() {
  if (!expenseDraft || !['exact', 'percent'].includes(expenseDraft.mode)) return;
  try {
    const total = expenseDraft.mode === 'percent' ? 10000 : parseMoney($('#expense-amount').value || '0');
    expenseDraft.values = completeSplit(total, expenseDraft.selectedIds, expenseDraft.values, expenseDraft.edited);
    for (const input of document.querySelectorAll('[data-split-id]')) {
      const id = input.dataset.splitId;
      if (!expenseDraft.edited.has(id)) input.value = expenseDraft.values[id] || '';
      input.classList.toggle('split-automatic', !expenseDraft.edited.has(id));
      input.title = expenseDraft.edited.has(id) ? 'Valor definido por você. Apague para voltar ao automático.' : 'Preenchido automaticamente. Você pode editar.';
    }
  } catch { /* The preview explains invalid inputs without replacing manual values. */ }
}
function updateSplitPreview() {
  completeDraftSplit();
  const node = $("#split-preview");
  if (!node || !expenseDraft) return;
  try {
    const total = parseMoney($("#expense-amount")?.value || "");
    const shares = draftExpenseShares(total,$('#expense-date').value);
    node.classList.remove("error");
    node.innerHTML = `<div class="split-preview-heading">${icon('check',16)} Divisão pronta</div><div class="split-preview-list">${Object.entries(shares).map(([id, amount]) => `<div><span>${escapeHTML(nameOf(groupNow(),id))}</span><strong>${formatMoney(amount)}</strong></div>`).join('')}</div>`;
  } catch (error) {
    node.classList.add("error");
    node.textContent = error.message;
  }
}
function draftExpenseShares(amount,date) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('A despesa precisa ser maior que zero.');
  if (expenseDraft.mode === 'family') return familyExpenseShares(groupNow(),date,amount,expenseDraft.id);
  const rows = groupNow().finances?.[date.slice(0,7)] || [];
  const ids = expenseDraft.selectedIds.filter(id=>!rows.some(r=>r.memberId===id && r.role==='dependent'));
  return sharesForExpense(amount,ids,expenseDraft.mode,expenseDraft.values);
}
function paymentForm(from = null, to = null, amount = null, month = selectedMonth, editId = null) {
  const group = groupNow();
  if (!group || group.members.length < 2) {
    notify(
      "Você precisa de pelo menos duas pessoas para registrar pagamentos.",
    );
    return;
  }
  const existing = group.payments.find(p => p.id === editId);
  if (existing) { from = existing.fromId; to = existing.toId; amount = existing.amount; month = paymentMonth(existing); }
  const pairs = group.members.map((m) => [m.id, m.name]);
  openDialog(`${dialogTitle("Registrar pagamento", "Informe a transferência que já aconteceu. Isso atualiza os saldos do mês escolhido.")}
    <form id="payment-form" class="dialog-body"><input type="hidden" name="id" value="${escapeHTML(editId || '')}"><div class="field"><label for="payment-month">Este acerto pertence a qual mês?</label><input type="month" name="settlementMonth" id="payment-month" value="${month}" required><p class="field-hint">Você pode pagar hoje uma dívida de outro mês. A data abaixo informa quando a transferência aconteceu.</p></div><div class="field-row"><div class="field"><label for="payment-from">Quem pagou?</label><select name="fromId" id="payment-from">${optionsFor(pairs, from || pairs[0][0])}</select></div><div class="field"><label for="payment-to">Quem recebeu?</label><select name="toId" id="payment-to">${optionsFor(pairs, to || pairs[1][0])}</select></div></div>
    <div class="field-row"><div class="field"><label for="payment-amount">Valor transferido</label><input id="payment-amount" name="amount" inputmode="decimal" required placeholder="0,00" value="${amount ? (amount / 100).toFixed(2).replace(".", ",") : ""}" /></div><div class="field"><label for="payment-date">Data</label><input id="payment-date" type="date" name="date" value="${existing?.date || today()}" required /></div></div><div class="warning-text">Registre somente pagamentos reais. O Dividi Aí não envia dinheiro nem realiza Pix.</div>
    <div class="form-actions"><button class="button secondary" data-action="close-dialog" type="button">Cancelar</button><button class="button primary" type="submit">Salvar pagamento ${icon("check")}</button></div></form>`);
}

function handleGroupSubmit(form) {
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const type = String(data.get("type"));
  const id = String(data.get("id") || "");
  if (!name || name.length > 70)
    return notify("Informe um nome de até 70 caracteres.");
  if (id) {
    const g = db.groups.find((x) => x.id === id);
    if (!g) return notify("Grupo não encontrado.");
    g.name = name;
    g.type = type;
    g.sample = false;
    closeDialog();
    persist("Grupo atualizado.");
    return;
  }
  const names = String(data.get("people") || "")
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length > 100 || names.some((s) => s.length > 60))
    return notify("Use até 100 nomes, com no máximo 60 caracteres cada.");
  if (
    new Set(names.map((x) => x.toLocaleLowerCase("pt-BR"))).size !==
    names.length
  )
    return notify("Evite nomes duplicados no grupo.");
  const g = {
    id: makeId(),
    name,
    type,
    createdAt: new Date().toISOString(),
    sample: false,
    members: names.map((n) => ({ id: makeId(), name: n })),
    expenses: [],
    payments: [],
  };
  db.groups.unshift(g);
  db.activeGroupId = g.id;
  view = "overview";
  expenseFilter = { text: "", category: "all" };
  closeDialog();
  persist("Grupo criado com sucesso.");
}
function handlePersonSubmit(form) {
  const group = groupNow();
  const name = String(new FormData(form).get("name") || "").trim();
  if (!name || name.length > 60)
    return notify("Informe um nome válido de até 60 caracteres.");
  if (group.members.length >= 100)
    return notify("Limite de 100 participantes atingido.");
  if (
    group.members.some(
      (m) =>
        m.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"),
    )
  )
    return notify("Já existe alguém com esse nome no grupo.");
  group.members.push({ id: makeId(), name });
  group.sample = false;
  closeDialog();
  persist("Participante adicionado.");
}
function handleExpenseSubmit(form) {
  const group = groupNow();
  readSplitInputs();
  const data = new FormData(form);
  const title = String(data.get("title") || "").trim();
  if (!title || title.length > 120)
    return notify("Informe uma descrição válida.");
  let amount, shares, payers;
  try {
    assertOpen(String(data.get("date")).slice(0,7));
    if (expenseDraft.recurringMonth && expenseDraft.recurringMonth !== String(data.get("date")).slice(0,7)) throw new Error("Use uma data do mês que está sendo revisado.");
    amount = parseMoney(data.get("amount"));
    payers = readExpensePayers(amount);
    shares = draftExpenseShares(amount,String(data.get('date')));
  } catch (error) {
    notify(error.message);
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.get("date"))))
    return notify("Escolha uma data válida.");
  const item = {
    id: expenseDraft.id || makeId(),
    title,
    amount,
    payers,
    category: String(data.get("category")),
    necessity: String(data.get('necessity') || 'unknown'),
    date: String(data.get("date")),
    note: String(data.get("note") || "").trim(),
    shares,
    mode: expenseDraft.mode,
    values: { ...expenseDraft.values },
    createdAt: new Date().toISOString(),
  };
  if (data.get('makeRecurring') && (group.recurring || []).length >= 100) return notify('Limite de 100 contas recorrentes por grupo.');
  if (expenseDraft.recurringId) {
    const template = group.recurring.find(t => t.id === expenseDraft.recurringId);
    if (!template || template.handled.includes(expenseDraft.recurringMonth)) return notify('Esta conta já foi revisada neste mês.');
    item.recurringId = template.id;
    template.handled.push(expenseDraft.recurringMonth);
  }
  if (expenseDraft.id) {
    const i = group.expenses.findIndex((e) => e.id === expenseDraft.id);
    if (i === -1) return notify("Despesa não encontrada.");
    item.createdAt = group.expenses[i].createdAt || item.createdAt;
    if (group.expenses[i].recurringId) item.recurringId = group.expenses[i].recurringId;
    group.expenses[i] = item;
  } else group.expenses.push(item);
  if (data.get('makeRecurring')) {
    group.recurring ||= [];
    group.recurring.push({id:makeId(), active:true, startMonth:shiftMonth(item.date.slice(0,7),1), day:Number(item.date.slice(8)), handled:[], expense:structuredClone(item)});
  }
  selectedMonth = item.date.slice(0,7);
  group.sample = false;
  closeDialog();
  persist("Despesa salva. Saldos atualizados.");
}
function handlePaymentSubmit(form) {
  const group = groupNow();
  const data = new FormData(form);
  const fromId = String(data.get("fromId")),
    toId = String(data.get("toId"));
  if (fromId === toId)
    return notify("Pagador e recebedor devem ser pessoas diferentes.");
  if (
    !group.members.some((m) => m.id === fromId) ||
    !group.members.some((m) => m.id === toId)
  )
    return notify("Participante não encontrado.");
  let amount;
  try {
    amount = parseMoney(data.get("amount"));
    if (amount <= 0) throw new Error("O valor deve ser maior que zero.");
  } catch (error) {
    return notify(error.message);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.get("date"))))
    return notify("Data inválida.");
  const settlementMonth = String(data.get("settlementMonth"));
  if (!isMonth(settlementMonth)) return notify("Escolha o mês ao qual pertence o acerto.");
  if (![fromId,toId].every(id => monthGroup(group,settlementMonth).members.some(m => m.id === id))) return notify('Escolha participantes que fazem parte do extrato deste mês.');
  const paymentId = String(data.get("id") || "");
  const payment = {
    id: paymentId || makeId(),
    settlementMonth,
    fromId,
    toId,
    amount,
    date: String(data.get("date")),
    createdAt: new Date().toISOString(),
  };
  const existingIndex = group.payments.findIndex(p => p.id === paymentId);
  if (paymentId && existingIndex < 0) return notify("Pagamento não encontrado.");
  if (existingIndex >= 0) group.payments[existingIndex] = payment;
  else group.payments.push(payment);
  group.sample = false;
  closeDialog();
  persist(paymentId ? "Pagamento atualizado." : "Pagamento registrado.");
}
async function deleteExpense(id) {
  const group = groupNow(),
    e = group.expenses.find((e) => e.id === id);
  if (!e) return;
  if (isClosed(group, e.date.slice(0,7))) return notify("Reabra este mês antes de excluir despesas.");
  if (
    !await requestDecision(
      `Excluir a despesa "${e.title}" (${formatMoney(e.amount)})? Os saldos serão recalculados.`,
    )
  )
    return;
  group.expenses = group.expenses.filter((e) => e.id !== id);
  group.sample = false;
  persist("Despesa excluída.");
}
async function deletePayment(id) {
  const group = groupNow();
  const p = group.payments.find((p) => p.id === id);
  if (
    !p ||
    !await requestDecision(`Excluir o registro de pagamento de ${formatMoney(p.amount)}? O acerto deixará de abater a dívida e os saldos serão recalculados. Isso não estorna uma transferência feita fora do aplicativo.`)
  )
    return;
  group.payments = group.payments.filter((p) => p.id !== id);
  group.sample = false;
  persist("Pagamento removido.");
}
async function deletePerson(id) {
  const group = groupNow();
  const m = group.members.find((m) => m.id === id);
  if (!m) return;
  if (Object.values(group.statementMembers || {}).some(rows => rows.some(member => member.id === id))) return notify('Esta pessoa faz parte de um extrato fechado. Reabra os meses relacionados antes de removê-la.');
  const used =
    group.expenses.some(
      (e) => Object.hasOwn(expensePayments(e), id) || Object.hasOwn(e.shares, id),
    ) || group.payments.some((p) => p.fromId === id || p.toId === id) || (group.recurring || []).some(t => Object.hasOwn(t.expense.shares,id) || Object.hasOwn(expensePayments(t.expense),id));
  if (used)
    return notify(
      "Essa pessoa já possui lançamentos ou modelos de contas recorrentes. Remova os modelos, despesas e pagamentos vinculados antes de removê-la.",
    );
  if (!await requestDecision(`Remover ${m.name} deste grupo?`)) return;
  group.members = group.members.filter((m) => m.id !== id);
  if (group.finances) for (const month of Object.keys(group.finances)) group.finances[month] = group.finances[month].filter(r=>r.memberId!==id);
  if (db.personal?.identities[group.id] === id)
    delete db.personal.identities[group.id];
  group.sample = false;
  persist("Participante removido.");
}
async function deleteGroup() {
  const group = groupNow();
  if (
    !group ||
    !await requestDecision(
      `Excluir "${group.name}" e todas as despesas, recorrências e pagamentos? A remoção ficará disponível no Histórico.`,
    )
  )
    return;
  db.groups = db.groups.filter((g) => g.id !== group.id);
  if (db.personal) delete db.personal.identities[group.id];
  db.activeGroupId = db.groups[0]?.id || null;
  view = "overview";
  expenseFilter = { text: "", category: "all" };
  closeDialog();
  persist("Grupo excluído.");
}
async function resetData() {
  if (
    !await requestDecision(
      "Apagar todos os grupos, despesas, participantes e pagamentos deste navegador? Essa ação também apaga o Histórico e não pode ser desfeita. Exporte um backup se quiser guardar os dados.",
      {title:"Apagar todos os dados?",label:"Apagar tudo",hint:"Esta limpeza é definitiva. O Histórico também será removido."},
    )
  )
    return;
  db = emptyData();
  view = "overview";
  expenseFilter = { text: "", category: "all" };
  closeDialog();
  persist("Tudo limpo. Pode começar de novo.", {audit:false});
}
function exportData() {
  const filename = `dividi-ai-backup-${today()}.json`;
  const blob = new Blob(
    [JSON.stringify({ ...db, exportedAt: new Date().toISOString() }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  notify("Backup gerado. Guarde seu arquivo com cuidado.");
}
async function importData(file) {
  if (!file) return;
  if (file.size > 8_000_000)
    return notify("Arquivo muito grande. O limite é de 8 MB.");
  try {
    const parsed = JSON.parse(await file.text());
    if (!isValidData(parsed))
      throw new Error("Estrutura de dados incompatível ou inválida.");
    if (
      !await requestDecision(
        `Importar ${parsed.groups.length} grupo(s)? Isso SUBSTITUIRÁ todos os dados salvos neste navegador.`,
      )
    )
      return;
    db = {
      version: 1,
      groups: parsed.groups,
      history: parsed.history || [],
      ...(parsed.personal ? { personal: parsed.personal } : {}),
      activeGroupId: parsed.groups.some((g) => g.id === parsed.activeGroupId)
        ? parsed.activeGroupId
        : parsed.groups[0]?.id || null,
    };
    migrateData(db);
    selectedMonth = nextOpenMonth(groupNow());
    view = "overview";
    expenseFilter = { text: "", category: "all" };
    persist("Backup importado com sucesso.");
  } catch (error) {
    notify("Não foi possível importar: " + error.message);
  }
}
async function shareSummary() {
  const g = groupNow();
  if (!g) return;
  const s = groupStats(monthGroup(g, selectedMonth));
  const lines = [
    `Dividi Aí · ${g.name} · ${monthLabel(selectedMonth)}`,
    `Despesas: ${formatMoney(s.total)} · ${g.members.length} participantes`,
    "",
    "Acertos sugeridos:",
    ...(!s.settlements.length
      ? ["Tudo acertado!"]
      : s.settlements.map(
          (p) =>
            `• ${nameOf(g, p.fromId)} paga ${formatMoney(p.amount)} para ${nameOf(g, p.toId)}`,
        )),
    "",
    "Resumo gerado pelo Dividi Aí. Confirme os valores antes de transferir.",
  ];
  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    notify("Resumo copiado! Envie para seu grupo.");
  } catch {
    openDialog(
      `${dialogTitle("Compartilhar resumo", "Copie o texto abaixo para enviar pelo WhatsApp ou onde preferir.")}<div class="dialog-body"><div class="field"><textarea id="summary-text" rows="10" readonly style="min-height:220px">${escapeHTML(text)}</textarea></div><div class="form-actions"><button type="button" class="button primary" data-action="close-dialog">Fechar</button></div></div>`,
    );
    $("#summary-text").select();
  }
}

document.addEventListener("click", async (event) => {
  const btn = event.target.closest(
    "button[data-action],button[data-view],button[data-group],button[data-mode]",
  );
  if (!btn) return;
  if (btn.dataset.view) {
    view = btn.dataset.view;
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }
  if (btn.dataset.group) {
    db.activeGroupId = btn.dataset.group;
    view = "overview";
    expenseFilter = { text: "", category: "all" };
    persist();
    return;
  }
  if (btn.dataset.mode) {
    readSplitInputs();
    expenseDraft.modes[expenseDraft.mode] = { values: { ...expenseDraft.values }, edited: new Set(expenseDraft.edited) };
    expenseDraft.mode = btn.dataset.mode;
    const saved = expenseDraft.modes[expenseDraft.mode];
    expenseDraft.values = saved ? { ...saved.values } : {};
    expenseDraft.edited = new Set(saved?.edited || []);
    renderSplitEditor();
    return;
  }
  const action = btn.dataset.action;
  if (action === 'group-access') {
    const group = groupNow();
    if (!group) return;
    openDialog(`${dialogTitle('Acesso ao grupo', escapeHTML(group.name))}<div class="dialog-body access-preview"><span class="status-badge">Em breve</span><h3>Organize o grupo com outras pessoas</h3><p>O espaço para convites está preparado. Por enquanto, este grupo continua salvo somente neste navegador.</p><div class="field"><label for="group-invite-preview">Link de convite</label><div class="access-link-row"><input id="group-invite-preview" placeholder="O link aparecerá aqui quando estiver disponível" disabled><button class="button secondary" disabled>Copiar link</button></div></div><div class="access-features"><div>${icon('people')}<span><strong>Participantes conectados</strong><small>Acesso ao mesmo grupo em outros aparelhos.</small></span></div><div>${icon('shield')}<span><strong>Permissões de acesso</strong><small>Controles de visualização e edição previstos.</small></span></div></div><p class="field-hint">Nenhum link ou código de acesso é gerado nesta versão. Para enviar os valores atuais, use Compartilhar resumo.</p><div class="form-actions"><button class="button primary" data-action="close-dialog">Entendi</button></div></div>`);
    return;
  }
  if (action === 'explain-pending' || action === 'explain-settlement') {
    const group = groupNow();
    if (!group) return;
    openDialog(`${dialogTitle('Entenda o que falta acertar', 'As despesas e os pagamentos que formaram o saldo deste mês.')}${renderPendingExplanation(monthGroup(group,selectedMonth),selectedMonth,btn.dataset.from,btn.dataset.to)}`);
    dialog.classList.add('explanation-dialog');
    const title = $('#dialog-title'); title.tabIndex = -1; title.focus({preventScroll:true}); dialog.scrollTop = 0;
    return;
  }
  if (action === 'history') { view = 'history'; render(); return; }
  if (['previous-month','next-month','current-month','open-month'].includes(action)) {
    const month = action === 'current-month' ? currentMonth() : action === 'open-month' ? btn.dataset.month : shiftMonth(selectedMonth, action === 'previous-month' ? -1 : 1);
    if (!isMonth(month) || month < '1000-01' || month > '9998-12') return;
    selectedMonth = month;
    if (action === 'open-month') view = 'overview';
    expenseFilter = { text:'', category:'all' }; render(); return;
  }
  if (action === 'close-month' || action === 'reopen-month') {
    const group = groupNow();
    const closing = action === 'close-month';
    if (closing && selectedMonth > currentMonth()) return notify('O mês ainda não começou. Feche somente meses atuais ou anteriores.');
    const stats = groupStats(monthGroup(group, selectedMonth));
    if (!await requestDecision(closing ? 'As despesas e rendas deste período ficam protegidas contra alterações. O próximo mês terá seus próprios lançamentos. Os acertos pendentes continuam visíveis e podem ser pagos depois.' : 'O extrato volta a aceitar alterações nas despesas e rendas. Os pagamentos e registros existentes serão preservados.', {
      title: `${closing ? 'Fechar' : 'Reabrir'} ${monthLabel(selectedMonth)}?`, label: closing ? 'Fechar e ir ao próximo mês' : 'Reabrir extrato',
      metrics:[{label:'Despesas do mês',value:formatMoney(stats.total)},{label:'Ainda falta acertar',value:formatMoney(stats.pending)}],
      hint: closing ? 'Nenhuma despesa será apagada. Contas recorrentes não revisadas não serão lançadas. Você pode voltar a este extrato pelo seletor de mês.' : 'As próximas alterações aparecerão no Histórico.',
    })) return;
    group.closedMonths = closing ? [...new Set([...(group.closedMonths || []), selectedMonth])] : (group.closedMonths || []).filter(m => m !== selectedMonth);
    if (closing) group.statementMembers = {...group.statementMembers,[selectedMonth]:structuredClone(group.members)};
    else if (group.statementMembers) delete group.statementMembers[selectedMonth];
    if (persist(`${monthLabel(selectedMonth)}: ${closing ? 'mês fechado' : 'mês reaberto'}.`) && closing) { selectedMonth = shiftMonth(selectedMonth,1); render(); }
    return;
  }
  if (action === 'undo-change') {
    const entry = db.history?.find(row => row.id === btn.dataset.id);
    if (!entry || entry.undoneAt) return notify('Esta alteração não está disponível para desfazer.');
    if (!await requestDecision('Os dados afetados voltarão ao estado anterior a esta alteração. Outras operações que não dependem deles serão preservadas.', {title:'Desfazer esta alteração?',label:'Desfazer alteração',details:[entry.label, entry.context || 'Conta local']})) return;
    try {
      const next = undoChange(db, entry.id);
      for (const group of db.groups) {
        const restored = next.groups.find(g => g.id === group.id);
        if (!restored) continue;
        for (const month of group.closedMonths || []) {
          if (isClosed(restored, month) && (JSON.stringify(monthGroup(group, month).expenses) !== JSON.stringify(monthGroup(restored, month).expenses) || JSON.stringify(group.finances?.[month]) !== JSON.stringify(restored.finances?.[month]))) throw new Error('Reabra o mês afetado antes de desfazer esta alteração.');
        }
      }
      if (!isValidData(next)) throw new Error('Há registros relacionados a esta alteração. Desfaça-os primeiro para preservar os dados.');
      db = next; persist('Alteração desfeita.', {audit:false});
    } catch (error) { notify(error.message); }
    return;
  }
  if (action === 'review-recurring') {
    const template = recurringDue(groupNow(), selectedMonth).find(t => t.id === btn.dataset.id);
    if (template) expenseForm(null, template);
    return;
  }
  if (action === 'skip-recurring' || action === 'toggle-recurring' || action === 'delete-recurring') {
    const template = groupNow().recurring?.find(t => t.id === btn.dataset.id);
    if (!template) return;
    if (action === 'delete-recurring') {
      if (!await requestDecision(`Excluir o modelo recorrente “${template.expense.title}”? As despesas já lançadas e seus acertos serão mantidos.`, {title:'Remover esta recorrência?',label:'Remover modelo'})) return;
      groupNow().recurring = groupNow().recurring.filter(t => t.id !== template.id);
      persist(`Modelo recorrente removido: ${template.expense.title}.`);
      return;
    }
    if (action === 'skip-recurring') {
      if (isClosed(groupNow(),selectedMonth)) return notify('Reabra o mês antes de revisar contas recorrentes.');
      if (!await requestDecision(`A conta “${template.expense.title}” não será lançada em ${monthLabel(selectedMonth)}. Ela continua programada para os outros meses.`, {title:'Pular esta conta no mês?',label:'Pular este mês'})) return;
      template.handled = [...new Set([...template.handled, selectedMonth])];
      persist(`Conta recorrente pulada: ${template.expense.title}.`);
    } else {
      template.active = !template.active;
      persist(`Conta recorrente ${template.active ? 'retomada' : 'pausada'}: ${template.expense.title}.`);
    }
    return;
  }
  if (action === 'copy-budget') {
    const previous = db.personal?.budgets?.[shiftMonth(selectedMonth,-1)];
    if (!previous) return;
    db.personal.budgets[selectedMonth] = structuredClone(previous);
    persist('Valores pessoais copiados. Revise sua renda e seus gastos deste mês.');
    return;
  }
  if (action === 'edit-payment') return paymentForm(null, null, null, selectedMonth, btn.dataset.id);
  if (action === 'person-income') return personIncomeForm(btn.dataset.id);
  if (action === 'expense-preset') {
    const preset = expensePresets[Number(btn.dataset.preset)];
    if (!preset || !expenseDraft) return;
    $('#expense-title').value = preset[0];
    $('#expense-category').value = preset[1];
    $('#expense-category').dispatchEvent(new Event('change', { bubbles: true }));
    $('#expense-amount').focus();
    return;
  }
  if (action === "toggle-theme") {
    theme = theme === "light" ? "dark" : "light";
    saveTheme(theme);
    applyTheme();
    return;
  }
  if (action === "new-group") return groupForm();
  if (action === 'group-finance') { view = 'group-finance'; render(); window.scrollTo({top:0,behavior:'instant'}); return; }
  if (action === 'apply-family-split') {
    try {
      const group = groupNow();
      assertOpen();
      const plan = proposeFamilyMonth(group,selectedMonth);
      if (!plan.length) return;
      const analysis = analyzeGroupMonth(group, selectedMonth);
      if (!await requestDecision(`As parcelas de ${monthLabel(selectedMonth)} serão redistribuídas na proporção dos limites de ajuda. Confira a mudança para cada pessoa. Dependentes não receberão cobranças.`, {
        title: 'Aplicar a divisão familiar?',
        label: 'Aplicar às despesas deste mês',
        metrics: [{label:'Despesas',value:String(plan.length)}, {label:'Total do mês',value:formatMoney(analysis.spending)}],
        comparisons: analysis.members.map(member => ({name:member.name,before:member.allocated,after:member.suggested || 0,dependent:member.role === 'dependent',limit:member.contribution})),
        hint: 'Quem pagou na hora, os valores totais e os acertos já registrados serão mantidos. Os saldos serão recalculados. Outros meses não mudam. Você poderá desfazer esta divisão pelo Histórico enquanto essas despesas não forem alteradas novamente.',
      })) return;
      for (const row of plan) {
        const expense=group.expenses.find(e=>e.id===row.id);
        expense.shares=row.shares;expense.mode='family';expense.values={};
      }
      group.sample=false;
      persist('Divisão familiar aplicada às despesas deste mês.');
    } catch(error) { notify(error.message); }
    return;
  }
  if (action === 'delete-group-finance') {
    if (isClosed(groupNow(), selectedMonth)) return notify("Reabra o mês para alterar suas rendas.");
    if (!await requestDecision('Apagar as rendas e contribuições deste mês? As despesas e os outros meses serão mantidos.')) return;
    delete groupNow().finances[selectedMonth];
    persist('Rendas deste mês apagadas.');
    return;
  }
  if (action === "personal-payment") {
    const group = db.groups.find((g) => g.id === btn.dataset.paymentGroup);
    if (!group) return;
    db.activeGroupId = group.id;
    return paymentForm(
      btn.dataset.from,
      btn.dataset.to,
      Number(btn.dataset.amount),
      btn.dataset.month || selectedMonth,
    );
  }
  if (action === "delete-budget") {
    if (
      !await requestDecision(
        "Apagar sua renda e seu planejamento mensal deste navegador? Os grupos serão mantidos.",
      )
    )
      return;
    if (db.personal?.budgets) delete db.personal.budgets[selectedMonth];
    persist("Planejamento removido.");
    return;
  }
  if (action === "edit-group") return groupForm(groupNow());
  if (action === "new-person") return personForm();
  if (action === "new-expense") return expenseForm();
  if (action === "edit-expense") return expenseForm(btn.dataset.id);
  if (action === "new-payment") return paymentForm();
  if (action === "settle")
    return paymentForm(
      btn.dataset.from,
      btn.dataset.to,
      Number(btn.dataset.amount),
      btn.dataset.month || selectedMonth,
    );
  if (action === "delete-expense") return deleteExpense(btn.dataset.id);
  if (action === "delete-payment") return deletePayment(btn.dataset.id);
  if (action === "delete-person") return deletePerson(btn.dataset.id);
  if (action === "delete-group") return deleteGroup();
  if (action === "close-dialog") return closeDialog();
  if (action === "reset") return resetData();
  if (action === "export") return exportData();
  if (action === "import") return $("#import-input").click();
  if (action === "share") return void shareSummary();
});

document.addEventListener("submit", (event) => {
  if (event.target.id === 'person-income-form') {
    event.preventDefault();
    savePersonIncome(event.target);
    return;
  }
  if (event.target.id === 'group-finance-form') {
    event.preventDefault();
    saveGroupFinances(event.target);
    return;
  }
  if (event.target.id === "budget-form") {
    event.preventDefault();
    saveBudget(event.target);
    return;
  }
  if (
    !["group-form", "person-form", "expense-form", "payment-form"].includes(
      event.target.getAttribute("id"),
    )
  )
    return;
  event.preventDefault();
  if (event.target.getAttribute("id") === "group-form")
    handleGroupSubmit(event.target);
  else if (event.target.getAttribute("id") === "person-form")
    handlePersonSubmit(event.target);
  else if (event.target.getAttribute("id") === "expense-form")
    handleExpenseSubmit(event.target);
  else handlePaymentSubmit(event.target);
});
document.addEventListener("input", (event) => {
  if (event.target.id === "expense-search") {
    expenseFilter.text = event.target.value;
    const results = $('#expense-results');
    if (results && groupNow()) results.outerHTML = renderExpenseResults(monthGroup(groupNow(), selectedMonth));
  }
  if (event.target.id === "expense-amount") { updateSplitPreview(); updatePayerPreview(); }
  if (event.target.matches('[data-payer-id]')) {
    expenseDraft.payerValues[event.target.dataset.payerId] = event.target.value;
    updatePayerPreview();
  }
  if (event.target.matches("[data-split-id]")) {
    expenseDraft.edited.add(event.target.dataset.splitId);
    expenseDraft.values[event.target.dataset.splitId] = event.target.value;
    updateSplitPreview();
  }
});
document.addEventListener("change", (event) => {
  if (event.target.matches('[data-split-id]') && !event.target.value.trim()) {
    expenseDraft.edited.delete(event.target.dataset.splitId);
    updateSplitPreview();
    return;
  }
  if (event.target.id === 'statement-month') {
    if (!isMonth(event.target.value)) { event.target.value = selectedMonth; return; }
    selectedMonth = event.target.value; expenseFilter = {text:'',category:'all'}; render(); return;
  }
  if (event.target.id === 'include-group-shares') {
    $('#integration-hint').textContent = event.target.checked ? 'Preencha abaixo somente gastos fora dos grupos. Retire os valores dos grupos que já estavam nos campos; as parcelas serão somadas automaticamente, uma única vez.' : 'Preencha seus gastos totais, incluindo a sua parte nos grupos. A soma automática está desligada.';
    return;
  }
  if (event.target.id === 'multiple-payers') {
    expenseDraft.multiplePayers = event.target.checked;
    renderPayerEditor();
    return;
  }
  if (event.target.id === 'income-role') {
    $('#member-income').disabled = event.target.value === 'dependent';
    $('#member-contribution').disabled = event.target.value === 'dependent';
    return;
  }
  if (event.target.id === 'expense-date') { readSplitInputs(); renderSplitEditor(); return; }
  if (event.target.id === 'group-finance-month') {
    if (!isMonth(event.target.value)) { event.target.value = selectedMonth; return; }
    selectedMonth = event.target.value;
    render();
    $('#group-finance-month').focus();
    return;
  }
  if (event.target.matches('[data-family-role]')) {
    const index = event.target.dataset.familyRole;
    const dependent = event.target.value !== 'contributor';
    $(`#income-${index}`).disabled = dependent;
    $(`#contribution-${index}`).disabled = dependent;
    if (!dependent) $(`#income-${index}`).focus();
    return;
  }
  if (event.target.matches('[data-expense-necessity]')) {
    if (isClosed(groupNow(), selectedMonth)) { render(); return notify("Reabra o mês para alterar as classificações."); }
    const id = event.target.dataset.expenseNecessity;
    const expense = groupNow()?.expenses.find(e=>e.id===id);
    if (!expense || !necessityOptions.some(([value])=>value===event.target.value)) return;
    expense.necessity = event.target.value;
    groupNow().sample = false;
    persist('Classificação atualizada.');
    const select = [...document.querySelectorAll('[data-expense-necessity]')].find(node=>node.dataset.expenseNecessity===id);
    if (select) { select.closest('details').open = true; select.focus(); }
    return;
  }
  if (event.target.matches("[data-identity-group]")) {
    db.personal ||= { identities: {}, budget: null };
    const groupId = event.target.dataset.identityGroup;
    if (event.target.value)
      db.personal.identities[groupId] = event.target.value;
    else delete db.personal.identities[groupId];
    persist("Seu vínculo foi atualizado.");
    return;
  }
  if (event.target.matches("[data-budget-cost]")) {
    const input = $(`#cost-${event.target.dataset.budgetCost}`);
    input.disabled = !event.target.checked;
    if (event.target.checked) {
      input.focus();
      input.select();
    }
    return;
  }
  if (event.target.id === "expense-filter") {
    expenseFilter.category = event.target.value;
    render();
  }
  if (event.target.id === "mobile-group-select") {
    if (event.target.value === "__new__") {
      groupForm();
      event.target.value = groupNow()?.id || "__new__";
    } else {
      db.activeGroupId = event.target.value;
      view = "overview";
      expenseFilter = { text: "", category: "all" };
      persist();
    }
  }
  if (event.target.matches("[data-share-id]")) {
    readSplitInputs();
    const id = event.target.dataset.shareId;
    if (event.target.checked && !expenseDraft.selectedIds.includes(id))
      expenseDraft.selectedIds.push(id);
    if (!event.target.checked)
      expenseDraft.selectedIds = expenseDraft.selectedIds.filter(
        (x) => x !== id,
      );
    expenseDraft.selectedIds = groupNow()
      .members.filter((m) => expenseDraft.selectedIds.includes(m.id))
      .map((m) => m.id);
    renderSplitEditor();
  }
  if (event.target.id === "import-input") {
    void importData(event.target.files?.[0]);
    event.target.value = "";
  }
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closeDialog();
});
dialog.addEventListener("close", () => {
  expenseDraft = null;
});
applyTheme();
render();
if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1")
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// A aba pode atravessar a virada do mês sem recarregar. Não interrompa formulários abertos.
let observedMonth = currentMonth();
function checkMonthRollover() {
  const next = currentMonth();
  if (next !== observedMonth && !document.querySelector('dialog[open]')) {
    if (selectedMonth === observedMonth) selectedMonth = next;
    observedMonth = next;
    render();
  }
}
window.addEventListener('focus', checkMonthRollover);
setInterval(checkMonthRollover, 60000);
