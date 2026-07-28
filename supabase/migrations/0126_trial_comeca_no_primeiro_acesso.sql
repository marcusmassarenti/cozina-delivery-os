-- O teste grátis passa a contar do PRIMEIRO ACESSO, não do cadastro.
--
-- Motivo concreto: um cliente se cadastrou, não confirmou o e-mail e nunca
-- entrou. O prazo dele correu assim mesmo — quando (e se) entrasse, ia
-- encontrar um teste pela metade e a impressão de sistema que já está
-- acabando. Quem nunca viu uma tela não pode estar gastando o teste.
--
-- `trial_ends_at` continua sendo a data de fim, e continua preenchida no
-- cadastro como padrão de segurança: se a pessoa nunca entrar, o prazo vence
-- sozinho e ela não fica em teste eterno.

alter table public.holdings
  add column if not exists trial_iniciado_em timestamptz;

comment on column public.holdings.trial_iniciado_em is
  'Quando o teste começou a valer de fato (primeiro acesso autenticado). NULL = ainda não entrou, e o prazo será recontado quando entrar.';

-- Backfill: quem já entrou alguma vez, ou já é pagante, tem o teste como
-- iniciado no cadastro — nada muda pra eles. Fica NULL só pra conta que
-- nunca teve um login, que é exatamente o caso que esta mudança conserta.
update public.holdings h
   set trial_iniciado_em = h.created_at
 where h.trial_iniciado_em is null
   and (
     h.paid = true
     or exists (
       select 1
         from public.user_unit_access a
         join auth.users u on u.id = a.user_id
        where u.last_sign_in_at is not null
          and (
            (a.scope_type::text = 'holding' and a.scope_id = h.id)
            or (a.scope_type::text = 'brand'
                and a.scope_id in (select b.id from public.brands b where b.holding_id = h.id))
            or (a.scope_type::text = 'unit'
                and a.scope_id in (
                  select un.id from public.units un
                    join public.brands b on b.id = un.brand_id
                   where b.holding_id = h.id))
          )
     )
   );
