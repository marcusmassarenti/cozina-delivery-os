/*
 * Fluxo da loja e campos da carteira — T3 e os KPIs da T1/T4.
 *
 * Vem numa migration só porque as telas compartilham os campos: a Lista de
 * Lojas (T2) agrupa por `categoria_carteira` e mostra "Checklist ok ·
 * Cardápio pendente"; o detalhe (T3) opera essas etapas; e a faixa de KPIs
 * conta "Meta Batida 30 Dias". Separar em três migrations criaria três
 * momentos em que uma tela sabe de um campo que a outra ainda não tem.
 *
 * ── AS ETAPAS SÃO CARIMBOS, NÃO BOOLEANOS ────────────────────────────────
 * `checklist_ok_em` guarda QUANDO, não SE. Booleano responde "está feito" e
 * perde "desde quando" — e a agência precisa da segunda pra saber há quanto
 * tempo uma loja está travada na etapa 2. O `null` continua significando
 * "não feito", então a leitura simples não fica mais cara.
 *
 * ── `categoria_carteira` É DERIVÁVEL, E MESMO ASSIM É COLUNA ─────────────
 * Dava pra calcular de `encaminhada_em is null`. Guardar explícito é
 * deliberado: no painel do Diego a categoria é o que ORDENA a lista de 183
 * lojas, e ordenar por expressão em 500 linhas é o padrão de performance que
 * este projeto já pagou caro. Fica com CHECK pra não virar texto livre.
 */

alter table public.units
  /* Etapas do fluxo — carimbo de quando, não booleano. */
  add column if not exists checklist_ok_em   timestamptz,
  add column if not exists cardapio_ok_em    timestamptz,
  add column if not exists encaminhada_em    timestamptz,

  /* O que o comercial prometeu ao lojista. Texto livre de propósito: no
     painel deles é "Sem promessa comercial" ou uma frase — não é número. */
  add column if not exists promessa_comercial text,

  /* Meta de faturamento em 30 dias. É o que a faixa de KPIs conta em
     "Meta Batida 30 Dias". */
  add column if not exists meta_30_dias numeric(14,2),

  add column if not exists categoria_carteira text
    default 'nova';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'units_categoria_carteira_check'
  ) then
    alter table public.units
      add constraint units_categoria_carteira_check
      check (categoria_carteira in ('nova','ativa','pausada'));
  end if;
end $$;

comment on column public.units.checklist_ok_em is
  'Quando a etapa 1 (checklist) foi concluida. null = pendente.';
comment on column public.units.cardapio_ok_em is
  'Quando a etapa 2 (cardapio) foi concluida. null = pendente.';
comment on column public.units.encaminhada_em is
  'Quando a loja foi encaminhada de Novas para Ativas. So libera com as duas '
  'etapas concluidas.';
comment on column public.units.promessa_comercial is
  'O que o comercial prometeu ao lojista na venda. Texto livre.';
comment on column public.units.meta_30_dias is
  'Meta de faturamento em 30 dias. Base do KPI "Meta Batida 30 Dias".';
comment on column public.units.categoria_carteira is
  'nova | ativa | pausada. Derivavel de encaminhada_em, guardada explicita '
  'porque e o que ORDENA a lista de lojas.';

/* A lista agrupa por categoria dentro da agência. */
create index if not exists units_categoria_idx
  on public.units (categoria_carteira);
