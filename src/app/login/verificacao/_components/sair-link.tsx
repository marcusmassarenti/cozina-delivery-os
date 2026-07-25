"use client"

import { signOut } from "../../_actions"

/** Saída de emergência: quem parou nesta tela precisa conseguir sair dela. */
export function SairLink() {
  return (
    <form action={signOut} className="inline">
      <button
        type="submit"
        className="mt-1 underline transition-colors hover:text-foreground"
      >
        Sair e entrar com outra conta
      </button>
    </form>
  )
}
