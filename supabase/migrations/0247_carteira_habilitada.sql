/*
 * Quem enxerga o painel da Carteira.
 *
 * Ele estava travado em `superadminOnly` desde 28/08 porque as telas eram
 * rascunho. Agora vão ao ar — mas NÃO pra todo mundo: só parte da base é
 * agência. Uma pizzaria com duas lojas não tem gestor, nem carteira, nem
 * mensalidade a receber de ninguém; abrir sete telas vazias pra ela é pior
 * que não abrir nenhuma.
 *
 * ── POR QUE UM CAMPO, E NÃO A REGRA "É CONSULTORIA" SOZINHA ──────────────
 * O tipo do cliente diz quem PODE; este campo diz quem TEM. São perguntas
 * diferentes: nem toda consultoria cadastrada vai querer o painel no dia em
 * que for classificada como tal, e o Marcus quer escolher cliente a cliente
 * (28/08/26). Derivar a liberação do tipo faria uma edição de cadastro —
 * trocar "Restaurante" por "Consultoria" — ligar sete telas sem que ninguém
 * tenha pedido.
 *
 * A trava do tipo continua valendo, no código: o botão de liberar só aparece
 * pra quem é Consultoria. Aqui embaixo o campo é só um booleano, porque
 * regra de negócio em CHECK de coluna envelhece mal — o dia em que um
 * franqueador com 300 lojas quiser o painel, ninguém vai querer uma
 * migration pra isso.
 */
alter table public.holdings
  add column if not exists carteira_habilitada boolean not null default false;

comment on column public.holdings.carteira_habilitada is
  'Se este cliente enxerga o painel da Carteira (agencia). Liberado um a um '
  'pelo super-admin, e so pra quem e do tipo Consultoria.';
