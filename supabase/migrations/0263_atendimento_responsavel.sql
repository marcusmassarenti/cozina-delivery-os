/*
 * Atendimento com RESPONSÁVEL (Marcus, 25/09/26).
 *
 * Até aqui o atendimento só sabia a loja. A agência abria a tarefa pra um
 * gestor fazer, mas nada dizia de quem era — a lista era uma só pra todo
 * mundo, e "é de quem?" se resolvia no grupo de WhatsApp.
 *
 * O responsável é um GESTOR (tabela `gestores`, 0243), não um usuário: na DG
 * nenhum dos cinco gestores tem login, e a tarefa precisa ter dono mesmo
 * assim. Quem tiver login ligado ao gestor abre a tela já nos dele.
 *
 * O padrão vem da loja (`units.gestor_id`), mas é só o padrão: a tarefa pode
 * ir pra outro gestor, e trocar depois fica registrado no histórico.
 */

alter table public.atendimentos
  add column if not exists gestor_id uuid references public.gestores(id) on delete set null;

comment on column public.atendimentos.gestor_id is
  'Gestor responsável pela tarefa. Padrão = gestor da loja; pode ser trocado.';

create index if not exists atendimentos_gestor_idx
  on public.atendimentos (gestor_id) where resolvido_em is null;

/* Os que já existem ganham o gestor da loja — é o que a pessoa teria
   escolhido se o campo existisse quando abriu. Loja sem gestor fica sem. */
update public.atendimentos a
   set gestor_id = u.gestor_id
  from public.units u
 where u.id = a.unit_id
   and a.gestor_id is null
   and u.gestor_id is not null;
