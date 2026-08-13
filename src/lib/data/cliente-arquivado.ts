/**
 * "Este cliente ainda pede atenção?" — a régua de ARQUIVADO, num lugar só.
 *
 * Arquivado = relação encerrada. Duas portas: acesso cortado (suspenso), ou
 * teste que venceu sem a pessoa nunca ter cadastrado loja — ela abriu a conta
 * e não voltou. São situações diferentes (cliente perdido × cadastro que não
 * virou cliente), mas nenhuma das duas pede ação hoje, que é o critério pra
 * estar na tela principal.
 *
 * ⚠️ MORA AQUI porque agora são DUAS telas perguntando o mesmo: Clientes e
 * Conexões de API. Enquanto a regra vivia dentro do componente de Clientes,
 * a segunda tela ia recebendo uma cópia — e neste projeto regra duplicada já
 * divergiu na prática mais de uma vez (as cinco definições de "margem", os
 * quatro RPCs que esqueceram o filtro de canal próprio).
 *
 * Sem `server-only`: as duas telas que usam isto são componentes de cliente.
 */

/** Hoje em Brasília, "YYYY-MM-DD". O corte do trial é por DIA, não por hora. */
function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export type SinaisDeArquivo = {
  billingStatus: string | null
  trialEndsAt: string | null
  /** Lojas ATIVAS. Zero + trial vencido = cadastro que nunca virou cliente. */
  activeUnits: number
}

export function ehClienteArquivado(c: SinaisDeArquivo): boolean {
  if (c.billingStatus === "suspended") return true
  return (
    c.trialEndsAt !== null && c.trialEndsAt < hojeISO() && c.activeUnits === 0
  )
}
