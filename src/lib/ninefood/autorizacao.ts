/**
 * Link de autorização do integrador no portal do 99.
 *
 * FIXO e o mesmo pra todos os clientes — confirmado com o Marcus em
 * 06/ago/26. Apesar de carregar `sign` e `time` (que sugerem validade), o
 * link não expira, então pode ser constante em vez de gerado por chamada.
 *
 * O que o lojista faz nele: escolhe a loja → "Confirmar autorização e
 * continuar" → marca o estabelecimento → "Autorizar". Precisa estar logado no
 * portal do 99 com a conta DONA da loja.
 *
 * Mora aqui, e não no arquivo de server actions, porque um módulo
 * `"use server"` só pode exportar função async — constante quebra o build.
 *
 * ⚠️ Se o 99 girar a assinatura deste link, TODO cliente cai num erro de uma
 * vez. O sintoma é a tela de autorização recusar antes de listar a loja.
 */
export const LINK_AUTORIZACAO_99 =
  "https://merchant.99app.com/pt-BR/manager/app-authorize?app_id=5764607791719778299&enterprise_name=Lab+of+Change+Ltda&sign=24281cee57baede384f16d18f8d06f0a&time=1786144775&uid=646635983585588890"
