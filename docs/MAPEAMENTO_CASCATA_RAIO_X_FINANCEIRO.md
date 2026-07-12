# Raio X Financeiro 2.0 — Mapa da Cascata de Cálculo

**Origem:** Planilha "ECD Finance" (metodologia proprietária — Bruno)
**Destino:** Módulo `finance` do Cozina Delivery OS (Next.js + Supabase, multi-tenant/RLS)
**Objetivo deste documento:** entregar ao Claude Code, na Fase 0, o modelo de domínio já resolvido — fórmula por fórmula, da entrada de insumo até o KPI de dashboard — para eliminar ambiguidade e reduzir alucinação na modelagem.

> Notação: referências no formato `ABA!CÉLULA`. Fórmulas transcritas do XML original da planilha. Percentuais são armazenados como fração (0,40 = 40%).

---

## 1. Visão macro: a cascata de dependências

A planilha não é um cadastro de despesas — é um **motor de custeio e precificação em cascata**. Alterar um único insumo precisa se propagar até o dashboard. Preservar essa propagação é o requisito central do port.

```
[1] INSUMOS ─────────► valor_final por insumo
      │
      ▼
[2] FICHAS TÉCNICAS ──► custo_total por prato (composição N:N de insumos)
      │
      ▼
[3] MARGEM & MARKUP ─► preço de venda por prato (markup divisor)
      │                 ▲
      │                 │ (rateios % vêm da DRE)
      ▼                 │
[4] DRE ANALÍTICA ◄────┤ plano de contas hierárquico (lançamentos)
      │                 │
      ▼                 │
[5] DRE SINTÉTICA ─────┘ consolidação + margem de contribuição + ponto de equilíbrio
      │
      ▼
[6] DASHBOARD ───────► 7 KPIs derivados
```

Observação estrutural importante: na planilha há **acoplamento circular de leitura** — a aba MARGEM lê percentuais da DRE SINTÉTICA, que por sua vez consolida a DRE ANALÍTICA. No sistema, isso deve virar uma ordem de cálculo explícita (DAG), não referências cruzadas entre "abas".

---

## 2. Camada [1] — Insumos

**Aba origem:** `CADASTRO DE INSUMOS` (linhas 10–59, ~50 slots)

**Campos de entrada:** `ID`, `PRODUTO`, `VALOR PAGO R$` (D), `VOLUME` (E), `UNIDADE DE MEDIDA` (F), `FATOR DE CORREÇÃO` (G)

**Campo calculado — `VALOR FINAL R$` (H):**
```
H = IFERROR( (VALOR_PAGO * FATOR_CORRECAO) / VOLUME , "-" )
```

**Semântica:** custo unitário ajustado. O fator de correção cobre perda/limpeza/rendimento (ex.: peça que perde peso no preparo). Volume permite comprar em lote e ratear por unidade de uso.

**Schema Supabase proposto:**
```sql
create table insumos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  nome          text not null,
  valor_pago    numeric(12,4) not null,
  volume        numeric(12,4) not null default 1,
  unidade       text not null,           -- 'UNIDADE' | 'KG' | 'L' ...
  fator_correcao numeric(8,4) not null default 1,
  valor_final   numeric(12,4) generated always as
                ((valor_pago * fator_correcao) / nullif(volume,0)) stored,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table insumos enable row level security;
```
> `valor_final` como **coluna gerada** garante integridade da base da cascata no próprio banco. `nullif(volume,0)` replica o `IFERROR`.

---

## 3. Camada [2] — Fichas Técnicas

**Abas origem:** `FICHA1` … `FICHA100` (uma aba por prato, ~30 linhas de ingrediente cada)

Cada linha da ficha referencia um insumo **pelo nome** e busca seus atributos com `INDEX/MATCH`:

```
UNIDADE   (E) = INDEX(INSUMOS!F, MATCH(nome_ingrediente, INSUMOS!C, 0))
FATOR     (F) = INDEX(INSUMOS!G, MATCH(nome_ingrediente, INSUMOS!C, 0))
CUSTO_UN  (G) = INDEX(INSUMOS!H, MATCH(nome_ingrediente, INSUMOS!C, 0))   -- valor_final do insumo
CUSTO_TOT (H) = IFERROR( CUSTO_UN * QUANTIDADE_LIQUIDA , "-" )
```

**Custo total da ficha:**
```
CUSTO_TOTAL_FICHA = SUM(H12:H41)          -- FICHA1!H42
```

**Pontos críticos para o port:**
- O vínculo insumo↔ficha na planilha é **por texto (nome)** — frágil. No sistema deve virar **foreign key** (`insumo_id`), eliminando erro de digitação e permitindo renomear insumo sem quebrar fichas.
- Relação **N:N** entre fichas e insumos, com atributo de junção `quantidade_liquida`.
- Limite de 100 fichas é artificial (limitação de planilha). No sistema, ilimitado por tenant.

**Schema Supabase proposto:**
```sql
create table fichas_tecnicas (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  nome        text not null,             -- "PRATO INDIVIDUAL - PULLED PORK"
  tipo        text,                       -- 'INDIVIDUAL' | 'COMBO' ...
  modo_preparo text,
  ativo       boolean default true,
  created_at  timestamptz default now()
);

create table ficha_ingredientes (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  ficha_id          uuid not null references fichas_tecnicas(id) on delete cascade,
  insumo_id         uuid not null references insumos(id),
  quantidade_liquida numeric(12,4) not null,
  ordem             int default 0
);
-- custo_total_ficha: computar via VIEW (soma de quantidade * insumo.valor_final)
create view v_ficha_custo as
  select fi.ficha_id, fi.tenant_id,
         sum(fi.quantidade_liquida * i.valor_final) as custo_total
  from ficha_ingredientes fi
  join insumos i on i.id = fi.insumo_id
  group by fi.ficha_id, fi.tenant_id;
```
> Custo da ficha como **view** (não coluna estática): recalcula sozinho quando o insumo muda de preço — é exatamente a propagação que dá o "raio X".

---

## 4. Camada [3] — Margem & Markup (o núcleo da metodologia)

**Aba origem:** `MARGEM E MARKUP` (uma linha por ficha)

Esta é a peça central do método do Bruno: **precificação por markup divisor**. O preço é derivado do custo direto dividido por "1 menos a soma de tudo que sai como percentual da venda".

### 4.1 Entradas por linha
- `CUSTO DIRETO (D)` = custo_total da ficha correspondente (`= FICHA_n!H42`)
- Percentuais de dedução/despesa variável (F..U), **lidos da DRE SINTÉTICA** (representam a estrutura de custo do negócio como % do faturamento):

| Col | Componente | Origem |
|-----|-----------|--------|
| F | Taxas de cartões | DRE SINTÉTICA!D11 |
| G | Royalties e comissões | !D12 |
| H | Aplicativos (iFood etc.) | !D13 |
| I | Despesas com vendas | !D15 |
| J | Impostos s/ vendas | !D16 |
| K | Aplicativo próprio | !D14 |
| L | Desp. adm. e estrutura | !D20 |
| M | Marketing | !D21 |
| N | Tecnologia | !D22 |
| O | Pessoal | !D23 |
| P | Sócios | !D24 |
| Q | Veículos | !D25 |
| R | Terceiros | !D26 |
| S | Financeiras | !D27 |
| T | Empréstimos | !D29 |
| U | Investimentos | !D30 |
| V | **Margem desejada** (lucro-alvo) | input do usuário |

### 4.2 Fórmulas-núcleo
```
MARKUP (W)        = 100% / (100% − F − G − I − J − K − L − M − N − O − P − Q − R − S − T − U − V)
PREÇO_DE_VENDA (X) = CUSTO_DIRETO * MARKUP
LUCRO_LIQUIDO_RS(Y)= PREÇO_DE_VENDA * MARGEM_DESEJADA
%_CMV (E)          = CUSTO_DIRETO / PREÇO_DE_VENDA
```

> ⚠️ Atenção: no divisor do MARKUP (W) a planilha **inclui V (margem desejada) e omite H (apps)** — há uma variante `AD` que inclui H e outra que troca componentes. Isso indica **múltiplos regimes de precificação** (com/sem app, com/sem certos rateios). No port, modelar como *estratégias de markup selecionáveis*, não uma fórmula única hardcoded. **Validar com o Bruno qual é o regime canônico** antes de fixar.

### 4.3 Cenários derivados (colunas à direita)
A planilha calcula ainda:
- **Preço com desconto** e margem líquida resultante (`AL`, `AM`, `AN`) — simulação de promoção.
- **Nova quantidade para manter lucro** (`AS = (Y * AP) / AN`) — quanto precisa vender a mais para compensar um desconto. Excelente feature de produto ("simulador de promoção").

### 4.4 Schema proposto
```sql
-- Parâmetros de precificação por tenant (a "estrutura de custo variável")
create table config_precificacao (
  tenant_id       uuid primary key references tenants(id),
  pct_taxa_cartao numeric(6,5) default 0,
  pct_royalties   numeric(6,5) default 0,
  pct_apps        numeric(6,5) default 0,
  pct_app_proprio numeric(6,5) default 0,
  pct_desp_vendas numeric(6,5) default 0,
  pct_impostos    numeric(6,5) default 0,
  pct_adm         numeric(6,5) default 0,
  pct_marketing   numeric(6,5) default 0,
  pct_tecnologia  numeric(6,5) default 0,
  pct_pessoal     numeric(6,5) default 0,
  pct_socios      numeric(6,5) default 0,
  pct_veiculos    numeric(6,5) default 0,
  pct_terceiros   numeric(6,5) default 0,
  pct_financeiras numeric(6,5) default 0,
  pct_emprestimos numeric(6,5) default 0,
  pct_investimentos numeric(6,5) default 0,
  regime_markup   text default 'padrao'   -- estratégia selecionável (ver 4.2)
);

-- Precificação por ficha (margem desejada é o único input livre aqui)
create table precificacao_ficha (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  ficha_id        uuid not null references fichas_tecnicas(id),
  margem_desejada numeric(6,5) not null default 0,
  preco_manual    numeric(12,2)   -- override opcional; se nulo, usa preço calculado
);
```
Markup, preço e %CMV → **funções de aplicação (ou view)**, nunca campos editáveis:
```
markup  = 1 / (1 − Σ(percentuais_do_regime) − margem_desejada)
preco   = custo_direto(ficha) * markup
pct_cmv = custo_direto / preco
```
> Guardar denominador contra zero/negativo: se `Σ% + margem ≥ 1`, o markup explode → retornar erro de negócio ("estrutura de custo inviável para essa margem").

---

## 5. Camada [4] — DRE Analítica (plano de contas)

**Aba origem:** `DRE ANALÍTICA` — plano de contas **hierárquico** com numeração `1`, `2`, `2.1`, `2.5`, `2.5.1` … `8.x`.

Estrutura observada (grupos e exemplos de subcontas):
```
1     FATURAMENTO BRUTO
2     DEDUÇÕES SOBRE VENDAS
  2.1   Taxas administrativas de cartões
  2.2   Taxas de antecipação de cartões
  2.3   Royalties e comissões
  2.4   Aplicativos (iFood etc.)
  2.5   Despesas com vendas
    2.5.1  Entregadores / motoboys
    2.5.2  Embalagens
    2.5.x  ... (slots livres)
  2.6   Impostos
    2.6.1  Simples Nacional "DAS"
    2.6.x  ... (outros impostos)
3     FATURAMENTO LÍQUIDO       (= 1 − 2)
4     CUSTO DA MERCADORIA VENDIDA
5     LUCRO BRUTO               (= 3 − 4)
6     Despesas administrativas e com estrutura (6.1..6.20)
7     Despesas com marketing (7.1..7.10)
8     Despesas com tecnologia (8.1..8.15)
...   (pessoal, sócios, veículos, terceiros, financeiras, empréstimos, investimentos)
```
Cada conta traz `VALOR R$` e `AV` (análise vertical = valor / faturamento bruto).

**Requisito de arquitetura (crítico):** o plano de contas **não pode ser hardcoded**. É o IP metodológico do Bruno e precisa ser:
- **versionável** (a metodologia evolui),
- **configurável por template** (base para white-label / licenciamento),
- **instanciável por tenant** (cada operação lança nas mesmas contas).

**Schema proposto (plano de contas como árvore + lançamentos):**
```sql
-- Template da metodologia (versionável — IP do Bruno)
create table metodologia_templates (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,        -- "ECD Finance"
  versao    text not null,        -- "1.0"
  publicado boolean default false
);

-- Plano de contas hierárquico (pertence a um template)
create table plano_contas (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references metodologia_templates(id),
  codigo       text not null,      -- '2.5.1'
  nome         text not null,      -- 'Entregadores / motoboys'
  parent_id    uuid references plano_contas(id),
  tipo         text not null,      -- 'entrada' | 'deducao' | 'custo' | 'despesa_fixa' | 'despesa_variavel' | 'resultado'
  natureza     text,               -- 'variavel' | 'fixo' (define entrada no ponto de equilíbrio)
  eh_calculado boolean default false, -- 3,5,resultados = derivados, não lançáveis
  ordem        int default 0
);

-- Lançamentos reais por tenant e período
create table lancamentos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  conta_id    uuid not null references plano_contas(id),
  competencia date not null,       -- mês de referência
  valor       numeric(14,2) not null,
  descricao   text,
  origem      text default 'manual', -- 'manual' | 'venda_delivery_os' | 'importacao'
  created_at  timestamptz default now()
);
alter table lancamentos enable row level security;
```
> `natureza` (fixo/variável) é o que alimenta o ponto de equilíbrio na camada [5]. `eh_calculado` marca as linhas que são resultado de fórmula (Faturamento Líquido, Lucro Bruto, Resultado Operacional/Líquido) e não recebem lançamento direto.

---

## 6. Camada [5] — DRE Sintética (consolidação + margem de contribuição + ponto de equilíbrio)

**Aba origem:** `DRE SINTÉTICA`. Dois blocos.

### 6.1 Bloco DRE consolidada (coluna C = R$, coluna D = % s/ faturamento)
```
FATURAMENTO BRUTO        C10 = ANALÍTICA!D10
TAXAS DE CARTÕES         C11 = ANALÍTICA!D12 + ANALÍTICA!D13   (adm + antecipação)
ROYALTIES/COMISSÕES      C12 = ANALÍTICA!D14
APLICATIVOS              C13 = ANALÍTICA!D15
APLICATIVO PRÓPRIO       C14 = ANALÍTICA!D16
DESPESAS COM VENDAS      C15 = ANALÍTICA!D17
IMPOSTOS                 C16 = ANALÍTICA!D33
FATURAMENTO LÍQUIDO      C17 = C10 − SUM(C11:C16)
CMV                      C18 = ANALÍTICA!D41
LUCRO BRUTO              C19 = C17 − C18
── despesas fixas ──
ADM E ESTRUTURA          C20 = ANALÍTICA!D43
MARKETING                C21 = ANALÍTICA!D64
TECNOLOGIA               C22 = ANALÍTICA!D75
PESSOAL                  C23 = ANALÍTICA!D91
SÓCIOS                   C24 = ANALÍTICA!D110
VEÍCULOS                 C25 = ANALÍTICA!D121
TERCEIROS                C26 = ANALÍTICA!D132
FINANCEIRAS              C27 = ANALÍTICA!D143
RESULTADO OPERACIONAL    C28 = C19 − SUM(C20:C27)
EMPRÉSTIMOS              C29 = ANALÍTICA!D155
INVESTIMENTOS            C30 = ANALÍTICA!D166
RESULTADO LÍQUIDO        C31 = C28 − C29 − C30
```
Coluna D (análise vertical): cada `Dn = Cn / C10`.

### 6.2 Bloco margem de contribuição e ponto de equilíbrio
```
CUSTO FIXO (R$)          G10 = SUM(C20:C27) + C29 + C30     -- todas as despesas fixas
% CUSTOS VARIÁVEIS       G13 = D11+D12+D13+D14+D15+D16       -- deduções variáveis (% s/ venda)
CMV %                    G14 = D18
CUSTO VARIÁVEL TOTAL %   G15 = G13 + G14
MARGEM DE CONTRIBUIÇÃO % G17 = 100% − G15
PONTO DE EQUILÍBRIO (R$) G18 = G10 / G17
```
Esta é a fórmula clássica: **Ponto de Equilíbrio = Custo Fixo ÷ Margem de Contribuição %**.

### 6.3 Onde computar
Toda a camada [5] é **derivada** de `lancamentos` + `plano_contas.natureza`. Recomendação: **funções/views Postgres** parametrizadas por `(tenant_id, competencia)`:
```sql
create or replace function dre_sintetica(p_tenant uuid, p_competencia date)
returns table(linha text, valor numeric, av numeric) language sql stable as $$
  -- agrega lancamentos por grupo do plano_contas, aplica as regras de C17,C19,C28,C31
$$;
```
> A verdade financeira vive no banco (agregando lançamentos), não na aplicação. Isso garante consistência multi-tenant e permite auditoria.

---

## 7. Camada [6] — Dashboard (7 KPIs)

**Aba origem:** `DASHBOARD DE INDICADORES`. Todos derivados das camadas anteriores:

| KPI | Fórmula | Origem |
|-----|---------|--------|
| **Ticket Médio (R$)** | `FATURAMENTO!C14` | faturamento / nº pedidos |
| **CMV %** | `SINTÉTICA!D18` | CMV / faturamento |
| **Lucro Bruto % / Margem de Contribuição** | `SINTÉTICA!G17` | 100% − custo variável total |
| **Markup Médio** | `SINTÉTICA!C10 / C18` | faturamento bruto / CMV |
| **Lucro Líquido (R$)** | `SINTÉTICA!C31` | resultado líquido |
| **Lucro Líquido %** | `SINTÉTICA!D31` | resultado líquido / faturamento |
| **Ponto de Equilíbrio (R$)** | `SINTÉTICA!G18` | custo fixo / margem contribuição |
| **Prime Cost %** | `(C18 + C23 + C24) / C10` | (CMV + Pessoal + Sócios) / faturamento |

### 7.1 Faixas de semáforo (regras de negócio embutidas)
A planilha já traz *thresholds* — transportá-los como regras configuráveis:
```
CMV:            ≤35% "EXCELENTE"  |  ≥40% "MUITO ALTO"  |  entre = "REGULAR"
Lucro Líquido:  ≤10% "RUIM"       |  ≥16% "EXCELENTE"   |  entre = "REGULAR"
Prime Cost:     >60% "RUIM"       |  ≤50% "EXCELENTE"   |  entre = "REGULAR"
```
> No sistema, esses limites devem morar no **template de metodologia** (são parte do método do Bruno), não fixos no código.

---

## 8. Integração com o Delivery OS (a visão do Bruno: "relatório interligado à planilha")

O diferencial competitivo do produto integrado: as **vendas reais do Delivery OS alimentam a DRE automaticamente**, algo que a planilha nunca terá.

| Dado do Delivery OS | Alimenta | Como |
|---------------------|----------|------|
| Vendas realizadas (R$) | `lancamentos` conta `1` (Faturamento Bruto) | agregação por competência, `origem='venda_delivery_os'` |
| Qtd. de vendas / pedidos | Ticket Médio | faturamento ÷ nº pedidos |
| Mix de produtos vendidos | CMV **real** | Σ (qtd vendida × custo_ficha) — CMV deixa de ser estimativa |
| Taxas por meio de pagamento | conta `2.1/2.2` | mapear PIX/cartão/app às deduções |
| Vendas por app (iFood etc.) | conta `2.4` | comissão real por canal |

**Ganho de produto:** a planilha usa CMV como percentual arbitrado (40%). Com o Delivery OS, o **CMV vira medido** (mix real × ficha técnica). Isso fecha o loop insumo→ficha→venda→DRE e é o argumento de venda da assinatura conjunta.

---

## 9. Riscos e casos-limite para o Claude Code tratar na Fase 0

1. **Isolamento multi-tenant (P0/LGPD):** toda tabela nova com `tenant_id` + RLS. Nenhum cálculo pode cruzar tenants. Reusar as políticas já existentes no Delivery OS.
2. **Divisor do markup:** se `Σ% + margem_desejada ≥ 1`, markup → infinito/negativo. Tratar como erro de negócio, nunca deixar propagar `#DIV/0`.
3. **Regime de markup ambíguo (seção 4.2):** a planilha tem variantes que incluem/excluem componentes. **Não fixar fórmula única** — modelar estratégias e validar a canônica com o Bruno.
4. **Vínculo insumo↔ficha:** migrar de "match por nome" (planilha) para **FK** (`insumo_id`). Prever passo de reconciliação na importação dos dados históricos.
5. **Contas calculadas vs. lançáveis:** Faturamento Líquido, Lucro Bruto, Resultados são derivados — bloquear lançamento direto (`eh_calculado=true`).
6. **Metodologia como template versionado:** plano de contas, thresholds de semáforo e regime de markup pertencem ao `metodologia_template`, não ao código. É o que habilita white-label/licenciamento futuro.
7. **Competência (mês de referência):** toda a DRE é mensal. Definir `competencia date` como chave temporal em todo lançamento e em todas as funções de consolidação.
8. **Ordem de cálculo (DAG):** eliminar o acoplamento circular da planilha (MARGEM lê SINTÉTICA que lê ANALÍTICA). Definir ordem determinística: insumos → fichas → lançamentos → DRE analítica → sintética → margem/preço → dashboard.

---

## 10. Ordem de implementação sugerida (P0 → MVP → integração)

- **P0 — Fundação multi-tenant:** tabelas `insumos`, `fichas_tecnicas`, `ficha_ingredientes` + RLS + views de custo. Entregável: cadastro de insumo/ficha com custo propagando.
- **MVP-1 — Precificação:** `config_precificacao`, `precificacao_ficha`, funções de markup/preço/%CMV. Entregável: tela "Margem & Markup" com simulador de preço e de desconto.
- **MVP-2 — DRE:** `metodologia_templates`, `plano_contas`, `lancamentos` + funções `dre_sintetica` e ponto de equilíbrio. Entregável: DRE mensal + dashboard dos 7 KPIs com semáforos.
- **Integração — Delivery OS:** pipeline de vendas → lançamentos automáticos + CMV real por mix. Entregável: DRE que se atualiza sozinha a partir das vendas.
- **Escala — White-label:** versionamento de metodologia, templates publicáveis, assinatura conjunta dos dois produtos.

---

*Documento de referência técnica para a Fase 0. Anexar ao repositório do Delivery OS junto ao prompt de bootstrapping do Claude Code.*
