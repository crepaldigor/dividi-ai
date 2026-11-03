# Dividi Aí

Site para dividir despesas de grupos e famílias, acompanhar acertos e analisar gastos pessoais. Feito com HTML, CSS e JavaScript, sem dependências, instalação de pacotes ou etapa de build.

## Executar

O projeto usa apenas HTML, CSS e JavaScript. Não precisa de Python, instalação de pacotes ou comando de build.

Para visualizar durante o desenvolvimento:

1. Abra a pasta do projeto no VS Code.
2. Instale a extensão **Live Server**, caso ainda não esteja instalada.
3. Clique com o botão direito em `index.html` e selecione **Open with Live Server**.

A extensão abre o site no navegador por um endereço local. Ela é uma ferramenta de desenvolvimento, não uma funcionalidade do aplicativo. Use um servidor HTTP: abrir o `index.html` diretamente por `file://` não é suficiente para carregar os módulos JavaScript. Depois de publicado, basta acessar o endereço do site.

## Publicar

Publique o conteúdo desta pasta em uma hospedagem de arquivos estáticos. O arquivo de entrada é `index.html`; não há comando de build. Use HTTPS para habilitar o service worker e os recursos de instalação disponíveis no navegador.

## Arquivos

```text
dividi-ai/
├── index.html                 # Estrutura principal
├── css/
│   └── styles.css             # Tema, componentes e responsividade (CSS único)
├── js/
│   ├── app.js                 # Telas, formulários e interação
│   ├── ui.js                  # Texto seguro e ícones compartilhados
│   ├── controls.js            # Calendários, seletores e validação visual
│   ├── decisions.js           # Confirmações personalizadas das ações
│   ├── expense-presets.js     # Sugestões rápidas para novas despesas
│   ├── months.js              # Extratos, competências e comparação mensal
│   ├── month-view.js          # Navegação mensal, recorrentes e histórico
│   ├── recurring.js           # Sugestões mensais sem lançamento automático
│   ├── history.js             # Alterações reversíveis e verificação de conflitos
│   ├── engine.js              # Divisão de despesas e saldos
│   ├── settlement-view.js     # Origem das pendências e cálculo por pessoa
│   ├── storage.js             # Salvamento local e validação de backups
│   ├── personal.js            # Cálculos do painel pessoal
│   ├── analysis-view.js       # Apresentação da análise pessoal
│   ├── group-finance.js       # Rendas, limites e divisão familiar
│   └── group-finance-view.js  # Apresentação do orçamento do grupo
├── assets/favicon.svg
├── manifest.webmanifest      # Informações para instalação do site
├── sw.js                      # Arquivos atualizados online e cache offline
├── .gitignore
└── README.md
```

O conteúdo da `<main>` é gerado pelos arquivos JavaScript de apresentação. Para alterar textos e componentes, edite `app.js`, `analysis-view.js` ou `group-finance-view.js`. Para aparência e alinhamentos, edite somente `css/styles.css`; o antigo `redesign.css` foi incorporado e removido. As cores ficam nas variáveis `:root` e `:root[data-theme="dark"]`.

## Dados e funcionamento

- Grupos, despesas, pagamentos e análises ficam no navegador, via `localStorage`.
- Não há login, banco de dados remoto ou colaboração entre aparelhos. Compartilhar o resumo não dá acesso ao grupo.
- Use **Exportar backup** para guardar ou transferir os dados. O arquivo inclui rendas e outras informações financeiras cadastradas. Importar um backup substitui os dados atuais.
- Limpar os dados do navegador remove os registros locais. Trocar de domínio, porta ou navegador também usa um armazenamento separado.
- No orçamento familiar, dependentes contam como moradores, mas não recebem parcelas na sugestão. Contribuintes definem um limite de ajuda; o restante da renda permanece pessoal.
- Na aba **Participantes**, cada pessoa tem um botão para adicionar ou editar salário e limite de contribuição do mês selecionado.
- Uma despesa pode ter vários pagadores: informe quanto cada um desembolsou. A soma deve conferir com o total. Isso é separado da divisão de responsabilidade entre os participantes.
- Os atalhos de despesas preenchem descrição e categoria, que continuam editáveis. A classificação essencial/não essencial é escolhida por você.
- Registros antigos com um pagador continuam válidos. Os novos usam `payers` (valores em centavos por participante), inclusive nos backups; versões antigas do site podem não reconhecer esses novos backups.
- A análise usa rendas e despesas do mês escolhido. Aplicar a divisão familiar às despesas existentes exige confirmação. As referências financeiras do app são orientativas.

## Extratos mensais e fechamento

O seletor de mês controla as despesas, os participantes e o orçamento exibidos. Um mês novo começa sem lançamentos próprios; os registros antigos continuam no extrato original. O bloco **Meses anteriores** mostra o que ainda falta acertar, sem somar essa dívida aos gastos novos.

**Fechar mês** preserva as despesas, as rendas e a lista de participantes daquele período e abre o próximo mês. Despesas e rendas ficam protegidas até você escolher **Reabrir mês**. Os acertos podem ser registrados mesmo com o mês fechado. Ao reabrir o site, um mês atual já fechado dá lugar ao próximo período em aberto.

Em cada pagamento, informe a **data da transferência** e o **mês ao qual o acerto pertence**. Assim, pagar em novembro uma conta de outubro reduz a pendência de outubro. É possível editar esse vínculo. Os saldos são separados por mês; não compensamos silenciosamente dívidas de períodos diferentes.

Pagamentos de versões antigas não tinham competência. Na atualização/importação, eles são atribuídos aos meses mais antigos em que o pagador tinha saldo devedor e o recebedor tinha saldo credor. Uma transferência que cobre vários meses pode ser dividida em registros, mantendo a data e a soma total. Valores sem correspondência ficam no mês da transferência. Esses registros recebem uma indicação para revisão pelo botão **Editar**. A atribuição é uma inferência e pode ser corrigida.

A comparação na visão geral mostra totais e categorias do mês selecionado e do anterior. Meses incompletos e ausência de registros são identificados; menor gasto registrado não é automaticamente considerado economia.

No cartão **Falta acertar**, escolha **Ver de onde vem**, ou use **Por que este valor?** em uma transferência sugerida. O detalhamento apresenta o grupo, o mês, as despesas de origem, quanto cada pessoa adiantou, a parcela que lhe cabe e os acertos já registrados. O cálculo é: **adiantamentos − parcelas + pagamentos enviados − pagamentos recebidos**. Saldo negativo significa valor a pagar; positivo, valor a receber.

Os acertos sugeridos compensam os saldos do mês inteiro. O destinatário pode ser diferente do pagador original da compra. Como os pagamentos não têm vínculo com uma despesa individual, o detalhamento mostra a origem do saldo sem afirmar que uma despesa específica já foi quitada. Se alguém pagar a mais, a diferença passa a ser um crédito a receber, e aparece na composição.

## Contas recorrentes

Marque **Repetir mensalmente** ao salvar uma despesa. A partir do próximo mês ela aparece em **Contas da rotina**, com valor, pagadores e divisão sugeridos. Revise e salve para efetivamente lançar. Datas como dia 31 são ajustadas ao último dia do mês quando necessário.

Cada conta pode ser lançada uma única vez por mês, pulada naquele período, pausada, retomada ou removida. Remover o modelo mantém as despesas já lançadas. Excluir uma despesa recorrente já revisada não a lança novamente; use o Histórico para restaurá-la.

## Histórico e desfazer

Edições e exclusões ficam no **Histórico e desfazer**, inclusive após recarregar a página. São guardadas até 40 alterações, com limite de espaço. Os registros mais antigos podem sair do histórico; exporte um backup para guardar uma cópia.

Desfazer restaura somente os dados afetados. Se esses dados mudaram depois, é necessário desfazer primeiro as alterações relacionadas mais recentes. Para restaurar despesas de um mês fechado, reabra-o. **Apagar todos os dados** também apaga o Histórico e é definitivo. O backup contém o histórico disponível, inclusive informações financeiras antigas que tenham sido excluídas.

## Orçamento pessoal integrado

As análises pessoais agora são salvas por mês. A análise de uma versão anterior, sem data, é preservada no mês da atualização. É possível copiar os valores pessoais do mês anterior e revisá-los.

Depois de identificar seu participante em cada grupo, a página mostra suas parcelas nas despesas do mês. Ao ativar **Somar automaticamente minha parte nos grupos**, preencha os campos manuais apenas com gastos fora dos grupos. Se já incluía parcelas nesses campos, retire-as antes de ativar para evitar duplicação. A integração soma a responsabilidade nas despesas, não adiantamentos nem reembolsos; ela é recalculada quando as despesas mudam.

Com a opção desligada, os campos representam seus gastos totais e nenhuma parcela é adicionada automaticamente. Delivery e assinaturas têm categorias próprias. Gastos sem classificação mostram um aviso para revisão.

## Atualizações e cache

Os campos de mês, data e seleção usam componentes próprios, com os temas claro e escuro. No calendário, clique no nome do mês para escolher outro e edite o ano diretamente. Use Tab para navegar, as setas entre opções e Escape para cancelar. A seleção só muda ao confirmar uma opção; cancelar preserva o valor anterior. Os erros de preenchimento aparecem junto aos campos. A importação de backup mantém o seletor de arquivos do sistema.

O service worker busca os arquivos atualizados quando há conexão e mantém uma cópia para uso offline. Se uma versão antiga persistir durante o desenvolvimento, abra **DevTools → Application → Service Workers → Update** e recarregue a página. Evite **Clear site data** se quiser preservar os dados locais.
