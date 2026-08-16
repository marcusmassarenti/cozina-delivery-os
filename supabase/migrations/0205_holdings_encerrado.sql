-- Cliente ENCERRADO: saiu de vez, para de puxar dado na hora.
--
-- ── POR QUE NÃO BASTAVA O QUE JÁ EXISTIA ─────────────────────────────────
-- Já havia uma regra de corte por cobrança (src/lib/data/unidades-sem-assinatura.ts):
-- suspenso há 7+ dias sai do sync. Os 7 dias são decisão do Marcus (12/ago/26)
-- e continuam valendo — são a folga pra quem só deixou o cartão vencer, e
-- evitam buraco no histórico de quem regulariza.
--
-- Mas "não pagou ainda" e "não vai seguir" são coisas diferentes. Quando o
-- cliente avisa que saiu, esperar uma semana é queimar chamada de API das
-- plataformas e execução na Vercel por dado que ninguém vai olhar. Foi o caso
-- do joao nilson (Cardápio Web) em 16/ago/26: trial venceu em 10/08, ele não
-- seguiu, e o sync continuaria batendo na API deles até 18/08.
--
-- ── O QUE ESTA COLUNA FAZ ────────────────────────────────────────────────
-- `encerrado_em` preenchido = todas as lojas do cliente saem do sync
-- IMEDIATAMENTE, sem tolerância. Nada é apagado: o histórico continua no banco
-- e a tela continua abrindo. O que para é ir buscar dado novo.
--
-- É data, e não booleano, porque a pergunta que sempre aparece depois é
-- "quando foi que ele saiu?" — pra medir churn e pra saber até onde o dado
-- daquele cliente é confiável.
alter table public.holdings
  add column if not exists encerrado_em   date,
  add column if not exists encerrado_motivo text;

comment on column public.holdings.encerrado_em is
  'Cliente encerrou: para o sync na hora (sem os 7 dias de tolerância da suspensão por cobrança). Não apaga nada.';

-- Índice parcial: a leitura é sempre "quem está encerrado?", e encerrado é a
-- minoria. Sem ele seria seq scan na tabela inteira a cada rodada de cron.
create index if not exists holdings_encerrado_idx
  on public.holdings (encerrado_em)
  where encerrado_em is not null;
