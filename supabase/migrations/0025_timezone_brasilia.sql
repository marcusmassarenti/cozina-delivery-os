--------------------------------------------------------------------
-- 0025_timezone_brasilia.sql
-- Coloca o relógio do banco em horário de Brasília (America/Sao_Paulo).
--
-- IMPORTANTE: colunas timestamptz CONTINUAM armazenadas em UTC — isso é o
-- correto e NÃO muda. Isto só altera a EXIBIÇÃO e as funções de "agora":
--   now(), current_date, current_timestamp, cast de timestamptz -> text/date.
-- Antes: às 21h de Brasília o banco já dizia "amanhã" (UTC). Agora bate com
-- o horário do Brasil.
--
-- Vale só pra CONEXÕES NOVAS. Se quiser efeito imediato em tudo, reinicie o
-- projeto (Settings -> General -> Restart) depois de aplicar. O pool vai
-- reciclando as conexões antigas naturalmente de qualquer forma.
--
-- OBS: a matemática de "hoje/ontem" do app roda no Next.js (Vercel = UTC).
-- Isso é resolvido em paralelo com a env var TZ=America/Sao_Paulo na Vercel.
--------------------------------------------------------------------

-- Padrão do banco inteiro.
alter database postgres set timezone to 'America/Sao_Paulo';

-- Garante o mesmo fuso nas roles que a API (PostgREST) usa.
alter role authenticator set timezone to 'America/Sao_Paulo';
alter role anon set timezone to 'America/Sao_Paulo';
alter role authenticated set timezone to 'America/Sao_Paulo';
alter role service_role set timezone to 'America/Sao_Paulo';
