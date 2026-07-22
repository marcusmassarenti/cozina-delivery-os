import type * as React from "react"

/**
 * Mensagens de validação nativa do navegador em pt-BR.
 *
 * O balão "Please fill out this field" é do PRÓPRIO navegador (validação
 * HTML5) e sai no idioma do browser do usuário — não adianta traduzir a
 * página. A saída é interceptar no form: no `invalid` a gente troca a
 * mensagem, e no `input` limpa (senão o campo fica "inválido" pra sempre,
 * mesmo preenchido).
 *
 * Uso: `<form {...validacaoPtBr} ...>` — os handlers são *Capture, então
 * pegam qualquer campo required do form, sem mexer campo a campo.
 */
export const validacaoPtBr = {
  onInvalidCapture: (e: React.FormEvent<HTMLFormElement>) => {
    const t = e.target as HTMLInputElement
    if (typeof t.setCustomValidity !== "function") return
    if (t.validity?.valueMissing) {
      t.setCustomValidity("Preencha este campo.")
    }
  },
  onInputCapture: (e: React.FormEvent<HTMLFormElement>) => {
    const t = e.target as HTMLInputElement
    if (typeof t.setCustomValidity === "function") t.setCustomValidity("")
  },
} as const
