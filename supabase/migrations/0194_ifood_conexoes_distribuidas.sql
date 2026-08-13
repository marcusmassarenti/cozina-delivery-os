-- Conexões do app DISTRIBUÍDO do iFood — uma credencial por loja/rede.
--
-- POR QUE EXISTE: hoje o Delivery OS é um app CENTRALIZADO no iFood. Uma
-- credencial só enxerga todas as lojas, mas para cada loja nova ALGUÉM precisa
-- entrar no Portal do Desenvolvedor e pedir autorização por CNPJ, na mão. Com
-- 48 lojas já dói; a DG deve chegar a 300.
--
-- Pior: esse caminho tem dois passos que não controlamos. Em 13/ago/26 o
-- lojista da Tech Assessoria aprovou (e-mail do iFood às 17:47 e 18:08) e a API
-- continuou devolvendo 403 no merchant e omitindo-o da listagem 40 minutos
-- depois. Não havia o que fazer do nosso lado.
--
-- No app DISTRIBUÍDO o fluxo inverte: nós pedimos um `userCode` por API, o
-- lojista digita esse código no Portal do Parceiro DELE (ou clica no link
-- pronto), e a autorização volta pra gente como `authorization_code`. Some o
-- intermediário — e some a espera.
--
-- ⚠️ CONVIVE com o centralizado, não substitui. As 67 lojas já autorizadas
-- continuam no app atual; esta tabela é só para as que entrarem pelo caminho
-- novo. Uma loja tem UM caminho, nunca os dois.
--
-- ⚠️ WEBHOOK NÃO EXISTE NO DISTRIBUÍDO (o próprio portal avisa ao criar o app).
-- Não afeta Financeiro, Avaliações e Merchant, que são por consulta. Afeta o
-- módulo de Pedidos, que é event-driven — lá só sobraria o modo polling.
--
-- Token NUNCA em claro nesta tabela: vai pro Supabase Vault, igual ao Cardápio
-- Web (migration 0102). Aqui ficam só os IDs dos segredos.

create table if not exists public.ifood_conexoes_distribuidas (
  id             uuid primary key default gen_random_uuid(),
  holding_id     uuid not null references public.holdings(id) on delete cascade,
  /* Preenchido quando a autorização é de UMA loja. Null enquanto o lojista
     ainda não autorizou — o merchant só se conhece depois do token. */
  unit_id        uuid references public.units(id) on delete set null,
  merchant_id    text,

  /* ── Fluxo de autorização ─────────────────────────────────────────────
     `user_code` é o que o lojista digita. `code_verifier` é o par secreto
     que só nós guardamos e que o iFood exige na troca pelo token — sem ele
     a troca falha, então ele precisa sobreviver ao recarregar da página. */
  user_code            text,
  code_verifier        text,
  verification_url     text,
  /* Quando o user_code perde a validade (o iFood devolve `expiresIn`). */
  user_code_expira_em  timestamptz,

  /* ── Tokens (ponteiros pro Vault) ─────────────────────────────────── */
  access_secret_id   uuid,
  refresh_secret_id  uuid,
  token_expira_em    timestamptz,

  /* aguardando = código gerado, lojista ainda não autorizou
     ativa       = token válido em mãos
     expirada    = código venceu sem autorização
     revogada    = o iFood parou de aceitar (lojista removeu o app) */
  status         text not null default 'aguardando'
                 check (status in ('aguardando','ativa','expirada','revogada')),
  erro           text,
  criada_em      timestamptz not null default now(),
  atualizada_em  timestamptz not null default now()
);

-- Uma conexão ATIVA por loja. Parcial de propósito: tentativas antigas
-- (expiradas, revogadas) podem se acumular sem travar uma nova.
create unique index if not exists ifood_conexoes_dist_unit_ativa_idx
  on public.ifood_conexoes_distribuidas (unit_id)
  where status = 'ativa' and unit_id is not null;

create index if not exists ifood_conexoes_dist_holding_idx
  on public.ifood_conexoes_distribuidas (holding_id, status);

alter table public.ifood_conexoes_distribuidas enable row level security;
revoke all on public.ifood_conexoes_distribuidas from anon, authenticated;

comment on table public.ifood_conexoes_distribuidas is
  'Conexões do app distribuído do iFood (authorization_code por loja). Token no '
  'Vault; aqui só os IDs. Convive com o app centralizado — uma loja usa um dos '
  'dois caminhos, nunca os dois.';

-- ── Tokens no Vault ──────────────────────────────────────────────────────
create or replace function public.ifood_dist_salvar_tokens(
  p_conexao_id uuid,
  p_access     text,
  p_refresh    text,
  p_expires_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_access_id  uuid;
  v_refresh_id uuid;
begin
  select access_secret_id, refresh_secret_id
    into v_access_id, v_refresh_id
    from public.ifood_conexoes_distribuidas
   where id = p_conexao_id;

  if not found then
    raise exception 'Conexão % não encontrada', p_conexao_id;
  end if;

  if v_access_id is null then
    v_access_id := vault.create_secret(
      p_access, 'ifood_dist_access_' || p_conexao_id::text,
      'iFood distribuído · access_token');
  else
    perform vault.update_secret(v_access_id, p_access);
  end if;

  -- Só reescreve o refresh quando vier: nem toda renovação o rotaciona, e
  -- gravar null por cima cegaria a conexão na renovação seguinte.
  if p_refresh is not null then
    if v_refresh_id is null then
      v_refresh_id := vault.create_secret(
        p_refresh, 'ifood_dist_refresh_' || p_conexao_id::text,
        'iFood distribuído · refresh_token');
    else
      perform vault.update_secret(v_refresh_id, p_refresh);
    end if;
  end if;

  update public.ifood_conexoes_distribuidas
     set access_secret_id  = v_access_id,
         refresh_secret_id = coalesce(v_refresh_id, refresh_secret_id),
         token_expira_em   = p_expires_at,
         status            = 'ativa',
         erro              = null,
         -- O verifier só serve pra troca inicial. Guardá-lo depois disso é
         -- manter um segredo sem uso — apaga.
         code_verifier     = null,
         atualizada_em     = now()
   where id = p_conexao_id;
end;
$$;

create or replace function public.ifood_dist_ler_tokens(p_conexao_id uuid)
returns table (
  access_token  text,
  refresh_token text,
  expires_at    timestamptz
)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  return query
  select
    (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.access_secret_id),
    (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.refresh_secret_id),
    c.token_expira_em
  from public.ifood_conexoes_distribuidas c
  where c.id = p_conexao_id;
end;
$$;

-- Fail-closed: estas leem segredo em claro. Só o service_role chama.
revoke execute on function public.ifood_dist_salvar_tokens(uuid, text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.ifood_dist_ler_tokens(uuid)
  from public, anon, authenticated;
