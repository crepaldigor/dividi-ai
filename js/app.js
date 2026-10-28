import { renderBudgetAnalysis } from "./analysis-view.js";
import { renderGroupFinance } from './group-finance-view.js';
import { isMonth, isValidGroupFinances, necessityOptions, analyzeGroupMonth, familyExpenseShares, proposeFamilyMonth } from './group-finance.js';
import {
  parseMoney,
  formatMoney,
  sharesForExpense,
  calculateBalances,
  suggestSettlements,
  groupStats,
  paidBy,
  owedBy,
} from "./engine.js";
import {
  loadData,
  saveData,
  emptyData,
  isValidData,
  makeId,
  getSavedTheme,
  saveTheme,
} from "./storage.js";

import {
  budgetCategories,
  personalBalances,
  analyzeBudget,
} from "./personal.js";

const $ = (selector, root = document) => root.querySelector(selector);
const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateLabel = (date) => {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? "Data desconhecida"
    : new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(d);
};
const iconPaths = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
  people:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2c0-3 2.5-5 6-5s6 2 6 5v2M17 5c2.5 0 4 2 4 4s-1.5 4-4 4M18 15c2 .5 3 2 3 5"/>',
  receipt:
    '<path d="M7 3h10l3 3v15l-5-2-3 2-3-2-5 2V6l3-3Z"/><path d="M9 10h6M9 14h6"/>',
  wallet:
    '<rect x="3" y="6" width="18" height="15" rx="3"/><path d="M3 10V6a3 3 0 0 1 3-3h12M16 15h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16v4ZM14 6l4 4"/>',
  trash: '<path d="M4 7h16M10 4h4M6 7l1 14h10l1-14M10 11v6m4-6v6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  cup: '<path d="M4 7h13v7a6.5 6.5 0 0 1-13 0V7Zm13 2h2a3 3 0 0 1 0 6h-2M3 21h17"/>',
  car: '<path d="m5 11 2-5h10l2 5M4 11h16v8H4zM7 19v2m10-2v2M7 15h2m6 0h2"/>',
  house: '<path d="m3 10 9-7 9 7v11H3V10ZM9 21v-7h6v7"/>',
  bag: '<path d="M4 8h16l-1 13H5L4 8ZM9 9V6a3 3 0 0 1 6 0v3"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-4 0-7-1.2-7-3 0-3 5-3 7 3Zm0 0c4 0 7-1.2 7-3 0-3-5-3-7 3Z"/>',
  chart: '<path d="M4 20V9m5 11V4m5 16v-7m5 7V8M2 20h20"/>',
  dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  shield:
    '<path d="m12 2 9 4v6c0 5-3 8-9 10-6-2-9-5-9-10V6l9-4Z"/><path d="m9 12 2 2 4-4"/>',
  party:
    '<path d="m4 20 5-13 8 8-13 5ZM12 4l2 2M19 5l2-2M19 11l2 2M9 2l-1 3"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 8c-1-.7-2.5-1-4-.5-3 1-3 3.5 0 4.5s4 3 1 4c-1.3.5-3 .3-4-1M12 5v14"/>',
};
const icon = (name, size = 18) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || iconPaths.coin}</svg>`;
const typeNames = {
  trip: "Viagem",
  home: "Casa",
  friends: "Amigos",
  event: "Evento",
  other: "Outros",
};
const typeSymbols = {
  trip: "↗",
  home: "⌂",
  friends: "✳",
  event: "✦",
  other: "◈",
};
const categories = {
  food: { name: "Alimentação", icon: "cup", color: "#ffad78" },
  stay: { name: "Hospedagem", icon: "house", color: "#b5e56b" },
  transport: { name: "Transporte", icon: "car", color: "#83b4ff" },
  leisure: { name: "Lazer", icon: "party", color: "#b69bfa" },
  shopping: { name: "Compras", icon: "bag", color: "#f2cd6d" },
  other: { name: "Outros", icon: "receipt", color: "#a7a9a1" },
};
const nameOf = (group, id) =>
  group.members.find((m) => m.id === id)?.name || "Participante";
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
let view = "overview";
let groupFinanceMonth = today().slice(0,7);
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
function persist(message) {
  if (!saveData(db))
    notify(
      "Não foi possível salvar. Exporte um backup para não perder seus dados.",
    );
  else if (message) notify(message);
  render();
}
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
          `<button type="button" class="group-link ${groupNow()?.id === g.id ? "active" : ""}" data-group="${escapeHTML(g.id)}" aria-label="Abrir grupo ${escapeHTML(g.name)}" title="${escapeHTML(g.name)}"><span class="group-symbol" data-type="${escapeHTML(g.type || "other")}">${typeSymbols[g.type] || "◈"}</span><span class="group-link-name">${escapeHTML(g.name)}</span></button>`,
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
  if (view === "personal") {
    $("#topbar-group").textContent = "Meu painel";
    $("#workspace").innerHTML = renderPersonal();
    return;
  }
  if (!group) {
    $("#workspace").innerHTML = renderWelcome();
    return;
  }
  const stats = groupStats(group);
  if (view === 'group-finance') {
    $('#workspace').innerHTML = renderGroupFinance(group, groupFinanceMonth);
    return;
  }
  if (view === "expenses")
    $("#workspace").innerHTML = renderExpensesView(group, stats);
  else if (view === "people")
    $("#workspace").innerHTML = renderPeopleView(group, stats);
  else $("#workspace").innerHTML = renderOverview(group, stats);
}
const smallCurrency = (cents) => formatMoney(cents);
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
  return `<header class="page-head"><div><p class="eyebrow">${escapeHTML(typeNames[group.type] || "SEU GRUPO")} | ${escapeHTML(group.name)}${group.sample ? '<span class="note-chip">EXEMPLO</span>' : ""}</p><h1>${heading}</h1><p class="page-subtitle">${description}</p></div>${actions ? `<div class="head-buttons"><button class="icon-button" data-action="edit-group" aria-label="Gerenciar grupo" title="Gerenciar grupo">${icon("edit")}</button><button class="button secondary" data-action="share">${icon("upload")} Compartilhar resumo</button><button class="button primary" data-action="new-expense">${icon("plus")} Nova despesa</button></div>` : ""}</header>`;
}
function statBlock(label, iconName, value, foot, accent = false) {
  return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon ${accent ? "accent" : ""}">${icon(iconName)}</span></div><div class="stat-number">${value}</div><p class="stat-foot">${foot}</p></article>`;
}
function renderOverview(group, stats) {
  return `${pageHead(group, "O grupo em números.", "Os gastos, a galera e o que falta acertar.")}
  <section class="finance-entry"><div><span class="eyebrow">RENDA | CONTRIBUIÇÃO | DESPESAS</span><h2>O que cabe no orçamento do grupo?</h2><p>Informe as rendas, quem ajuda a pagar e o valor disponível de cada pessoa.</p></div><button class="button secondary" data-action="group-finance">Analisar orçamento do grupo ${icon('arrow')}</button></section>
  <section class="stats-grid" aria-label="Resumo financeiro">
    ${statBlock("Total de despesas", "wallet", formatMoney(stats.total), "Valor de todas as despesas do grupo")}
    ${statBlock("Participantes", "people", String(group.members.length), `${group.members.length === 1 ? "Pessoa cadastrada" : "Pessoas dividindo as contas"}`)}
    ${statBlock("Falta acertar", "receipt", formatMoney(stats.pending), `${stats.settlements.length} ${stats.settlements.length === 1 ? "transferência sugerida" : "transferências sugeridas"}`, true)}
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
        `<div class="settle-item">${shortAvatar(nameOf(group, p.fromId))}<div class="settle-copy"><strong>${escapeHTML(nameOf(group, p.fromId))}</strong> paga para <strong>${escapeHTML(nameOf(group, p.toId))}</strong><span class="settle-money">${formatMoney(p.amount)}</span></div><button class="settle-confirm" data-action="settle" data-from="${escapeHTML(p.fromId)}" data-to="${escapeHTML(p.toId)}" data-amount="${p.amount}" title="Registrar este pagamento">Marcar pago</button></div>`,
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
  return `<div class="activity-list">${last.map((e) => `<div class="activity-item">${categoryBubble(e.category)}<div class="activity-main"><div class="activity-title">${escapeHTML(e.title)}</div><div class="activity-sub">${escapeHTML(nameOf(group, e.payerId))} pagou · ${dateLabel(e.date)}</div></div><div class="activity-value">${formatMoney(e.amount)}<span class="small-text">${escapeHTML(categories[e.category]?.name || "Outros")}</span></div></div>`).join("")}</div>`;
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
function renderExpensesView(group, stats) {
  const needle = expenseFilter.text.toLocaleLowerCase("pt-BR");
  const entries = sortEntries(group.expenses).filter(
    (e) =>
      (expenseFilter.category === "all" ||
        e.category === expenseFilter.category) &&
      `${e.title} ${nameOf(group, e.payerId)} ${e.note || ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(needle),
  );
  return `${pageHead(group, "Despesas do grupo.", "Tudo registrado, fácil de encontrar e revisar.")}
  <div class="toolbar"><label class="searchbox">${icon("search")}<input type="search" id="expense-search" placeholder="Buscar despesas, pessoas..." value="${escapeHTML(expenseFilter.text)}" aria-label="Buscar despesas" /></label><select class="select-filter" id="expense-filter" aria-label="Filtrar categoria"><option value="all">Todas as categorias</option>${Object.entries(
    categories,
  )
    .map(
      ([id, c]) =>
        `<option value="${id}" ${expenseFilter.category === id ? "selected" : ""}>${escapeHTML(c.name)}</option>`,
    )
    .join("")}</select></div>
  <section class="panel"><div class="table-intro"><span>Despesas lançadas</span><span>${entries.length} de ${group.expenses.length} ${group.expenses.length === 1 ? "despesa" : "despesas"}</span></div>
  ${entries.length ? entries.map((e) => `<div class="expense-item"><div class="expense-grid">${categoryBubble(e.category)}<div><div class="expense-title">${escapeHTML(e.title)}</div><div class="expense-meta">${dateLabel(e.date)} · ${escapeHTML(nameOf(group, e.payerId))} pagou · Dividida entre ${Object.keys(e.shares).length}</div></div><div class="expense-value">${formatMoney(e.amount)}</div><div class="expense-edit"><button class="tertiary-button" data-action="edit-expense" data-id="${escapeHTML(e.id)}" aria-label="Editar ${escapeHTML(e.title)}" title="Editar">${icon("edit")}</button><button class="tertiary-button" data-action="delete-expense" data-id="${escapeHTML(e.id)}" aria-label="Excluir ${escapeHTML(e.title)}" title="Excluir">${icon("trash")}</button></div></div>${e.note ? `<div class="expense-note">${escapeHTML(e.note)}</div>` : ""}</div>`).join("") : `<div class="empty-state"><div class="empty-illustration">${icon("receipt")}</div><h3>${group.expenses.length ? "Nenhum resultado" : "Seu histórico começa aqui"}</h3><p>${group.expenses.length ? "Tente outra busca ou categoria." : "Registre o primeiro gasto para organizar a divisão."}</p>${group.expenses.length ? "" : '<button class="button primary compact" data-action="new-expense">Nova despesa</button>'}</div>`}</section>
  <section class="panel ledger"><div class="table-intro"><span>Pagamentos registrados</span><span>${group.payments.length} ${group.payments.length === 1 ? "pagamento" : "pagamentos"}</span></div>${
    group.payments.length
      ? sortEntries(group.payments)
          .map(
            (p) =>
              `<div class="payment-item"><div><div class="payment-title">${escapeHTML(nameOf(group, p.fromId))} pagou ${escapeHTML(nameOf(group, p.toId))}</div><div class="payment-sub">${dateLabel(p.date)} · Pagamento registrado</div></div><div class="payment-right"><span class="payment-amount">${formatMoney(p.amount)}</span><button class="tertiary-button" data-action="delete-payment" data-id="${escapeHTML(p.id)}" aria-label="Excluir pagamento" title="Excluir registro">${icon("trash")}</button></div></div>`,
          )
          .join("")
      : '<div class="empty-state"><p>Nenhum pagamento registrado neste grupo.</p></div>'
  }<div style="padding:0 22px 18px;text-align:right"><button class="text-action" data-action="new-payment">+ Registrar pagamento</button></div></section>`;
}
function renderPeopleView(group, stats) {
  return `${pageHead(group, "Gente que divide.", "Todos os participantes e seus saldos em um só lugar.", false)}
  <div class="head-buttons people-actions"><button class="button secondary" data-action="edit-group">${icon("edit")} Configurar grupo</button><button class="button secondary" data-action="group-finance">${icon('chart')} Rendas e orçamento</button><button class="button primary" data-action="new-person">${icon("plus")} Adicionar pessoa</button></div>
  <section class="stats-grid">${statBlock("Pessoas no grupo", "people", String(group.members.length), "Participantes cadastrados")}${statBlock("Despesas lançadas", "receipt", String(stats.count), "Movimentações do grupo")}${statBlock("Ainda pendente", "wallet", formatMoney(stats.pending), "Total a acertar entre pessoas", true)}</section>
  <div class="section-head"><div><h2 class="section-title">Quem está nessa</h2><p class="section-description">A parte de cada pessoa, sem perder nenhuma conta.</p></div></div>
  ${
    group.members.length
      ? `<div class="people-grid">${group.members
          .map((m, i) => {
            const balance = stats.balances[m.id] || 0;
            return `<article class="person-card"><div class="person-top">${avatar(m.name, i)}<div><div class="person-name">${escapeHTML(m.name)}</div><div class="person-sub">${balance === 0 ? "Tudo acertado" : balance > 0 ? "Tem a receber" : "Tem a pagar"}</div></div><span class="person-spacer"></span><button class="tertiary-button" data-action="delete-person" data-id="${escapeHTML(m.id)}" aria-label="Remover ${escapeHTML(m.name)}" title="Remover participante">${icon("trash")}</button></div><div class="person-net ${balance > 0 ? "positive" : balance < 0 ? "negative" : ""}">${balance > 0 ? "+" : balance < 0 ? "−" : ""}${formatMoney(Math.abs(balance))}</div><div class="person-bottom"><div><label>Pagou no total</label><strong>${formatMoney(paidBy(group, m.id))}</strong></div><div><label>Sua parte nas despesas</label><strong>${formatMoney(owedBy(group, m.id))}</strong></div></div></article>`;
          })
          .join("")}</div>`
      : '<div class="panel empty-state"><p>Adicione participantes para começar.</p></div>'
  }
  <div style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><button class="text-action" data-action="edit-group">Editar nome e tipo do grupo</button><button class="text-action" data-action="delete-group" style="color:var(--negative)">Excluir este grupo</button></div>`;
}

function renderPersonal() {
  const personal = db.personal || { identities: {}, budget: null };
  const totals = personalBalances(db.groups, personal.identities);
  const rows = (items, incoming) =>
    items.length
      ? `<div class="personal-table-wrap"><table class="personal-table"><thead><tr><th>${incoming ? "Quem paga você" : "Para quem pagar"}</th><th>Grupo</th><th>Falta pagar</th><th>Ação</th></tr></thead><tbody>${items.map((r) => `<tr><td>${escapeHTML(incoming ? r.fromName : r.toName)}</td><td>${escapeHTML(r.groupName)}</td><td>${formatMoney(r.amount)}</td><td><button class="text-action" data-action="personal-payment" data-payment-group="${escapeHTML(r.groupId)}" data-from="${escapeHTML(r.fromId)}" data-to="${escapeHTML(r.toId)}" data-amount="${r.amount}">Registrar ${incoming ? "recebimento" : "pagamento"}</button></td></tr>`).join("")}</tbody><tfoot><tr><th colspan="2">Total</th><td>${formatMoney(incoming ? totals.receivable : totals.payable)}</td><td></td></tr></tfoot></table></div>`
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
    <section class="personal-section"><h2 class="section-title">Quem ainda precisa acertar com você</h2><p class="section-description">Acertos sugeridos a partir do saldo líquido de cada grupo, já descontando os pagamentos registrados. A divisão pode redirecionar quem paga quem; não é uma lista de dívidas originais por despesa.</p><div class="panel">${rows(totals.incoming, true)}</div></section>
    <details class="panel personal-identities"><summary>Seus pagamentos pendentes · ${formatMoney(totals.payable)}</summary>${rows(totals.outgoing, false)}</details>
    <section class="personal-section"><div class="section-head"><div><h2 class="section-title">Seu dinheiro está indo para onde?</h2><p class="section-description">Entenda o peso dos gastos na sua renda e onde pode haver espaço para economizar. Sem precisar definir uma meta.</p></div></div>${renderBudgetForm(personal.budget)}</section>`;
}

function renderBudgetForm(budget) {
  const value = (amount) =>
    amount == null ? "" : (amount / 100).toFixed(2).replace(".", ",");
  return `<div class="budget-layout"><details class="budget-editor" ${!budget || budget.analysisVersion !== 2 ? "open" : ""}><summary><span>Seus dados e gastos mensais</span><span class="editor-caption">${budget ? "Editar valores" : "Preencher para analisar"}</span></summary><form id="budget-form" class="panel panel-pad"><h3>Como é sua rotina?</h3><p class="field-hint">Use médias mensais e somente a sua parte. Inclua seus gastos dos grupos aqui, uma única vez; eles não são somados automaticamente.</p>
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
    <fieldset class="budget-costs"><legend>Quais gastos fazem parte do seu mês?</legend>${budgetCategories.map(([key, label]) => `<div class="budget-cost"><label class="check-person" for="has-${key}"><input type="checkbox" id="has-${key}" data-budget-cost="${key}" ${budget?.costs[key] > 0 ? "checked" : ""}><span>${label}</span></label><input class="split-amount" id="cost-${key}" name="${key}" aria-label="Valor mensal em reais: ${label}" inputmode="decimal" placeholder="R$ 0,00" ${budget?.costs[key] > 0 ? "" : "disabled"} value="${value(budget?.costs[key] || 0)}"></div>`).join("")}</fieldset>
    <p id="budget-error" class="budget-error" role="alert"></p><div class="form-actions"><button class="button primary" type="submit">Analisar meus gastos ${icon("arrow")}</button>${budget ? '<button type="button" class="button secondary" data-action="delete-budget">Apagar análise</button>' : ""}</div><p class="field-hint">Tudo é calculado gratuitamente neste navegador. Renda e gastos também entram no arquivo de backup; compartilhe esse arquivo somente se quiser incluir essas informações.</p></form></details>
    <div id="budget-result" class="panel panel-pad budget-result" aria-live="polite">${budget ? renderBudgetResult(budget) : '<div class="empty-state"><div class="empty-illustration">' + icon("chart") + "</div><h3>Seu mês começa pelos números</h3><p>Preencha sua renda e os gastos. Vamos analisar o que pesa mais e o que pode ser revisto na sua rotina.</p></div>"}</div></div>`;
}

function renderBudgetResult(budget) {
  return renderBudgetAnalysis(budget);
}

function saveGroupFinances(form) {
  const group = groupNow();
  if (!group) return;
  const data = new FormData(form);
  const optionalMoney = value => String(value ?? '').trim() === '' ? null : parseMoney(value);
  try {
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
    const finances = {...group.finances,[groupFinanceMonth]:records};
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
        $(`#has-${key}`).checked ? parseMoney(fields.get(key)) : 0,
      ]),
    );
    const budget = {
      income: parseMoney(fields.get("income")),
      housing: fields.get("housing"),
      analysisVersion: 2,
      costs,
    };
    analyzeBudget(budget);
    db.personal ||= { identities: {}, budget: null };
    db.personal.budget = budget;
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
function expenseForm(id = null) {
  const group = groupNow();
  if (!group?.members.length) {
    notify("Adicione pelo menos um participante antes de registrar despesas.");
    personForm();
    return;
  }
  const e = id ? group.expenses.find((e) => e.id === id) : null;
  const family = analyzeGroupMonth(group,(e?.date || today()).slice(0,7));
  expenseDraft = {
    id: e?.id || null,
    selectedIds: e ? Object.keys(e.shares) : family.members.filter(m=>m.role !== 'dependent').map(m=>m.id),
    mode: e?.mode || (family.familyReady ? 'family' : 'equal'),
    values: e?.values ? { ...e.values } : {},
    originalShares: e?.shares || {},
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
    <form id="expense-form" class="dialog-body"><div class="field"><label for="expense-title">Descrição</label><input id="expense-title" name="title" required maxlength="120" placeholder="Ex.: Jantar de sexta-feira" value="${escapeHTML(e?.title || "")}" /></div>
    <div class="field-row"><div class="field"><label for="expense-amount">Valor total (R$)</label><input id="expense-amount" name="amount" required inputmode="decimal" placeholder="0,00" autocomplete="off" value="${e ? (e.amount / 100).toFixed(2).replace(".", ",") : ""}" /></div><div class="field"><label for="expense-date">Data</label><input id="expense-date" name="date" required type="date" value="${escapeHTML(e?.date || today())}" /></div></div>
    <div class="field-row"><div class="field"><label for="expense-payer">Quem pagou?</label><select id="expense-payer" name="payerId">${optionsFor(
      group.members.map((m) => [m.id, m.name]),
      e?.payerId || family.contributors[0]?.id || group.members[0].id,
    )}</select></div><div class="field"><label for="expense-category">Categoria</label><select id="expense-category" name="category">${optionsFor(
      Object.entries(categories).map(([key, c]) => [key, c.name]),
      e?.category || "food",
    )}</select></div></div>
    <div class="field"><label for="expense-necessity">Como este gasto entra na análise do grupo?</label><select id="expense-necessity" name="necessity">${optionsFor(necessityOptions,e?.necessity || 'unknown')}</select><p class="field-hint">Uma categoria pode ter gastos necessários e opcionais. Classifique pela realidade do grupo.</p></div>
    <div class="field"><label for="expense-note">Observação (opcional)</label><input id="expense-note" name="note" maxlength="400" placeholder="Algo importante sobre este gasto?" value="${escapeHTML(e?.note || "")}" /></div>
    <div class="split-box"><div class="split-box-title">Como dividir?</div><div id="split-editor"></div></div>
    <div class="form-actions"><button type="button" class="button secondary" data-action="close-dialog">Cancelar</button><button type="submit" class="button primary">${e ? "Salvar despesa" : "Registrar despesa"} ${icon("arrow")}</button></div></form>`);
  renderSplitEditor();
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
    ${family?.dependents.length ? '<p class="field-hint">Dependentes não entram na divisão de pagamento deste mês.</p>' : ''}<div class="participant-rows">${participants.map((m) => `<div class="split-person-row"><label class="check-person"><input type="checkbox" data-share-id="${escapeHTML(m.id)}" ${expenseDraft.selectedIds.includes(m.id) ? "checked" : ""} /><span>${escapeHTML(m.name)}</span></label>${expenseDraft.mode === "equal" || !expenseDraft.selectedIds.includes(m.id) ? "" : `<input class="split-amount" data-split-id="${escapeHTML(m.id)}" inputmode="decimal" placeholder="${expenseDraft.mode === "percent" ? "0,00 %" : "R$ 0,00"}" aria-label="${expenseDraft.mode === "percent" ? "Percentual" : "Valor"} de ${escapeHTML(m.name)}" value="${escapeHTML(expenseDraft.values[m.id] ?? "")}" />`}</div>`).join("")}</div><div class="split-preview" id="split-preview" aria-live="polite"></div>`;
  updateSplitPreview();
}
function readSplitInputs() {
  if (!expenseDraft) return;
  for (const input of document.querySelectorAll("[data-split-id]"))
    expenseDraft.values[input.dataset.splitId] = input.value;
}
function updateSplitPreview() {
  const node = $("#split-preview");
  if (!node || !expenseDraft) return;
  try {
    const total = parseMoney($("#expense-amount")?.value || "");
    const shares = draftExpenseShares(total,$('#expense-date').value);
    node.classList.remove("error");
    node.textContent = `Divisão pronta: ${Object.keys(shares).map((id) => `${nameOf(groupNow(), id)} ${formatMoney(shares[id])}`).join(" · ")}`;
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
function paymentForm(from = null, to = null, amount = null) {
  const group = groupNow();
  if (!group || group.members.length < 2) {
    notify(
      "Você precisa de pelo menos duas pessoas para registrar pagamentos.",
    );
    return;
  }
  const pairs = group.members.map((m) => [m.id, m.name]);
  openDialog(`${dialogTitle("Registrar pagamento", "Informe a transferência que já aconteceu. Isso atualiza os saldos do grupo.")}
    <form id="payment-form" class="dialog-body"><div class="field-row"><div class="field"><label for="payment-from">Quem pagou?</label><select name="fromId" id="payment-from">${optionsFor(pairs, from || pairs[0][0])}</select></div><div class="field"><label for="payment-to">Quem recebeu?</label><select name="toId" id="payment-to">${optionsFor(pairs, to || pairs[1][0])}</select></div></div>
    <div class="field-row"><div class="field"><label for="payment-amount">Valor transferido</label><input id="payment-amount" name="amount" inputmode="decimal" required placeholder="0,00" value="${amount ? (amount / 100).toFixed(2).replace(".", ",") : ""}" /></div><div class="field"><label for="payment-date">Data</label><input id="payment-date" type="date" name="date" value="${today()}" required /></div></div><div class="warning-text">Registre somente pagamentos reais. O Dividi Aí não envia dinheiro nem realiza Pix.</div>
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
  const payerId = String(data.get("payerId"));
  if (!group.members.some((m) => m.id === payerId))
    return notify("Escolha quem pagou.");
  let amount, shares;
  try {
    amount = parseMoney(data.get("amount"));
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
    payerId,
    category: String(data.get("category")),
    necessity: String(data.get('necessity') || 'unknown'),
    date: String(data.get("date")),
    note: String(data.get("note") || "").trim(),
    shares,
    mode: expenseDraft.mode,
    values: { ...expenseDraft.values },
    createdAt: new Date().toISOString(),
  };
  if (expenseDraft.id) {
    const i = group.expenses.findIndex((e) => e.id === expenseDraft.id);
    if (i === -1) return notify("Despesa não encontrada.");
    item.createdAt = group.expenses[i].createdAt || item.createdAt;
    group.expenses[i] = item;
  } else group.expenses.push(item);
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
  group.payments.push({
    id: makeId(),
    fromId,
    toId,
    amount,
    date: String(data.get("date")),
    createdAt: new Date().toISOString(),
  });
  group.sample = false;
  closeDialog();
  persist("Pagamento registrado.");
}
function deleteExpense(id) {
  const group = groupNow(),
    e = group.expenses.find((e) => e.id === id);
  if (!e) return;
  if (
    !confirm(
      `Excluir a despesa "${e.title}" (${formatMoney(e.amount)})? Os saldos serão recalculados.`,
    )
  )
    return;
  group.expenses = group.expenses.filter((e) => e.id !== id);
  group.sample = false;
  persist("Despesa excluída.");
}
function deletePayment(id) {
  const group = groupNow();
  const p = group.payments.find((p) => p.id === id);
  if (
    !p ||
    !confirm(`Excluir o registro de pagamento de ${formatMoney(p.amount)}?`)
  )
    return;
  group.payments = group.payments.filter((p) => p.id !== id);
  group.sample = false;
  persist("Pagamento removido.");
}
function deletePerson(id) {
  const group = groupNow();
  const m = group.members.find((m) => m.id === id);
  if (!m) return;
  const used =
    group.expenses.some(
      (e) => e.payerId === id || Object.hasOwn(e.shares, id),
    ) || group.payments.some((p) => p.fromId === id || p.toId === id);
  if (used)
    return notify(
      "Essa pessoa já possui lançamentos. Exclua as despesas e pagamentos vinculados antes de removê-la.",
    );
  if (!confirm(`Remover ${m.name} deste grupo?`)) return;
  group.members = group.members.filter((m) => m.id !== id);
  if (group.finances) for (const month of Object.keys(group.finances)) group.finances[month] = group.finances[month].filter(r=>r.memberId!==id);
  if (db.personal?.identities[group.id] === id)
    delete db.personal.identities[group.id];
  group.sample = false;
  persist("Participante removido.");
}
function deleteGroup() {
  const group = groupNow();
  if (
    !group ||
    !confirm(
      `Excluir definitivamente "${group.name}" e todas as despesas e pagamentos? Faça um backup antes, se precisar.`,
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
function resetData() {
  if (
    !confirm(
      "Apagar todos os grupos, despesas, participantes e pagamentos deste navegador? Essa ação não pode ser desfeita. Exporte um backup se quiser guardar os dados.",
    )
  )
    return;
  db = emptyData();
  view = "overview";
  expenseFilter = { text: "", category: "all" };
  closeDialog();
  persist("Tudo limpo. Pode começar de novo.");
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
  if (file.size > 3_000_000)
    return notify("Arquivo muito grande. O limite é de 3 MB.");
  try {
    const parsed = JSON.parse(await file.text());
    if (!isValidData(parsed))
      throw new Error("Estrutura de dados incompatível ou inválida.");
    if (
      !confirm(
        `Importar ${parsed.groups.length} grupo(s)? Isso SUBSTITUIRÁ todos os dados salvos neste navegador.`,
      )
    )
      return;
    db = {
      version: 1,
      groups: parsed.groups,
      ...(parsed.personal ? { personal: parsed.personal } : {}),
      activeGroupId: parsed.groups.some((g) => g.id === parsed.activeGroupId)
        ? parsed.activeGroupId
        : parsed.groups[0]?.id || null,
    };
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
  const s = groupStats(g);
  const lines = [
    `Dividi Aí · ${g.name}`,
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

document.addEventListener("click", (event) => {
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
    expenseDraft.mode = btn.dataset.mode;
    renderSplitEditor();
    return;
  }
  const action = btn.dataset.action;
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
      const plan = proposeFamilyMonth(group,groupFinanceMonth);
      if (!plan.length) return;
      if (!confirm(`Redistribuir as ${plan.length} despesas de ${groupFinanceMonth} entre os contribuintes, respeitando seus limites e sem cobrar dependentes? Isso substitui as parcelas existentes. Quem pagou e os acertos registrados serão mantidos; os saldos serão recalculados.`)) return;
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
    if (!confirm('Apagar as rendas e contribuições deste mês? As despesas e os outros meses serão mantidos.')) return;
    delete groupNow().finances[groupFinanceMonth];
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
    );
  }
  if (action === "delete-budget") {
    if (
      !confirm(
        "Apagar sua renda e seu planejamento mensal deste navegador? Os grupos serão mantidos.",
      )
    )
      return;
    if (db.personal) db.personal.budget = null;
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
    const start = event.target.selectionStart,
      end = event.target.selectionEnd;
    render();
    const input = $("#expense-search");
    input.focus();
    try {
      input.setSelectionRange(start, end);
    } catch {
      /* input types may vary */
    }
  }
  if (event.target.id === "expense-amount") updateSplitPreview();
  if (event.target.matches("[data-split-id]")) {
    expenseDraft.values[event.target.dataset.splitId] = event.target.value;
    updateSplitPreview();
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === 'expense-date') { readSplitInputs(); renderSplitEditor(); return; }
  if (event.target.id === 'group-finance-month') {
    if (!isMonth(event.target.value)) { event.target.value = groupFinanceMonth; return; }
    groupFinanceMonth = event.target.value;
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
