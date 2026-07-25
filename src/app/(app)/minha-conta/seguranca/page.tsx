import { redirect } from "next/navigation"

import { contarDisponiveis } from "@/lib/auth/backup-codes"
import { getMfaStatus } from "@/lib/auth/mfa"
import { createClient } from "@/lib/supabase/server"

import { MfaCard } from "./_components/mfa-card"

export const metadata = { title: "Segurança — Minha conta" }

export default async function SegurancaContaPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect("/login")

  const mfa = await getMfaStatus()
  const codigosDisponiveis = mfa.ativo
    ? await contarDisponiveis(data.user.id)
    : 0

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div>
        <h2 className="text-lg font-semibold">Segurança da sua conta</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Sua conta acessa o faturamento e os repasses da operação. Vale
          proteger.
        </p>
      </div>

      <MfaCard
        ativo={mfa.ativo}
        factorId={mfa.factorId}
        email={data.user.email ?? ""}
        codigosDisponiveis={codigosDisponiveis}
      />

      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold">Boas práticas</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
          <li>
            Use uma senha exclusiva deste sistema — nunca a mesma de e-mail ou
            banco.
          </li>
          <li>
            Cada pessoa da equipe deve ter o próprio acesso. Login compartilhado
            impede saber quem fez o quê.
          </li>
          <li>
            Ao desligar alguém da equipe, remova o acesso na aba{" "}
            <b className="text-foreground">Usuários</b> no mesmo dia.
          </li>
        </ul>
      </div>
    </div>
  )
}
