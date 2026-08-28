/*
 * O resto do painel da agência — atendimentos, onboarding, comercial e o
 * financeiro DELA. Telas T5 a T8 de docs/painel-agencia-plano.md.
 *
 * ── POR QUE UMA MIGRATION SÓ ─────────────────────────────────────────────
 * As quatro telas compartilham o mesmo eixo: a agência como empresa, e não a
 * loja como operação. Separar em quatro arquivos daria a impressão de quatro
 * assuntos quando é um.
 *
 * ── O FINANCEIRO DAQUI NÃO É O FINANCEIRO QUE JÁ EXISTE ──────────────────
 * O módulo Financeiro responde "quanto sobrou pra LOJA depois das taxas da
 * plataforma". Este responde "quanto sobrou pra AGÊNCIA depois das despesas
 * dela". Mesmo nome, contabilidade diferente, e reaproveitar as tabelas de lá
 * misturaria a mensalidade que a agência cobra com a receita que a loja fez.
 * O mesmo vale pra palavra "faturamento" na tela do comercial: lá é
 * mensalidade VENDIDA, aqui é venda da loja. Nome igual, coisa diferente.
 */

-- ── T7 · quem vende ──────────────────────────────────────────────────────
/*
 * Espelha `gestores` de propósito, em vez de virar um papel dentro dela.
 *
 * São funções diferentes na mesma agência: o comercial fecha e sai de cena, o
 * gestor cuida pra sempre. A mesma pessoa pode ocupar as duas, e nesse caso
 * ela aparece nas duas listas — o que é a leitura certa, porque ela é medida
 * por dois critérios distintos. Uma tabela só com coluna `papel` obrigaria
 * toda consulta a filtrar, e a primeira que esquecesse misturaria o ranking
 * de vendas com o de carteira.
 */
create table if not exists public.vendedores (
  id         uuid primary key default gen_random_uuid(),
  holding_id uuid not null references public.holdings(id) on delete cascade,
  nome       text not null,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  unique (holding_id, nome)
);

comment on table public.vendedores is
  'Quem fecha a venda na agencia. Separado de gestores: comercial fecha e sai, '
  'gestor cuida sempre.';

alter table public.vendedores enable row level security;
revoke all on public.vendedores from anon, authenticated;

create index if not exists vendedores_holding_idx
  on public.vendedores (holding_id) where ativo;

-- ── T5 · onboarding, T7 · a venda ───────────────────────────────────────
alter table public.units
  add column if not exists vendedor_id uuid
    references public.vendedores(id) on delete set null,
  add column if not exists data_venda date,
  /* Quanto a AGÊNCIA cobra por esta loja, por mês. Não é receita da loja. */
  add column if not exists mensalidade numeric(12,2),
  add column if not exists sucesso_responsavel text,
  add column if not exists onboarding_status text
    check (onboarding_status in ('pronto', 'agendado', 'concluido')),
  add column if not exists onboarding_reuniao_em timestamptz,
  add column if not exists onboarding_link text,
  add column if not exists onboarding_observacoes text;

comment on column public.units.mensalidade is
  'Mensalidade que a AGENCIA cobra por esta loja. Nao confundir com o '
  'faturamento da loja.';
/*
 * ⚠️ ESTE CAMPO NÃO GUARDA SENHA.
 *
 * O painel de origem usava as observações pra guardar usuário e senha das
 * plataformas do cliente, e a tela aqui diz isso em letras grandes. Senha de
 * terceiro em texto livre é dado que vaza junto com qualquer select — e ela
 * abre o iFood do lojista, não este sistema. Se um dia for preciso guardar
 * acesso, vai em cofre com leitura registrada, não aqui.
 */
comment on column public.units.onboarding_observacoes is
  'Texto livre do onboarding. NAO guardar credenciais aqui.';

create index if not exists units_vendedor_idx
  on public.units (vendedor_id) where vendedor_id is not null;

-- ── T6 · atendimentos ────────────────────────────────────────────────────
create table if not exists public.atendimentos (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid not null references public.units(id) on delete cascade,
  tipo         text not null check (tipo in (
                 'cardapio', 'promocao', 'contato', 'operacao',
                 'financeiro', 'outro')),
  titulo       text not null,
  aberto_em    timestamptz not null default now(),
  aberto_por   uuid references auth.users(id) on delete set null,
  resolvido_em timestamptz,
  criado_em    timestamptz not null default now()
);

comment on table public.atendimentos is
  'Cada trabalho feito numa loja pela agencia. O historico fica em '
  'atendimento_passos e nao se edita.';

alter table public.atendimentos enable row level security;
revoke all on public.atendimentos from anon, authenticated;

/* "Quais atendimentos estão abertos nesta loja" é a pergunta de toda tela que
   mostra atendimento — a T2 conta, a T3 lista. Parcial: atendimento resolvido
   não entra nela e é a maioria com o tempo. */
create index if not exists atendimentos_abertos_idx
  on public.atendimentos (unit_id) where resolvido_em is null;
create index if not exists atendimentos_unit_idx
  on public.atendimentos (unit_id, aberto_em desc);

/*
 * O histórico é APPEND-ONLY, e isso é o ponto da tela.
 *
 * O pedido foi "deixar gravado cada passo que é feito na loja". Um passo que
 * pode ser reescrito depois não serve pra isso: quando o lojista cobra o que
 * foi feito em julho, um registro editável não é prova de nada. Sem UPDATE e
 * sem DELETE no código; errou, escreve um passo novo corrigindo.
 */
create table if not exists public.atendimento_passos (
  id             uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
  texto          text not null,
  autor          uuid references auth.users(id) on delete set null,
  autor_nome     text,
  criado_em      timestamptz not null default now()
);

comment on table public.atendimento_passos is
  'Historico append-only de um atendimento. Nao editar nem apagar: escreva um '
  'passo novo corrigindo.';

alter table public.atendimento_passos enable row level security;
revoke all on public.atendimento_passos from anon, authenticated;

create index if not exists atendimento_passos_idx
  on public.atendimento_passos (atendimento_id, criado_em);

-- ── T8 · o financeiro da agência ─────────────────────────────────────────
/*
 * A cobrança é um FATO PRÓPRIO, não uma derivação da mensalidade.
 *
 * Mesma lição do repasse do iFood: reconstruir "quanto era pra ter recebido"
 * a partir do cadastro dá um número que bate quase sempre e mente exatamente
 * nos meses que importam — o que teve desconto, o que entrou no dia 20, o que
 * o cliente não pagou. A mensalidade projeta; a cobrança registra.
 */
create table if not exists public.agencia_cobrancas (
  id          uuid primary key default gen_random_uuid(),
  holding_id  uuid not null references public.holdings(id) on delete cascade,
  unit_id     uuid references public.units(id) on delete set null,
  competencia date not null,
  valor       numeric(12,2) not null,
  vencimento  date not null,
  pago_em     date,
  observacao  text,
  criado_em   timestamptz not null default now()
);

comment on table public.agencia_cobrancas is
  'O que a agencia cobra do cliente. Fato proprio: nao se deriva da '
  'mensalidade do cadastro.';

alter table public.agencia_cobrancas enable row level security;
revoke all on public.agencia_cobrancas from anon, authenticated;

create index if not exists agencia_cobrancas_idx
  on public.agencia_cobrancas (holding_id, competencia);

create table if not exists public.agencia_despesas (
  id         uuid primary key default gen_random_uuid(),
  holding_id uuid not null references public.holdings(id) on delete cascade,
  categoria  text not null,
  descricao  text not null,
  valor      numeric(12,2) not null,
  vencimento date not null,
  pago_em    date,
  criado_em  timestamptz not null default now()
);

comment on table public.agencia_despesas is
  'Despesa da AGENCIA (folha, ferramentas, imposto). Nao e custo da loja.';

alter table public.agencia_despesas enable row level security;
revoke all on public.agencia_despesas from anon, authenticated;

create index if not exists agencia_despesas_idx
  on public.agencia_despesas (holding_id, vencimento);
