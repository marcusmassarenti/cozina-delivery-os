--------------------------------------------------------------------
-- 0033_reclass_e_embalagem.sql
-- Ajustes pra fechar a diferença com a planilha de conferência do JK:
--  1) SANDUBA + COMBO saem de "Vinagrete" (sanduíche não leva pote).
--  2) "Pedaço de Milho" sai de "Não considerar" (passa a contar, R$ 6,30).
--  3) Embalagem/insumos que NÃO vêm no relatório de produtos:
--       Lacre e Grampo = por pote (nº de potes = qtd da categoria Vinagrete)
--       Durex e Bobina = quantidade fixa da semana.
--------------------------------------------------------------------

-- helper inline: id do JK
-- (usado nos updates/inserts abaixo via subselect)

-- 1) SANDUBA (5031..5036) + COMBO (436) → Não considerar
update public.unit_produto_precos
set categoria = 'Não considerar', considerar = false, preco = 0,
    updated_at = now()
where unit_id = (select id from public.units where upper(trim(name)) = 'JK' limit 1)
  and codigo in ('5031', '5032', '5033', '5034', '5035', '5036', '436');

-- 2) Pedaço de Milho (469) → categoria "Milho", R$ 6,30, considerar
update public.unit_produto_precos
set categoria = 'Milho', considerar = true, preco = 6.30,
    updated_at = now()
where unit_id = (select id from public.units where upper(trim(name)) = 'JK' limit 1)
  and codigo = '469';

-- 3) Embalagem / insumos extras
create table if not exists public.unit_embalagem (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units(id) on delete cascade,
  nome        text not null,
  preco       numeric not null default 0,
  por_pote    boolean not null default false, -- true: qtd = nº de potes (auto)
  qtd_fixa    numeric not null default 0,     -- usado quando por_pote = false
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (unit_id, nome)
);

comment on table public.unit_embalagem is
  'Insumos de embalagem do fechamento (lacre/grampo por pote; durex/bobina fixos).';

alter table public.unit_embalagem enable row level security;

drop policy if exists unit_embalagem_select on public.unit_embalagem;
create policy unit_embalagem_select
  on public.unit_embalagem for select
  using (has_unit_access(unit_id));

create or replace function public.touch_unit_embalagem()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists unit_embalagem_touch on public.unit_embalagem;
create trigger unit_embalagem_touch
  before update on public.unit_embalagem
  for each row execute function public.touch_unit_embalagem();

-- seed dos insumos do JK (preços da foto)
insert into public.unit_embalagem (unit_id, nome, preco, por_pote, qtd_fixa, sort_order)
select u.id, v.nome, v.preco, v.por_pote, v.qtd_fixa, v.sort_order
from (
  select id from public.units where upper(trim(name)) = 'JK' limit 1
) u
cross join (values
  ('Lacre pote', 0.05,   true,  0, 1),
  ('Grampo',     0.0018, true,  0, 2),
  ('Durex',      3.15,   false, 2, 3),
  ('Bobina',     8.44,   false, 2, 4)
) as v(nome, preco, por_pote, qtd_fixa, sort_order)
on conflict (unit_id, nome) do nothing;
