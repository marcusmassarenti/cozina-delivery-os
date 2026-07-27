# Chamado iFood — módulo Analytics

**Onde abrir:** Portal do Desenvolvedor → Suporte → Chamados
**Quando:** antes de escrever qualquer código. A pergunta 1 muda a arquitetura da
integração inteira, porque decide se criamos um App novo ou estendemos o atual.

**Contexto pra quem for ler depois:** já somos integradora homologada do iFood
(módulos Financial e Review, em produção). O App atual foi criado **antes de
23/07/2026**, que é a data de corte citada no anúncio da Analytics — apps
criados a partir dela não migram automaticamente para o permissionamento de
Redes. É isso que a pergunta 1 tenta preservar.

---

## Texto do chamado

Assunto: **Analytics — escopo em App existente e roadmap de dimensões**

Olá, time!

Somos integradora homologada e já consumimos os módulos Financial e Review em
produção. Recebemos o anúncio do módulo Analytics e temos seis dúvidas antes de
iniciar o desenvolvimento.

**1. Escopo `analytics` no App existente (mais importante pra nós)**

O comunicado diz que Apps criados a partir de 23/07 com permissionamento por
`merchant_id` não serão migrados automaticamente para o modelo de Redes.

Nosso App foi criado **antes** dessa data. Se adicionarmos o escopo `analytics`
a esse App já existente — em vez de criar um App novo — ele continua elegível à
migração automática para Redes quando o modelo for lançado?

Perguntamos porque atendemos redes com várias lojas: criar um App novo
significaria refazer a autorização com cada cliente hoje e **de novo** quando o
permissionamento de Redes sair.

**2. Previsão do permissionamento de Redes**

Existe uma previsão, mesmo que aproximada (trimestre), para o lançamento do
permissionamento de Redes na Analytics? Isso define se esperamos ou se seguimos
com `merchant_id` por enquanto.

**3. Roadmap — dimensão de item e funil de conversão**

Hoje nossos clientes ainda exportam manualmente o relatório de **Cardápio**,
que traz o funil de conversão (visitas → visualizações → sacola → pedido) e os
itens mais vendidos. Nenhum dos dois aparece nos campos atuais de `groupBy` ou
`metrics`.

Há previsão de esses dados entrarem na Analytics? É a exportação manual que mais
pesa na rotina das lojas que atendemos.

**4. Roadmap — indicadores de qualidade**

Mesma pergunta para os indicadores do relatório de **Qualidade da operação**
(tempo online, tempo de preparo, atrasos, chamados, cancelamentos por motivo e
nível Super). Estão previstos para a Analytics ou para outro módulo?

**5. `benefitByTypePartnerTotalValue` e o relatório de Promoções**

Esse campo corresponde ao investimento do parceiro em promoções, equivalente ao
que aparece no relatório de Promoções do Portal do Parceiro?

Se sim, existe alguma dimensão que permita quebrar esse valor **por campanha**?
Sem isso não conseguimos calcular ROI por campanha, que é o uso principal do
relatório.

**6. Cancelamento tardio e reprocessamento**

A documentação informa que um pedido CONCLUÍDO pode ser cancelado em até 15 dias
após a conclusão. Para manter nossos números corretos, basta reconsultar o mesmo
`referenceDate` e substituir o resultado anterior — ou existe recomendação
diferente (por exemplo, alguma janela de reprocessamento sugerida)?

**7. Rate limit**

O limite de 500 requisições/minuto é por App, por `client_id` ou por
`merchant_id`? Precisamos dimensionar a fila para atender várias lojas no mesmo
processo diário.

Obrigado!

---

## Depois da resposta

- **Se a 1 for SIM** → adicionar o escopo `analytics` ao App atual, homologar e
  construir. Sem retrabalho de onboarding.
- **Se a 1 for NÃO** → pesar contra a resposta da 2. Se Redes estiver perto,
  esperar; se estiver longe, App novo e aceitar refazer a autorização depois.
- **Independente da resposta**, o caminho mais curto pra reduzir importação
  manual continua sendo ligar o sync automático da 99 Food (3 relatórios de uma
  vez, API já provada com a loja Jardins).
