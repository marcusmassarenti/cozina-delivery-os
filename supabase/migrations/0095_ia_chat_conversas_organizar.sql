-- Consultor IA — organizar as conversas: favoritar e vincular a uma loja.
--
-- favorita  → aparece no topo (seção "Favoritas", como o "Fixado" do Claude).
-- unit_id   → a loja a que a conversa se refere. NULL = a rede/grupo (padrão).
--             on delete set null: se a loja some, a conversa vira "grupo".
-- (renomear não precisa de coluna — já existe `titulo`.)

alter table public.ia_chat_conversas
  add column if not exists favorita boolean not null default false;

alter table public.ia_chat_conversas
  add column if not exists unit_id uuid references public.units(id) on delete set null;
