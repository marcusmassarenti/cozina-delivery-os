-- Resposta pronta da Central de Ajuda é um autor NOVO, não "ia".
--
-- O chat deixou de ser IA-primeiro: quem responde agora é um catálogo de
-- respostas escritas, e as que dependem da conta saem do banco direto. Guardar
-- isso como autor 'ia' faria o painel rotular de "IA" uma frase que nenhum
-- modelo escreveu — e, no dia em que alguém for auditar uma resposta errada,
-- a origem estaria mentindo.
--
-- 'ia' continua permitido de propósito: o histórico que já existe não vira
-- mentira retroativa só porque o produto mudou de ideia.
alter table suporte_mensagens drop constraint if exists suporte_mensagens_autor_check;
alter table suporte_mensagens add constraint suporte_mensagens_autor_check
  check (autor in ('cliente', 'ia', 'ajuda', 'equipe'));

-- Qual pergunta do catálogo gerou a resposta. Serve pra duas coisas que texto
-- solto não resolve: saber QUAIS respostas não estão resolvendo (as que são
-- seguidas de "ainda preciso de ajuda") e reescrever essas.
alter table suporte_mensagens add column if not exists ajuda_id text;

comment on column suporte_mensagens.ajuda_id is
  'id da pergunta do catálogo (src/lib/suporte/ajuda.ts) quando autor = ajuda';
