-- Relatório Super: guardar a aba "Próxima Avaliação", que a gente ignorava.
--
-- O arquivo tem DUAS abas e o parser lia só a primeira:
--   • "Nível Atual"       → o selo vigente, sobre uma janela FECHADA
--                           (ex.: duracao "2026-05-01 - 2026-07-31")
--   • "Próxima Avaliação" → como a loja está indo AGORA, com uma coluna `dia`
--
-- A segunda é a que permite agir: o selo é recalculado no dia 10 de cada mês
-- sobre uma janela móvel de 3 meses, então até lá dá pra corrigir. Medido no
-- primeiro arquivo lido (10/08/26): São José dos Campos com cancelamento em
-- 0,99% e Jardins em 0,97%, contra o limite de 1% — duas lojas a um centésimo
-- de perder o Nível 5. Isso só existe nessa aba.
--
-- `tipo` distingue as duas. NÃO precisa mexer na chave única
-- (unit_id, period_start, period_end): em "proxima" as duas datas recebem o
-- `dia`, então period_start = period_end e nunca colide com uma janela real.
--
-- `pedidos_concluidos` é critério do programa (mínimo 180 no trimestre) e
-- estava na planilha desde sempre, sem ser lido — a tabela só guardava
-- `total_pedidos`, que inclui cancelado.

alter table public.ifood_super_avaliacao
  add column if not exists tipo text not null default 'atual'
    check (tipo in ('atual', 'proxima')),
  add column if not exists pedidos_concluidos integer;

comment on column public.ifood_super_avaliacao.tipo is
  'atual = selo vigente (janela fechada) · proxima = parcial rumo ao próximo dia 10';
comment on column public.ifood_super_avaliacao.pedidos_concluidos is
  'Critério do Super: mínimo 180 no trimestre. Difere de total_pedidos, que conta cancelados.';

create index if not exists ifood_super_avaliacao_tipo_idx
  on public.ifood_super_avaliacao (unit_id, tipo, period_end desc);
