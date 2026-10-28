# Dividi Aí

Site para dividir despesas de grupos e famílias, acompanhar acertos e analisar gastos pessoais. Feito com HTML, CSS e JavaScript, sem dependências, instalação de pacotes ou etapa de build.

## Executar

Abra a pasta no VS Code e use o **Live Server**, ou execute com Python instalado:

```sh
python -m http.server 5500
```

Acesse **http://localhost:5500**. Use um servidor HTTP: abrir o `index.html` diretamente por `file://` não é suficiente para carregar os módulos JavaScript.

## Publicar

Publique o conteúdo desta pasta em uma hospedagem de arquivos estáticos. O arquivo de entrada é `index.html`; não há comando de build. Use HTTPS para habilitar o service worker e os recursos de instalação disponíveis no navegador.

## Arquivos

```text
dividi-ai/
├── index.html                 # Estrutura principal
├── css/
│   ├── styles.css             # Estilos base
│   └── redesign.css           # Tema, componentes e responsividade
├── js/
│   ├── app.js                 # Telas, formulários e interação
│   ├── engine.js              # Divisão de despesas e saldos
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

O conteúdo da `<main>` é gerado pelos arquivos JavaScript de apresentação. Para alterar textos e componentes, edite `app.js`, `analysis-view.js` ou `group-finance-view.js`. Para aparência e alinhamentos, edite os arquivos CSS.

## Dados e funcionamento

- Grupos, despesas, pagamentos e análises ficam no navegador, via `localStorage`.
- Não há login, banco de dados remoto ou colaboração entre aparelhos. Compartilhar o resumo não dá acesso ao grupo.
- Use **Exportar backup** para guardar ou transferir os dados. O arquivo inclui rendas e outras informações financeiras cadastradas. Importar um backup substitui os dados atuais.
- Limpar os dados do navegador remove os registros locais. Trocar de domínio, porta ou navegador também usa um armazenamento separado.
- No orçamento familiar, dependentes contam como moradores, mas não recebem parcelas na sugestão. Contribuintes definem um limite de ajuda; o restante da renda permanece pessoal.
- A análise usa rendas e despesas do mês escolhido. Aplicar a divisão familiar às despesas existentes exige confirmação. As referências financeiras do app são orientativas.

## Atualizações e cache

O service worker busca os arquivos atualizados quando há conexão e mantém uma cópia para uso offline. Se uma versão antiga persistir durante o desenvolvimento, abra **DevTools → Application → Service Workers → Update** e recarregue a página. Evite **Clear site data** se quiser preservar os dados locais.
