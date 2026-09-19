"use client"

/**
 * Leva à tela a aba que tem o campo reprovado pelo navegador.
 *
 * ── POR QUE ISSO PRECISOU EXISTIR (Marcus, 09/09/26) ─────────────────────
 * "puxo os dados e quando clico para salvar dá erro como se não tivesse dado."
 * Ele estava cadastrando a Piracicaba com tudo preenchido, e o balão
 * "Preencha este campo" apontava pro Endereço — que estava cheio.
 *
 * O campo vazio era outro: "Quem entrega" (`tipo_entrega`), obrigatório e sem
 * valor inicial, na aba OPERAÇÃO. Os painéis de aba ficam `keepMounted` e só
 * escondidos por CSS — decisão certa, tomada em 31/07/26 depois que a JK
 * perdeu as três plataformas ao salvar pela outra aba (campo desmontado não
 * vai no submit). Só que um `required` escondido bloqueia o envio E não pode
 * receber foco: o Chrome desiste de mostrar onde é e joga o balão num vizinho
 * qualquer que esteja visível.
 *
 * O resultado é o pior tipo de erro: a tela acusa um campo que está certo, e
 * o campo errado nunca aparece. Aqui a gente troca de aba e devolve o balão
 * pro campo de verdade.
 */
export function focarAbaDoCampoInvalido(
  evento: { target: EventTarget | null; preventDefault: () => void },
  setAba: (valor: string) => void,
): void {
  const alvo = evento.target as (HTMLElement & { reportValidity?: () => boolean }) | null
  const painel = alvo?.closest?.('[data-slot="tabs-content"]') as HTMLElement | null
  const aba = painel?.dataset?.aba
  // Sem aba identificada, deixa o navegador seguir com o comportamento padrão:
  // o campo pode estar visível, e aí o balão dele já está no lugar certo.
  if (!aba) return

  evento.preventDefault()
  setAba(aba)
  /* Espera o painel aparecer antes de pedir o balão. Um campo ainda escondido
   * recusaria o foco de novo, e voltaríamos ao sintoma. */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      alvo?.reportValidity?.()
      alvo?.focus?.()
    })
  })
}

/** Campos da aba "Operação". Todo o resto do cadastro fica em "Dados". */
const CAMPOS_DA_OPERACAO = new Set([
  "tipo_operacao",
  "regime_fiscal",
  "tipo_entrega",
  "data_inauguracao",
  "data_encerramento",
  "platforms",
])

/**
 * A aba do primeiro erro que o SERVIDOR devolveu — o complemento da função
 * acima, que só cobre o que o navegador reprova.
 *
 * ── POR QUE (Marcus, 19/09/26) ───────────────────────────────────────────
 * O CNPJ é a única exigência que o navegador não cobra: só o servidor. O erro
 * dele aparece na aba "Dados"; quem clicava em Criar estando em "Operação"
 * via só a frase do rodapé e nada destacado. Foi assim que o cadastro do KFC
 * Parque Shopping (DG, 18/09) "não deixava criar com o encerramento" — o
 * encerramento era só o último campo mexido.
 */
export function abaDoErroDoServidor(
  fieldErrors: Record<string, string> | undefined,
): "dados" | "operacao" | null {
  const campos = Object.keys(fieldErrors ?? {})
  if (campos.length === 0) return null
  // "Dados" primeiro: é a primeira aba, e o CNPJ (o caso real) mora nela.
  return campos.some((c) => !CAMPOS_DA_OPERACAO.has(c)) ? "dados" : "operacao"
}
