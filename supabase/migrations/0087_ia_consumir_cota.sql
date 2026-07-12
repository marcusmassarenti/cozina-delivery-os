-- 0087 · Segurança/custo: incremento ATÔMICO da cota diária de IA
--
-- consumirCotaIA fazia select → check → upsert (3 passos). Em cliques
-- concorrentes, os dois liam o mesmo contador e passavam — dava pra estourar
-- o limite diário e queimar tokens além da conta. Esta função faz tudo numa
-- instrução: incrementa só se ainda estiver abaixo do limite (WHERE no
-- ON CONFLICT). Retorna o novo total, ou NULL quando bloqueado.

create or replace function public.ia_consumir_cota(
  p_holding uuid,
  p_dia date,
  p_limite int
)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.ia_usage (holding_id, dia, chamadas)
  values (p_holding, p_dia, 1)
  on conflict (holding_id, dia)
  do update set chamadas = public.ia_usage.chamadas + 1
    where public.ia_usage.chamadas < p_limite
  returning chamadas;
$$;

-- Só o service_role (app no servidor) executa; nunca anon/authenticated/public.
revoke execute on function public.ia_consumir_cota(uuid, date, int) from public, anon, authenticated;
grant execute on function public.ia_consumir_cota(uuid, date, int) to service_role;
