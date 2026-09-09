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
