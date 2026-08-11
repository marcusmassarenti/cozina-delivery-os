-- Acesso SOMENTE LEITURA a uma loja específica.
--
-- Nasce de um caso real: um licenciado virou cliente com as marcas dele e quer
-- acompanhar também a loja que opera pra nós. Dar acesso à unidade resolvia a
-- visão, mas o papel no sistema é POR PESSOA — ele entraria como administrador
-- e ganharia, na loja emprestada, o direito de apagar a unidade (44 tabelas em
-- cascata), apagar importação e responder avaliação em nome dela,
-- publicamente, no iFood.
--
-- A coluna `role` já existia em cada linha de acesso e o sistema a ignorava.
-- Agora ela vale para UM valor: 'viewer' (que já estava no enum, sem uso).
--
-- ⚠️ Por que não "escopo de unidade = leitura": as 9 linhas de unidade que já
-- existem são franqueados cuidando da PRÓPRIA loja, com role='manager'. Tratar
-- escopo de unidade como leitura tiraria deles o que têm hoje. O gatilho é o
-- papel escrito na linha, não o formato do escopo.

comment on column public.user_unit_access.role is
  'admin | manager | viewer. ''viewer'' numa linha de unidade = vê a loja e não '
  'escreve NADA nela (loja compartilhada entre empresas). Os outros valores '
  'mantêm o comportamento antigo: o papel efetivo vem de profiles.perfil.';

-- Índice pra as duas perguntas que passam a ser feitas o tempo todo: "esta
-- loja é só-leitura pra mim?" e "quantas lojas emprestadas este cliente tem?"
-- (a segunda é a base da cobrança da loja compartilhada).
create index if not exists user_unit_access_viewer_idx
  on public.user_unit_access (scope_id, user_id)
  where scope_type = 'unit' and role = 'viewer';
