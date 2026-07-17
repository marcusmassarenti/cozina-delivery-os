-- Consultor IA (chat conversacional) — medição de uso e créditos comprados.
--
-- Modelo (decidido com o Marcus):
--   • Bolsa GRÁTIS por mês = 50 × lojas ativas da conta, gasta no nível da
--     HOLDING (um chat geral que enxerga a rede). Zera na virada do mês.
--   • CRÉDITOS comprados (pacote de +100) ACUMULAM, não expiram.
--   • Consumo: gasta a bolsa grátis primeiro, depois os créditos.
--
-- A função de consumo é ATÔMICA (mesma técnica do 0087): decide grátis vs
-- crédito vs bloqueado numa transação, sem corrida entre requisições.

-- Uso do mês (a bolsa grátis). `mes` no formato 'YYYY-MM'.
create table if not exists public.ia_chat_usage (
  holding_id uuid not null references public.holdings(id) on delete cascade,
  mes text not null,
  chamadas int not null default 0,
  primary key (holding_id, mes)
);

-- Saldo de créditos comprados (acumula; não zera no mês).
create table if not exists public.ia_chat_creditos (
  holding_id uuid primary key references public.holdings(id) on delete cascade,
  saldo int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.ia_chat_usage enable row level security;
alter table public.ia_chat_creditos enable row level security;
-- Sem policy: só o service_role (app no servidor) toca. anon/authenticated não.

-- Consome 1 pergunta. Devolve 'gratis' | 'credito' | NULL (bloqueado).
create or replace function public.ia_chat_consumir(
  p_holding uuid,
  p_mes text,
  p_limite_gratis int
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result text;
begin
  -- 1) Tenta a bolsa grátis: incrementa só se ainda abaixo do limite.
  --    Se a linha não existe, cria com 1. Se existe e já bateu o limite, o
  --    WHERE falha e nada é atualizado (RETURNING vem vazio) → cai pro crédito.
  insert into public.ia_chat_usage (holding_id, mes, chamadas)
  values (p_holding, p_mes, 1)
  on conflict (holding_id, mes)
  do update set chamadas = public.ia_chat_usage.chamadas + 1
    where public.ia_chat_usage.chamadas < p_limite_gratis
  returning 'gratis' into v_result;

  if v_result is not null then
    return v_result;
  end if;

  -- 2) Grátis esgotada: gasta um crédito comprado, se houver saldo.
  update public.ia_chat_creditos
  set saldo = saldo - 1, updated_at = now()
  where holding_id = p_holding and saldo > 0
  returning 'credito' into v_result;

  return v_result; -- 'credito' ou NULL (sem grátis e sem crédito → bloqueia)
end;
$$;

-- Credita um pacote comprado (chamado pelo webhook do Asaas na Fase 2).
create or replace function public.ia_chat_creditar(
  p_holding uuid,
  p_qtd int
)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.ia_chat_creditos (holding_id, saldo)
  values (p_holding, p_qtd)
  on conflict (holding_id)
  do update set saldo = public.ia_chat_creditos.saldo + p_qtd,
                updated_at = now()
  returning saldo;
$$;

-- Só o app no servidor executa; nunca anon/authenticated/public.
revoke execute on function public.ia_chat_consumir(uuid, text, int) from public, anon, authenticated;
grant execute on function public.ia_chat_consumir(uuid, text, int) to service_role;
revoke execute on function public.ia_chat_creditar(uuid, int) from public, anon, authenticated;
grant execute on function public.ia_chat_creditar(uuid, int) to service_role;
