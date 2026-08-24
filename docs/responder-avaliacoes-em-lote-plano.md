# Responder avaliações em lote — plano

**Status:** proposta, nada construído · **Levantado em:** 24/08/2026

---

## O teto real é pequeno, e isso muda o desenho

Medido na base inteira em 24/08:

```
11.163  avaliações no banco
 5.125  vieram pela API (têm review_id)
   225  em NOT_REPLIED
    92  ← respondíveis AGORA
```

O iFood abre uma janela estreita: a avaliação só aceita resposta **entre ~24h e
~5 dias** depois de criada; passado isso ela vira `PUBLISHED` e fecha para
sempre. As 4.886 sem resposta que já passaram do prazo **não voltam** — nenhum
botão traz elas de volta.

Consequência para o produto: o valor não é *"zerar a fila histórica"*, é
**fechar a janela do dia antes que ela feche sozinha**. Isso empurra o desenho
para uma rotina diária, não para uma faxina única.

### As 92 de hoje, por cliente

| Cliente | Respondíveis | Nota ≤ 3 |
|---|---|---|
| DG FOODS | 42 | 19 |
| Churrasco no Pote | 16 | 2 |
| Empreender com Delivery | 13 | 4 |
| Tech Assessoria | 12 | 6 |
| Churrasco Royal Poços | 7 | 2 |
| Prime Gestão Delivery | 2 | 1 |

Todas as 92 têm comentário escrito pelo cliente final.

---

## O que já existe

Não precisa construir:

- `replyToReview()` em `src/lib/ifood/review.ts` — endpoint v2, já em uso
- `review_id` e `status_avaliacao` guardados em `ifood_avaliacoes`
- Todas as travas do caminho individual, em `app/(app)/avaliacoes/_actions.ts`:
  - acesso à loja pelo escopo do usuário
  - loja compartilhada é só acompanhamento (não responde pela dona)
  - tratamento de 409/422 — alguém respondeu pelo portal no meio do caminho
  - desvio da conta demo (grava sem falar com o iFood)

---

## O que falta — três peças

**1. Consulta das respondíveis.** `review_id` presente, `resposta_texto` nulo,
`status_avaliacao = NOT_REPLIED` e `data_avaliacao` dentro de 5 dias. Agrupada
por loja, separando 4–5★ de ≤3★.

**2. Tela de revisão.** Lista com uma resposta sugerida por avaliação, cada uma
editável e com caixa de incluir/pular. O botão do topo **abre a lista**; só o do
rodapé envia.

```
┌─────────────────────────────────────────────────────────┐
│ 42 avaliações esperando resposta · janela fecha em 2 dias│
│ ☑ 23 elogios (4–5★)    ☐ 19 críticas (≤3★)              │
├─────────────────────────────────────────────────────────┤
│ ☑ ★★★★★  12 · Jardins        "chegou quentinho, top!"   │
│    ↳ Que bom que chegou quentinho! Obrigado…      [edit] │
│ ☑ ★★★★☆  06 · Brooklin       "demorou mas veio certo"   │
│    ↳ Obrigado pelo retorno — vamos apertar…       [edit] │
├─────────────────────────────────────────────────────────┤
│              [ Enviar 23 respostas ]                     │
└─────────────────────────────────────────────────────────┘
```

**3. Envio sequencial.** Com intervalo entre chamadas — o limite do iFood é por
APLICAÇÃO e é compartilhado com o sync diário de todos os clientes. Grava cada
resultado e mostra um resumo no fim: enviadas, recusadas pelo iFood, puladas.

---

## Decisões em aberto

| Decisão | Recomendação | Por quê |
|---|---|---|
| De onde vem o texto | IA lendo cada comentário, com modelos fixos como plano B | ~US$ 0,02 por lote de 92 com Haiku. Sem o plano B, o botão só existe para quem tem o plano AI |
| Críticas (≤3★) | Aparecem na lista, **desmarcadas** | São 34 das 92. Responder reclamação com texto de lote é pior que não responder |

---

## O risco que define o desenho

Resposta no iFood é **a escrita mais irreversível do sistema**: sai pública,
assinada pela loja, e o iFood só deixa editar por 10 minutos.

Por isso nenhuma versão desse botão deveria enviar sem passar pela lista de
revisão. Um clique que dispara 42 textos públicos sem ninguém ler seria a coisa
mais perigosa já construída aqui — e o estrago não é nosso, é do perfil do
cliente do cliente.

---

## Esforço

Cerca de **um dia e meio**: meio dia a consulta e o envio, um dia a tela de
revisão — que é a parte que carrega a segurança.

---

## O que provavelmente vale mais que o botão

Como a janela fecha em 5 dias, o que mais aumentaria a taxa de resposta não é o
lote em si: é **avisar que ela está fechando**. Um "você tem 42 avaliações que
expiram em 2 dias" no Início, levando para essa tela, ataca a causa real de as
4.886 terem passado do prazo — ninguém soube a tempo.

Vale construir os dois, e nessa ordem.
