import { analyzeBudget } from "./personal.js";
import { formatMoney as money } from "./engine.js";

// Presentation only: financial rules live in personal.js.
export function renderBudgetAnalysis(budget) {
  if (budget.analysisVersion !== 2)
    return '<div class="empty-state"><h3>Atualize seus dados para continuar</h3><p>Os valores foram preservados. Separe delivery e assinaturas nos novos campos e clique em “Analisar meus gastos”.</p></div>';
  const b = analyzeBudget(budget);
  const pct = (n) =>
    n == null
      ? "—"
      : `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const ready = !["no-income", "incomplete"].includes(b.status);
  const tone = ["deficit", "nonessential-high"].includes(b.assessment)
    ? "danger"
    : [
          "tight",
          "attention",
          "nonessential-attention",
          "category-review",
        ].includes(b.assessment)
      ? "warning"
      : "neutral";
  const titles = {
    "no-income": "Informe sua renda para analisar",
    incomplete: "Adicione seus gastos do mês",
    deficit: "Os gastos passaram da sua renda",
    tight: "Seu mês está com pouca margem",
    attention: "Os gastos merecem atenção",
    room: "Seu mês tem margem",
    "nonessential-high": "Os não essenciais estão pesando",
    "nonessential-attention": "Vale rever os gastos não essenciais",
    "category-review": "Há sobra, mas também hábitos a rever",
  };
  const subtitles = {
    "no-income":
      "Sem renda, não calculamos percentuais nem uma reserva possível.",
    incomplete: "Sem despesas, ainda não dá para avaliar sua rotina.",
    deficit: `Faltam ${money(b.deficit)} para fechar o mês.`,
    tight: `${pct(b.ratio)} da renda já está comprometida.`,
    attention: `Você utiliza ${pct(b.ratio)} da renda com os gastos informados.`,
    room: "Nenhum alerta nas referências do app. Continue acompanhando os gastos reais.",
    "nonessential-high": `${pct(b.nonEssentialShare)} da renda vai para delivery, passeios, compras e assinaturas.`,
    "nonessential-attention": `${pct(b.nonEssentialShare)} da renda vai para gastos não essenciais.`,
    "category-review":
      "Um saldo positivo não elimina os alertas por categoria.",
  };
  const metric = (label, value, caption, kind = "") =>
    `<div class="analysis-metric ${kind}"><dt>${label}</dt><dd>${value}</dd><p>${caption}</p></div>`;
  const housing = {
    family: "Com a família",
    shared: "Casa compartilhada",
    alone: "Mora sozinho(a)",
  };
  return `<header class="analysis-heading"><div><p class="eyebrow">SEU RAIO-X MENSAL</p><h3>O que seus números dizem</h3></div><span class="analysis-tag">${housing[budget.housing]}</span></header>
    <section class="analysis-diagnosis" data-tone="${tone}"><span class="diagnosis-symbol" aria-hidden="true">${tone === "neutral" ? "i" : "!"}</span><div><span class="analysis-label">${tone === "danger" ? "CUIDADO" : tone === "warning" ? "ATENÇÃO" : "VISÃO GERAL"}</span><h4>${titles[b.assessment]}</h4><p>${subtitles[b.assessment]}</p></div></section>
    <dl class="analysis-metrics">${metric("Você recebe", money(budget.income), "Renda líquida mensal")}${metric("Você gasta", money(b.spending), b.ratio == null ? "Total informado" : `${pct(b.ratio)} da sua renda`)}${metric(b.surplus < 0 ? "Falta no mês" : "Sobra no mês", money(Math.abs(b.surplus)), "Antes de reservar dinheiro", b.surplus < 0 ? "metric-danger" : "")}</dl>
    ${
      ready
        ? `<div class="analysis-columns"><section class="analysis-block"><div class="analysis-section-title"><span>01</span><h4>O peso dos não essenciais</h4></div>
      <div class="habit-summary" data-level="${b.nonEssentialLevel}"><strong>${pct(b.nonEssentialShare)}</strong><div><b>${money(b.flexible)} por mês</b><span>${b.nonEssentialLevel === "high" ? "Faixa de cuidado" : b.nonEssentialLevel === "attention" ? "Faixa de atenção" : "Abaixo de 25% no total"}</span></div></div>
      <div class="habit-track" role="img" aria-label="Não essenciais: ${pct(b.nonEssentialShare)} da renda. Atenção a partir de 25%, cuidado a partir de 30%."><span style="width:${Math.min(100, b.nonEssentialShare * 100)}%"></span><i class="marker-25"></i><i class="marker-30"></i></div><div class="habit-legend"><span>0%</span><span>25% atenção · 30% cuidado</span><span>100%</span></div>
      <div class="category-ranking">${[...b.breakdown]
        .sort((a, c) => c.amount - a.amount)
        .map(
          (r) =>
            `<div class="category-rank"><div><strong>${r.label}</strong><span>${r.excess > 0 ? "<em>Revisar</em>" : "Sem alerta individual"}</span></div><div><b>${money(r.amount)}</b><span>${pct(r.share)} da renda</span></div></div>`,
        )
        .join("")}</div>
      <p class="analysis-note">Referência de 25%: <strong>${money(b.nonEssentialReference)}</strong>. ${b.aboveNonEssentialReference ? `Você está ${money(b.aboveNonEssentialReference)} acima.` : "Observe também os alertas individuais."} Essas faixas orientam a revisão; não são limites obrigatórios.</p></section>
      <section class="analysis-block"><div class="analysis-section-title"><span>02</span><h4>Por onde começar</h4></div>
      <div class="action-ranking">${b.reviews.length ? b.reviews.map((r, i) => `<article class="analysis-action"><div class="action-title"><span>${String(i + 1).padStart(2, "0")}</span><h5>${r.label}</h5></div><p>${r.suggestion}</p><div class="action-saving"><span>Economia simulada por mês</span><strong>${money(r.savingLow)} a ${money(r.savingHigh)}</strong></div><details class="action-detail"><summary>Por que apareceu aqui?</summary><p>${pct(r.share)} da renda nesta categoria, acima da referência do app de ${pct(r.ratio)}. Simulamos reduzir 25% a 50% apenas da parte acima da referência. Isso não torna todo o gasto desnecessário.</p></details></article>`).join("") : `<div class="analysis-no-actions"><h5>${b.nonEssentialLevel !== "within" ? "Olhe para o conjunto" : "Sem corte específico sugerido"}</h5><p>${b.nonEssentialLevel !== "within" ? "As categorias isoladas não passaram das referências, mas a soma chegou à faixa de atenção. Revise a distribuição entre elas." : "Nenhuma categoria flexível passou das referências. Se o mês está apertado, revise também parcelas, contratos e outros compromissos."}</p></div>`}</div></section></div>
      <section class="analysis-reserve"><div class="analysis-section-title"><span>03</span><h4>O que poderia ficar guardado</h4></div><div class="reserve-comparison"><div><span>Com a rotina atual</span><strong>${money(b.currentReserve)}</strong><p>Após separar ${money(b.buffer)} para imprevistos do mês.</p></div>${b.reviews.length ? `<div class="reserve-potential"><span>Com os ajustes simulados</span><strong>${money(b.reserveLow)} a ${money(b.reserveHigh)}</strong><p>Por mês, se as reduções forem viáveis. A mesma folga já foi descontada.</p></div>` : ""}</div>${b.remainingDeficit ? `<p class="analysis-deficit">Mesmo com as reduções, ainda faltariam ${money(b.remainingDeficit)} para fechar o mês. Não há reserva disponível nesse cenário.</p>` : ""}<p class="analysis-note">Projeções, não valores já guardados. A sobra sozinha não comprova uma boa distribuição dos gastos.</p></section>`
        : ""
    }
    <details class="analysis-method"><summary>Seu contexto e os compromissos do mês</summary><dl class="budget-breakdown"><div><dt>Moradia, contas e compromissos</dt><dd>${money(b.essentials)}</dd></div><div><dt>Não essenciais</dt><dd>${money(b.flexible)}</dd></div></dl><p>A análise considera sua parte dos gastos. Morar com a família não significa morar sem custos. ${b.essentialShare >= 0.7 ? `Os compromissos consomem ${pct(b.essentialShare)} da renda; o aperto não pode ser atribuído apenas ao lazer.` : "Pessoas com custos diferentes têm capacidades diferentes de poupar."}</p>${b.housingShare >= 0.35 ? `<p>A moradia ocupa ${pct(b.housingShare)} da renda. É um peso relevante, não uma indicação para mudar de casa. Considere custo total e viabilidade.</p>` : ""}</details>
    <details class="analysis-method"><summary>Entenda as regras e os cálculos</summary><p>Referências orientativas do app, não limites oficiais. No total de gastos, a partir de 75% da renda há atenção, a partir de 90% a margem é apertada e acima de 100% há déficit. Para não essenciais, atenção a partir de 25% e cuidado a partir de 30%. Mesmo abaixo dessas faixas, uma categoria pode precisar de revisão.</p><p>Referências individuais: delivery 5%, passeios 10%, compras não essenciais 10% e assinaturas 3% da renda. As economias simulam cortar 25% a 50% somente da parcela acima dessas referências, sem somar outro corte pelo alerta coletivo. Não presumimos cortes em aluguel, alimentação básica, saúde, dívidas ou ajuda à família.</p><p>Reserva estimada = renda − gastos + cortes simulados − folga de 5% da renda, nunca abaixo de zero. Essa folga é uma hipótese do app e pode não cobrir seus imprevistos; não é recomendação de reserva de emergência. Custos novos, como mercado ao substituir delivery, não estão incluídos.</p><p>Base para registrar e avaliar receitas e despesas: <a href="https://www.bcb.gov.br/meubc/faqs/p/o-que-e-um-orcamento-pessoal" target="_blank" rel="noopener noreferrer">Banco Central</a>. Percentuais e cenários são escolhas do app, não recomendações do Banco Central.</p></details>`;
}
