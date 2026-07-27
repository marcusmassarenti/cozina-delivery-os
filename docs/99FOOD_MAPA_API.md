# 99 Food — mapa completo da API (varredura de 27/jul/2026)

Levantamento dos **142 nós** da documentação oficial (Common + Food + Grocery +
Open Delivery), feito para responder uma pergunta só: **o que ainda precisa vir
de planilha, e por quê.**

A doc é um SPA — `curl` na página vem vazio. Para reler:

```bash
curl -s "https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=<ID>&lang=pt_br" \
  -H "Origin: https://developer-food.99app.com" \
  -H "Referer: https://developer-food.99app.com/pt-BR/openapi" \
  -A "Mozilla/5.0" \
  | python3 -c "import sys,json,base64;d=json.load(sys.stdin);print(base64.b64decode(d['data']['md_text']).decode())"
```

A árvore inteira sai de `/docs/v1/node/nodetreeget?lang=pt_br` com os mesmos headers.

---

## O veredito

A API da 99 tem **6 módulos**: Authorization, Store, Menu, Order, Logistics e
Financial. **Não existe módulo de Report, Analytics, Statistics ou Reviews** —
varredura por `report|statistic|metric|analytic|dashboard|BI|rating|review|score|funnel|conversion`
nos 142 nós não retorna um único endpoint. O portal também não oferece download,
CSV ou SFTP de relatório (o único SFTP da doc é *inbound*, e só para Grocery).

| Relatório que importamos | Dá pra automatizar? |
|---|---|
| **Dados do pedido** | ✅ **Sim, últimos 3 meses** — ver "O ganho real" |
| **Dados da loja** | ⚠️ Parcial — vendas/taxas/cancelamento sim; nota, aceitação e tempo de preparo **nunca** |
| **Dados do item** | ❌ **Nunca** — alcance, carrinho e conversão não existem nem são deriváveis |
| Avaliações | ❌ **Nunca** — zero ocorrências de review/rating na doc inteira |

---

## O ganho real: "Dados do pedido" é reconstruível

Não existe endpoint de *listar pedidos*. Mas o **`Get Bill Data`** — que já
consumimos todo dia no cron — **é** uma lista de pedidos por período: linha por
pedido, paginada, filtrada por data, com `orderId`.

Ou seja, a peça que faltava não era um endpoint novo. Era perceber que o extrato
financeiro já faz o papel do índice.

Onde faltar a composição da comanda, dá para chamar `Get Order Details` por
`orderId` (rate limit 10 req/10s).

**Limites que desenham o backfill:**
- Retenção **3 meses** (errno 110004) — antes disso, planilha é a única fonte.
- Janela **31 dias por chamada** (errno 110005) — independente da retenção.
- `page_size` máximo **200**.
- Só devolve **pedido confirmado pela loja** (nota literal do nó 2027).

---

## O extrato tem 40 campos. Usamos 6.

Campos do `Get Bill Data` (nó 2027) que estão fora da nossa conta hoje:

**Custos e deduções** (existem desde 12/dez/2025)
| Campo | O que é |
|---|---|
| `vatAmount` | Imposto sobre as comissões da plataforma |
| `mealLossDeductAmount` | Dedução por cancelamento **de culpa da loja** — quanto o operacional custou |
| `merchantAppealAmount` | Reembolsos por contestação — **quanto recuperamos reclamando** |
| `commissionSubsidyAmount` | Subsídio da 99 **sobre a comissão** — sem ele a comissão líquida sai errada |
| `minValueDifferenceAmount` | Complemento pago pelo cliente em pedido abaixo do mínimo (é receita) |
| `shopPreTips` | Gorjeta paga à loja |

**Promoção com split de quem pagou**
`shopActivityOutcome` (a loja bancou) vs `shopActivitySubsidy` (a 99 bancou), em
desconto de item — o par equivalente ao de frete grátis que já usamos.
⚠️ **Não há identificador de campanha no extrato.** Para ROI por campanha é
obrigatório cruzar com `promo_type`/`promo_list` do Get Order Details pelo
`orderId`.

**Mix de pagamento** (hoje justifica importar "Dados do pedido")
`paymentChannel` + `paymentMethodDetail` + `cardBrand` + `mealVoucherAmount` +
`cashBalance` — separa Pluxee, Ticket, VR, Alelo, Edenred e Sivale um a um.

**Cancelamento com causa e responsável**
`cancelReason` tem 13 códigos separando loja (101 manual, 102 timeout de
confirmação, 103 offline), entregador (201, 202 sem entregador, 204, 205),
cliente (1, 2, 3, 20) e plataforma (301). Hoje isso vem do XLSX traduzido do
"B/P/C/D duty". Cruzado com `mealLossDeductAmount`, vira **quanto cada tipo de
cancelamento custou em reais**.

**Reconciliação bancária** — `Get Settlements Data` (nó 2029)
`withdrawDate` é a **data real do desembolso**; `expectSettleDate` do Bill Data é
só a **programada**. O `dayPaymentIDList` amarra cada depósito ao conjunto de
linhas do extrato.

---

## Duas ressalvas dos próprios agentes

1. **A doc do financeiro nunca diz que os valores estão em centavos.** Quem diz
   isso é a doc de *pedidos*. Nossa prática está certa, mas é inferência.
2. **A convenção de sinal é inconsistente nos exemplos da própria 99** — num
   `orderType=1` o `payCommissionAmount` vem negativo; num `orderType=2` a
   `commissionAmount` vem positiva num estorno. Não há nota de convenção.
   **Qualquer campo novo precisa ser validado contra produção antes de entrar
   numa soma.** É exatamente o tipo de detalhe que já causou erro de dinheiro
   aqui.

---

## Portas fechadas (confirmado, não é questão de permissão)

- **Avaliações** — não existem na API. Nem endpoint, nem webhook.
- **Alcance / adições ao carrinho / conversão por item** — não existem e não são
  deriváveis de nada. É comportamento que só aparece no painel.
- **Nota da loja, taxa de aceitação, tempo de preparo realizado** — não estão em
  `Get Store Details` (22 campos, nenhum é isso). O `promise_produce_time` é o
  tempo **configurado pela loja**, não o medido — a doc diz "configured by the
  store" e é campo de escrita no Update Store Info.
- **Resultado de campanha** — o único endpoint de promo (nó 2147) é *upload*, e
  só Grocery.
- **Webhook financeiro** — não existe. Financeiro é 100% polling.

O que chega mais perto de qualidade é o webhook `autoOnlineResult` com
`err_code 1003`: a loja foi **forçada offline por dois dias seguidos sem aceitar
pedidos a tempo**. Não é a taxa de aceitação — é a consequência dela — mas chega
em tempo real, coisa que o relatório não faz.

---

## Riscos e dívidas encontrados no nosso código

| # | Achado | Estado |
|---|---|---|
| 1 | `auth.ts` e `cardapio.ts` ainda apontam para **`openapi.didi-food.com`**. O changelog de 29/abr/2026 migrou tudo para `openapi.99food.com` e dava o antigo como morto em **29/mai/2026**. | Testado em 27/jul: os dois domínios resolvem para o mesmo router e respondem 200. **Ainda funciona**, mas o prazo oficial venceu há 2 meses — pode cair sem aviso. Troca de 2 linhas. |
| 2 | Limite de **31 dias por chamada** (errno 110005) é separado da retenção de 3 meses. Nosso cron pede o mês inteiro. | Meses de 31 dias ficam exatamente no limite. Nunca falhou, mas não há folga. |
| 3 | Rate limit é **por aplicação, não por loja**. `/v3/item/item/list` é **1 req/min**; `syncNinefoodCardapio` itera as lojas sem espera. | **Verificado no banco: as 7 lojas têm cardápio gravado.** Não está mordendo na prática. Risco latente conforme o número de lojas crescer (relevante para o SaaS). |
| 4 | `pay_type` foi marcado legacy em 26/jun/2026. | Não usamos — só menção em comentário. Sem dívida. |

Outros gargalos por aplicação que importam para escala SaaS:
`Get Store Details` 1 req/min · `List Bind Stores` 1 req/20s · `Get Store Menu
Details` 1 req/min.

---

## Changelog da 99 (nó 2077) — o que saiu no último ano

| Data | Mudança |
|---|---|
| 23/jul/2026 | `logistics_cost` e `takeaway_code` em `orderNew`/Order Details + novo endpoint `Verify Delivery Code` |
| 26/jun/2026 | `pay_type` vira legacy → usar `pay_channel` |
| 02/jun/2026 | 4 campos de mensalidade no Bill Data (só Grocery, `orderType=5`) |
| **29/abr/2026** | **Troca de domínio** `openapi.didi-food.com` → `openapi.99food.com` (antigo morreria em 29/mai) |
| 25/mar/2026 | `busy_mode`, `fulfillment_mode`, `sales_type`, `weight` |
| 26/jan/2026 | Novos motivos de cancelamento + `service_price` |
| 15/dez/25 e 14/jan/26 | Apple Pay e Google Pay em `payment_channel` |
| **12/dez/2025** | **`mealLossDeductAmount`, `vatAmount`, `merchantAppealAmount` no Bill Data** |

Nenhuma entrada anuncia API de relatório, métrica ou avaliação. A única menção a
roadmap (nó 2213) diz que o foco é o protocolo nativo, sem data nem feature.

⚠️ `logistics_cost` e `takeaway_code` foram anunciados em 23/jul mas **não
aparecem nas tabelas de campos** dos nós 1983/1981. Ou a doc está atrasada, ou
estão em whitelist — a 99 usa whitelist para liberar feature nova.

---

## Open Delivery: por que não serve

O `Order Polling` (`GET /v4/opendelivery/v1/events:polling`) tem `fromTime` e
parecia o caminho para histórico. Não é:

- É **fila de eventos pendentes de acknowledgment**, não consulta. A doc não
  afirma que volta a eventos já confirmados.
- **Armadilha:** eventos de tipos não listados em `eventType` são
  **auto-confirmados e descartados permanentemente**.
- Sem menção a retenção, paginação ou limite.
- 🔴 **O Open Delivery não tem Financial API.** Os dois candidatos a histórico
  estão em protocolos opostos — migrar custaria o extrato.

A doc recomenda explicitamente o 99Food Protocol. **Se dá para usar os dois no
mesmo app, a doc não diz** — mas o Open Delivery usa
`client_id = AppID_AppShopId`, o que sugere que reaproveita as credenciais do app
que já temos. É inferência, e uma chamada barata de testar.

---

## Nota de privacidade

`Get Order Details` devolve **CPF, telefone e endereço completo** do cliente
(`receive_address`). Se formos usá-lo para reconstruir pedidos, isso é dado
pessoal entrando no nosso banco — precisa decisão consciente sobre guardar ou
descartar na entrada. Existe uma versão mascarada ("Data Privacy Policy") em que
nome e endereço vêm como "privacy protection".

O bloco `promotions` **só funciona em app de produção com whitelist**. Se não
chegar, é chamado no suporte, não bug nosso.
