# Resposta à auditoria de 03/ago/2026 — o que mudou e como reverificar

Documento para quem reauditar. Cobre **o que foi alterado depois da auditoria**,
**o que da auditoria foi confirmado ou contestado**, e **os comandos exatos**
para refazer cada verificação.

Escopo: Cozina Delivery OS. Projeto Supabase `srgmmqihgvkmwjkorkva`.
Repositório: `marcusmassarenti/cozina-delivery-os`, branch `main`.

> **Aviso de estado**: a auditoria original rodou **no meio de uma sessão de
> trabalho**. Dois achados dela descrevem um estado que já não existia quando
> foi escrita (ver §4). Recomendo fixar o commit e o horário no início da
> próxima rodada.

---

## 1. Veredito de cada achado da auditoria

| # | Achado | Veredito | Estado |
|---|---|---|---|
| 1 | P0 — RPCs `SECURITY DEFINER` executáveis por `anon` | **Confirmado e explorado** | Corrigido (`0151`) |
| 2 | P1 — migration `0150` não aplicada em produção | **Improcedente** | Já estava aplicada |
| 3 | P1 — `0142`/`0146` sem o SQL das funções | **Confirmado** | Corrigido |
| 4 | P1 — `next@16.2.6` vulnerável; `xlsx` sem correção | **Parcialmente impreciso** | 7 de 8 resolvidas |
| 5 | P2 — CI com `npm run lint \|\| true` | **Confirmado** | Corrigido (com ressalva) |
| 6 | Documentação defasada | **Confirmado** | `docs/seguranca.md` corrigido |
| — | "3 arquivos não commitados" | **Improcedente** | Estado transitório da sessão |

---

## 2. P0 — RPCs abertas ao anônimo (o achado que valeu a auditoria)

### Confirmação por exploração

Não foi verificado só por consulta de privilégio: foi **explorado de verdade**
contra produção, com a chave publicável (a mesma que vai no navegador de
qualquer visitante, por design), **sem autenticação**:

```
POST /rest/v1/rpc/conferencia_fontes_ifood  {"p_year":2026,"p_month":7}
→ HTTP 200 — 55 lojas, de TODOS os clientes
```

Cinco funções estavam afetadas: `conferencia_fontes_ifood`,
`fechamento_mes_faltando`, `lojas_sem_dado`, `resumo_semanal`,
`usuarios_com_mfa`. Mais `touch_last_seen`, que já checava `auth.uid()` mas não
tinha o que fazer sendo chamada por anônimo.

**Encadeamento:** `conferencia_fontes_ifood` não recebe parâmetro de cliente
(só ano e mês) e devolve `unit_id` — que é a entrada de `lojas_sem_dado` e
`fechamento_mes_faltando`. `resumo_semanal` devolve faturamento bruto e loja
destaque por holding.

**Causa:** o Postgres concede `EXECUTE` a `PUBLIC` por padrão, e no Supabase o
`anon` herda. Sem `revoke` explícito, toda função nasce aberta. `SECURITY
DEFINER` roda como o dono e ignora RLS — a RLS das tabelas estava correta; as
funções passavam por cima dela.

### Correção

Migration **`0151_fecha_rpcs_security_definer.sql`**, aplicada em produção.

Verificado **antes** de aplicar que nenhuma tela quebraria: as 6 são chamadas
por `createAdminClient()` (service_role), exceto `touch_last_seen`, que roda com
a sessão do usuário em `app/(app)/layout.tsx` e por isso manteve
`authenticated`.

### É REINCIDÊNCIA — e isso importa mais que o achado

O mesmo problema foi corrigido em **jul/2026** (migration `0083`, 6 RPCs de
financeiro). Aquela correção trancou **as funções que existiam naquele dia** e
não deixou nenhuma guarda. As migrations `0140`, `0142`, `0146` e `0149` vieram
depois, todas sem `revoke`.

**Tratamos o sintoma duas vezes.** Por isso a correção desta vez inclui uma
guarda automática (§5), não só o `revoke`.

### Como reverificar

```sql
-- Deve retornar ZERO linhas.
select n.nspname, p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef
  and n.nspname not in ('pg_catalog','information_schema')
  and has_function_privilege('anon', p.oid, 'EXECUTE');
```

E pelo caminho do atacante (deve dar **401**):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "$SUPABASE_URL/rest/v1/rpc/conferencia_fontes_ifood" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"p_year":2026,"p_month":7}'
```

---

## 3. Varredura completa (além do escopo da auditoria)

A auditoria listou o que o linter apontou. Fizemos a varredura de **todas** as
superfícies adjacentes, porque uma classe inteira não tinha sido checada.

| Superfície | Método | Resultado |
|---|---|---|
| Funções `SECURITY DEFINER` | `pg_proc` × `has_function_privilege`, todos os schemas | 27 no `public` + vault + pgbouncer — **0 alcançáveis pelo anon** |
| **Views** | `pg_class` relkind `v`/`m` + `security_invoker` | **Nenhuma existe** — classe vazia |
| Leitura de tabelas | 89 tabelas + **teste real** em 10 sensíveis | Todas 401 ou vazio |
| Escrita anônima | grants + `pg_policy` de INSERT/UPDATE/DELETE | **0 policies** alcançam anon sem checar identidade |
| Storage | `storage.buckets` + `storage.objects` | 3 buckets públicos: só logos e vídeos de tutorial |

Tabelas testadas na leitura: `holdings`, `units`, `profiles`, `fin_entries`,
`ifood_financeiro_lancamentos`, `ifood_pedidos`, `api_clients`,
`user_unit_access`, `push_subscriptions`, `rate_limits`.

### Correção a uma conclusão da auditoria

A auditoria afirmou que as 37 tabelas com RLS sem policy *"não possuem grants
diretos para `anon`, `authenticated` ou `PUBLIC`"*, e concluiu **"parecem ser
tabelas exclusivas do servidor; manter esse bloqueio"**.

Medindo o privilégio **efetivo** (que inclui o herdado via `PUBLIC`):

```sql
select count(*) filter (where has_table_privilege('anon', c.oid, 'SELECT')) as anon_alcanca,
       count(*) as total
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r';
-- → 83 de 89
```

**83 das 89 tabelas o anônimo alcança.** O resultado prático hoje é o mesmo
(sem policy, a RLS nega tudo), mas o raciocínio muda a conclusão operacional:

> O que bloqueia é a **ausência de policy**, não a ausência de grant.
> Adicionar uma policy permissiva a qualquer uma das 37 — achando que se está
> mexendo numa tabela sem acesso externo — **a abre imediatamente**.

Sugestão para a próxima auditoria: medir com `has_table_privilege`, não só
inspecionar ACLs diretas.

### Nota sobre `FORCE RLS`

A auditoria observou que nenhuma tabela usa `FORCE RLS`. Vale registrar que isso
tem pouco efeito aqui: `FORCE RLS` só afeta o **dono** da tabela. O servidor usa
`service_role` (que ignora RLS de qualquer forma) e `anon`/`authenticated` já
estão sujeitos a ela. Não é lacuna real neste desenho.

---

## 4. Achados improcedentes (estado transitório)

**`0150` não aplicada.** Estava aplicada:

```sql
select version, name from supabase_migrations.schema_migrations
order by version desc limit 2;
-- 20260803081932 | fluxo_caixa_repasses_por_dia
-- 20260803002436 | 0149_conferencia_fontes
```

**"3 arquivos não commitados".** Árvore limpa; `scripts/teste-deltas.ts` era
arquivo temporário de teste, já removido. A auditoria fotografou o meio de uma
sessão.

---

## 5. Guardas criadas (o que impede a terceira vez)

### `scripts/ci/checa-rpc-anon.mjs` — gate de segurança

Consulta o Security Advisor do Supabase e **falha o build**.

Detalhe de desenho que vale auditar: o script bloqueia um conjunto de regras em
**qualquer nível** (`INFO`/`WARN`/`ERROR`), não só em `ERROR`. Motivo: o advisor
classifica o nível por critério próprio — `touch_last_seen` sai como `WARN`. Um
gate que só olhasse `ERROR` poderia passar batido se a regra do anônimo fosse
reclassificada, produzindo **falso negativo silencioso** — pior que não ter
gate, porque o CI verde vira prova de que está tudo bem justamente quando não
está.

Regras que bloqueiam sempre: `anon_security_definer_function_executable`,
`security_definer_view`, `rls_disabled_in_public`, `policy_exists_rls_disabled`,
`exposed_auth_users`, `unsupported_reg_types`.

`rls_enabled_no_policy` (INFO, 37 tabelas) **não** bloqueia: tabela exclusiva do
servidor sem policy é o estado esperado.

Testado com resposta simulada em 4 cenários: estado atual passa; P0 como `WARN`
falha; P0 como `ERROR` falha; view ignorando RLS em `INFO` falha.

**Depende de dois secrets no GitHub** (`SUPABASE_ACCESS_TOKEN`,
`SUPABASE_PROJECT_REF`) — já configurados. **Sem eles a checagem avisa e passa**;
confirmar que continuam setados faz parte da reauditoria.

### `scripts/ci/lint-catraca.mjs` — ressalva explícita

A auditoria pediu remover o `|| true`. **Não foi feito literalmente**, e o
motivo é relevante para o julgamento de quem reauditar:

Existem **63 erros de lint** hoje. Um gate puro falharia em todo commit, e CI
sempre vermelho é CI ignorado — ficaria pior que antes. A catraca trava o número
em `scripts/ci/lint-teto.json`: pode cair, nunca subir.

Boa parte dos 63 é `react-hooks/set-state-in-effect`, regra nova do React 19 —
consertar significa mexer em ciclo de vida de telas que funcionam. Fica
registrado como **dívida assumida**, não como resolvido.

### Regra de processo

Toda função `SECURITY DEFINER` nasce, na **mesma** migration, com:

```sql
revoke execute on function <assinatura> from public, anon, authenticated;
grant  execute on function <assinatura> to service_role;
```

Exceção: helpers de RLS (`has_unit_access`, `has_holding_access`,
`has_brand_access`) mantêm `authenticated` — sem isso a RLS não avalia as
policies. É por isso que o invariante do gate é *"não executável pelo anon"* e
não *"revogado de todos"*.

---

## 6. Dependências — 8 vulnerabilidades altas em produção → 1

A auditoria indicou `next@16.2.12` como correção. **A premissa estava
imprecisa**, e o caminho não funcionaria:

O `next` **não tem falha própria**. É sinalizado *através* de `postcss` (path
traversal via `sourceMappingURL`) e `sharp` (CVEs herdadas do libvips), que ele
fixa em versões vulneráveis. Subir 16.2.6 → 16.2.12 **não resolveu nenhuma das
duas** — o `npm audit` chegava a sugerir `"fixAvailable: 9.3.3"`, ou seja voltar
sete versões maiores.

Resolvido com `overrides` no `package.json`: `postcss ^8.5.25`, `sharp ^0.35.3`.
(`next/image` não é usado em lugar nenhum do projeto — o `sharp` é peso morto.)

Achado adicional: **`shadcn` (CLI de scaffold) estava em `dependencies`**,
arrastando `hono` e `fast-uri` para produção. Movido para `devDependencies`.

Reverificação:

```bash
npm audit --omit=dev --audit-level=high
```

### Continua aberto — `xlsx`

Única vulnerabilidade alta restante em produção. **Sem correção disponível no
npm** (`fixAvailable: false`): prototype pollution (<0.19.3) e ReDoS (<0.20.2).

É a mais exposta do sistema: processa a **planilha que o cliente faz upload**.
Saídas em avaliação: migrar para o CDN oficial do SheetJS (que publica versão
corrigida fora do npm) ou trocar de parser. **Adiado por decisão do responsável
em 03/ago/2026.** Aberto desde jul/2026.

---

## 7. Fora do escopo da auditoria — correções de exatidão e performance

Mudanças do mesmo dia que alteram comportamento e merecem entrar na próxima
reauditoria funcional.

### Fluxo de Caixa somava errado, e depois somava devagar

A tela **Financeiro → Visão Geral** não abria. Para montar a projeção de caixa
ela baixava **126.761 linhas** de `ifood_financeiro_lancamentos` (779 mil
linhas, 423 MB) em **127 requisições sequenciais** — para produzir **5 números**
(o período só tem 5 dias distintos de repasse).

Histórico completo, porque as duas metades importam:

1. Antes, sem paginar, o PostgREST devolvia as 1.000 primeiras linhas: a tela
   mostrava **R$ 4.936 onde havia R$ 754.737** (0,65%). Sem `order`, quais 1.000
   voltavam era decisão do planner — o número mudava entre dois F5.
2. Paginar corrigiu o valor e criou a lentidão acima.

**Correção:** migration `0150` cria `fluxo_caixa_repasses_ifood(inicio, fim,
unit_ids)`, que agrega no banco. Conferido contra a soma crua: 5 linhas,
R$ 828.015,85, idêntico ao centavo.

Mudança de comportamento a registrar: **erro na consulta agora estoura** em vez
de virar "nenhum repasse previsto". Saldo projetado falsamente apertado sugere
aperto de caixa inexistente — pior que a tela não abrir.

### Performance do dashboard

| | Antes | Depois |
|---|---|---|
| Dashboard | 4.588 / 10.890 ms | **~1.160 ms** |
| Visão Geral | não abria | **~400–1.000 ms** |

Causa principal, achada só depois de instrumentar por fonte:
`getRealMonthlyForUnits` passava `dateRange` para a primeira onda de consultas e
**não para a segunda**. Sem ele, `getVrByUnits` caía no `ref_year/ref_month` e
puxava o mês inteiro — 27.764 linhas onde 2.936 bastavam.

Havia risco de número junto (loja sem Conciliação na janela receberia 30 dias de
VR como fallback de 3 dias, inflando o lado "mês passado" das setas de
variação). Conferido antes de alterar: só 2 lojas cairiam no fallback e em ambas
o valor é R$ 0,00 — **nenhum número mudou na tela**.

### Instrumentação permanente

`src/lib/perf.ts` emite uma linha `[perf]` por render em `/inicio` e
`/financeiro`, mais uma por chamada de `getRealMonthlyForUnits`. Lê-se com:

```bash
npx vercel logs <deploy-url> --json | grep -o '\[perf\][^"\\]*'
```

Não contém dado de cliente — só tempos, contagem de lojas e período.

### Levantamento de `fetchAllRows` (50 chamadas)

A tese inicial de "51 chamadas perigosas" **não se sustentou**. Medido caso a
caso:

- **1 grave**: `listPedidosForMonth` (26.152 linhas numa loja, 180 idas na
  rede) — e era **código morto**, nunca chamado. Removida.
- **1 moderada**: `getRecebidoSemana` (7 idas, aba Fechamento da unidade).
- **48 inofensivas**: 1 a 3 idas; 12 delas em tabelas com ≤3 linhas.

`getFinanceiroResumoByUnits`, que alimenta o dashboard, **já usava RPC**. Nada a
fazer nas 48 — mexer em código que funciona só cria risco.

### Correção de dados do 99 Food

O webhook corrompia o número do pedido: `JSON.parse` perde precisão em inteiros
de 19 dígitos (IEEE 754). **4.663 de 4.663 linhas de webhook (100%)** estavam
corrompidas, causando contagem dupla de pedidos. Corrigido no parser (as
sequências longas viram string antes do parse) e 1.464 IDs reconstruídos; 141
permanecem irrecuperáveis (sem correspondência no extrato da API).

---

## 8. Commits desta resposta

```
8c8eb39  Gate de segurança bloqueia em qualquer nível, não só em ERROR
4e8d9d6  CI: catraca de lint e gate de RPC anônima no workflow
12b3ecf  Dependências: 8 vulns altas em produção viram 1; catraca de lint; gate anti-P0
ef02cbe  Fecha RPCs security definer expostas ao anônimo (P0) e completa 0142/0146
e75e371  getRealMonthlyForUnits: passa o recorte de data pro VR também
8e108ae  Mede getRealMonthlyForUnits por fonte
3035079  Remove listPedidosForMonth (morta) e estende o cache do resumo a recortes
b2c9609  Changelog 1.11.3: Visão Geral e Dashboard
98e753e  Visão Geral: dispara as 5 consultas juntas + cronômetro
1faabb0  Fluxo de Caixa: soma os repasses do iFood no banco (127 consultas viram 1)
3deca02  Dashboard: tira as setas do herói do caminho crítico
236eed1  Dashboard: cronômetro de fases pra medir o tempo real em produção
```

Migrations aplicadas em produção: **`0150`**, **`0151`**.
Migrations completadas (código extraído do banco): **`0142`**, **`0146`**.

---

## 9. Roteiro sugerido para a reauditoria

1. **Fixar o estado**: anotar commit de `main` e horário antes de começar.
2. **P0**: rodar as duas verificações da §2 (SQL + curl com a chave publicável).
   Ambas devem dar vazio / 401.
3. **Varredura**: repetir a §3, incluindo views, escrita e storage — não só o
   que o linter aponta.
4. **Grants**: usar `has_table_privilege`, não ACL direta (ver §3).
5. **Dependências**: `npm audit --omit=dev --audit-level=high` deve mostrar
   apenas `xlsx`.
6. **CI**: confirmar que `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_REF`
   continuam nos secrets — sem eles o gate avisa e passa.
7. **Restauração**: validar que `supabase/migrations/` recria o banco do zero,
   agora que `0142` e `0146` foram completadas. Esta é a promessa de
   `docs/recuperacao-banco.md` e **não foi testada de ponta a ponta**.
8. **Funcional**: reconferir os números do Fluxo de Caixa e das setas de
   variação do dashboard (§7), que passaram por mudança de cálculo.

### Pontos onde uma auditoria independente agrega mais

- **Escritas via `service_role`**: a segurança das escritas mora na aplicação
  (`getAccessibleUnitIds`), não no banco. Não há policies de `WITH CHECK` como
  rede de segurança. É a maior lacuna estrutural conhecida.
- **`xlsx`** processando arquivo não confiável (§6).
- **As 37 tabelas sem policy** (§3): hoje seguras pela ausência de policy, não
  por desenho explícito.
- **Teste de restauração** de fato, do zero (item 7).
