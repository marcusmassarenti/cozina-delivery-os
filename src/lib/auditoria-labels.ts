/**
 * Rótulos das ações auditadas — em arquivo PRÓPRIO, sem `server-only`.
 *
 * `lib/data/auditoria.ts` é server-only (usa o admin client), então importar o
 * rótulo de lá num componente "use client" quebraria em runtime mesmo com o
 * typecheck passando. Texto de tela não é segredo e pode viver dos dois lados.
 */
export const ACAO_LABEL: Record<string, string> = {
  "plano.alterado": "Plano alterado",
  "cobranca.alterada": "Cobrança alterada",
  "pagamento.registrado": "Pagamento registrado",
  "pagamento.removido": "Pagamento removido",
  "cliente.criado": "Cliente criado",
  "cliente.removido": "Cliente removido",
  "conta_interna.alterada": "Conta interna alterada",
  "convite_asaas.alterado": "Convite Asaas",
  "assinatura.valor_sincronizado": "Valor da assinatura atualizado",
  "trial.iniciado": "Teste grátis iniciado (1º acesso)",
  "nino.degustacao_alterada": "Degustação do Nino",
}
