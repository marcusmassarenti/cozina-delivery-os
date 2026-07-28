--------------------------------------------------------------------
-- 0123_holdings_convite_asaas.sql
--
-- Destrava o cliente "pago manual" pra ele conseguir assinar no Asaas.
--
-- O problema: /assinatura redireciona quem tem status "paid" pra tela de
-- gestão. Cliente marcado como pago à mão (Pix, transferência) fica preso
-- nesse estado — não existe caminho pra ele migrar pro cartão recorrente,
-- e é justamente quem a gente MAIS quer migrar, porque hoje a cobrança
-- depende de alguém lembrar de mandar o Pix todo mês.
--
-- Com o convite preenchido, a tela deixa ele passar pro checkout. É uma
-- flag e não um parâmetro de URL porque assim fica rastreável (quando foi
-- convidado), revogável, e não depende de um link que circula por aí.
--------------------------------------------------------------------

alter table public.holdings
  add column if not exists convite_asaas_em timestamptz;

comment on column public.holdings.convite_asaas_em is
  'Quando o dono convidou este cliente a migrar a cobranca manual pro Asaas. '
  'Enquanto preenchido, a tela /assinatura deixa ele assinar mesmo estando '
  'paid=true. Limpa sozinho quando a assinatura e criada.';
