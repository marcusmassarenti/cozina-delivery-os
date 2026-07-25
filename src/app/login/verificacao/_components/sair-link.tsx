"use client"

import { signOut } from "../../_actions"

/** Saída de emergência: quem parou nesta tela precisa conseguir sair dela. */
export function SairLink() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="underline transition-colors hover:text-foreground"
      >
        Sair e entrar com outra conta
      </button>
    </form>
  )
}
