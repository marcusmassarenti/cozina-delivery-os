import Link from "next/link"
import { notFound } from "next/navigation"
import { FileSignature, FileText } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import { listarClientes, listarPropostas } from "@/lib/data/propostas"

import { NovaPropostaBotao } from "./_components/nova-proposta"

export const metadata = { title: "Propostas — Delivery OS" }

const SELO: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  enviada: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400",
  assinada:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  recusada: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
  cancelada: "bg-muted text-muted-foreground line-through",
}

function brl(v: number): string {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

/**
 * Fila de propostas comerciais. Só quem é da plataforma.
 *
 * A proposta nasce do CADASTRO: escolhe-se o cliente e razão social, CNPJ,
 * endereço, plano, lojas ativas e valor já vêm preenchidos. O que sobra pro
 * humano é o que é decisão — desconto, setup, validade.
 */
export default async function PropostasPage() {
  if (!(await isSuperadmin())) notFound()

  const [propostas, clientes] = await Promise.all([
    listarPropostas(),
    listarClientes(),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileSignature className="size-5 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight">Propostas</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            O documento que o cliente assina. Os dados vêm do cadastro dele — as
            cláusulas jurídicas ficam em{" "}
            <Link href="/contrato" className="underline underline-offset-2">
              /contrato
            </Link>
            , que a proposta apenas referencia.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/propostas/modelo"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted"
            title="Editar os textos padrão que entram em toda proposta"
          >
            <FileText className="size-3.5" />
            Modelo
          </Link>
          <NovaPropostaBotao clientes={clientes} />
        </div>
      </div>

      {propostas.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">Nenhuma proposta ainda.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Escolha um cliente em &quot;Nova proposta&quot; — o resto vem
            preenchido.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">Nº</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Plano</th>
                <th className="px-4 py-2.5 text-right">Mensal</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Criada</th>
              </tr>
            </thead>
            <tbody>
              {propostas.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/propostas/${p.id}`}
                      className="font-mono font-semibold tabular-nums text-primary hover:underline"
                    >
                      {p.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{p.holdingNome}</span>
                    {p.dados?.razaoSocial &&
                      p.dados.razaoSocial !== p.holdingNome && (
                        <span className="block text-[11px] text-muted-foreground">
                          {p.dados.razaoSocial}
                        </span>
                      )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {p.dados?.planoLabel ?? "—"}
                    <span className="text-[11px]">
                      {" "}
                      · {p.dados?.lojas ?? 0}{" "}
                      {p.dados?.lojas === 1 ? "loja" : "lojas"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {brl(p.dados?.totalMensal ?? 0)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SELO[p.status] ?? SELO.rascunho}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {new Date(p.criadaEm).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
