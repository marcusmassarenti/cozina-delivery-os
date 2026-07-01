--------------------------------------------------------------------
-- 0067_keeta_promocoes.sql
-- Relatório "Dados da promoção" do Keeta — 1 linha por campanha × loja × dia.
-- Traz o ROI de cada promoção específica (que os outros relatórios não dão
-- agrupado): quantos pedidos a campanha trouxe, vendas geradas e o custo
-- (despesa) que a loja pagou por ela.
--------------------------------------------------------------------

create table public.keeta_promocoes (
  id                      uuid primary key default uuid_generate_v4(),
  unit_id                 uuid not null references public.units(id) on delete cascade,

  data                    date not null,                 -- "Data" (YYYYMMDD)
  ref_year                integer not null,
  ref_month               integer not null check (ref_month >= 1 and ref_month <= 12),

  ato_id                  text not null,                 -- "ID do ato" (identidade da campanha)
  regra_desconto          text,                          -- "Regras de desconto" (ex.: Itens promocionais - Entrega - -30%)
  store_name              text,                          -- "Nome da loja"

  pedidos_campanha        numeric(14, 2),                -- "Pedidos da campanha"
  pedidos_validos         numeric(14, 2),                -- "Pedidos válidos"
  vendas_promo_itens      numeric(14, 2),                -- "Vendas de promoção de itens"
  vendas_itens            numeric(14, 2),                -- "Vendas de itens"
  despesa_campanha        numeric(14, 2),                -- "Despesas da campanha" (custo da loja)
  despesa                 numeric(14, 2),                -- "Despesa"
  despesa_media_campanha  numeric(14, 2),                -- "Despesas médias da campanha"
  despesa_unidade         numeric(14, 2),                -- "Despesa (unidade)" (custo por pedido válido)

  import_id               uuid references public.platform_imports(id) on delete set null,
  imported_at             timestamptz not null default now(),

  unique (unit_id, data, ato_id)
);

create index keeta_promo_unit_ref_idx
  on public.keeta_promocoes (unit_id, ref_year, ref_month);

alter table public.keeta_promocoes enable row level security;

create policy "keeta_promo_select_with_access"
  on public.keeta_promocoes for select
  using (public.has_unit_access(unit_id));
