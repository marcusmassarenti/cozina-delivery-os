"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Archive, ArchiveRestore } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { encerrarCliente, reabrirCliente } from "../_actions"

/** 2026-09-14 → 14/09/2026 (a coluna pode vir com hora). */
function fmtData(iso: string): string {
  return iso.slice(0, 10).split("-").reverse().join("/")
}

/**
 * Botão da barra de ações da ficha: "Encerrar cliente" ou "Reabrir".
 *
 * Encerrar NÃO avisa ninguém (decisão do Marcus) — o diálogo diz isso com
 * todas as letras, junto com tudo o que muda, pra ninguém clicar achando que
 * é só "arquivar da lista".
 */
export function EncerrarClienteBotao({
  holdingId,
  holdingName,
  encerradoEm,
  temAssinaturaAsaas,
  parceladoAnual,
  faturasAbertas,
  onChanged,
}: {
  holdingId: string
  holdingName: string
  encerradoEm: string | null
  temAssinaturaAsaas: boolean
  parceladoAnual: boolean
  faturasAbertas: number
  onChanged?: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [motivo, setMotivo] = React.useState("")
  const [cancelarAsaas, setCancelarAsaas] = React.useState(true)
  const [pending, setPending] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const encerrado = !!encerradoEm

  async function confirmar() {
    setPending(true)
    setErro(null)
    try {
      const res = encerrado
        ? await reabrirCliente(holdingId)
        : await encerrarCliente(holdingId, motivo, temAssinaturaAsaas && cancelarAsaas)
      if (res.ok) {
        setOpen(false)
        setMotivo("")
        router.refresh()
        onChanged?.()
      } else {
        setErro(res.message ?? "Não deu certo.")
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setErro(null)
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className={
              encerrado
                ? "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted"
                : "inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-200 px-2.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/30"
            }
          >
            {encerrado ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
            {encerrado ? "Reabrir cliente" : "Encerrar cliente"}
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        {encerrado ? (
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArchiveRestore className="size-5" />
              Reabrir {holdingName}?
            </DialogTitle>
            <DialogDescription>
              Ele volta para a lista de ativos e as lojas voltam a sincronizar.
              <br />
              <br />
              <strong>A cobrança não volta sozinha:</strong> faturas canceladas
              continuam canceladas e, se a assinatura do Asaas foi cancelada no
              encerramento, é preciso configurar a cobrança de novo.
            </DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                <Archive className="size-5" />
                Encerrar {holdingName}?
              </DialogTitle>
              <DialogDescription>
                O cliente sai da lista principal (fica na aba Suspensos) e dá pra
                reabrir depois.
              </DialogDescription>
            </DialogHeader>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Para de gerar fatura e sai do MRR.</li>
              <li>
                {faturasAbertas > 0 ? (
                  <>
                    <strong>
                      {faturasAbertas} fatura{faturasAbertas !== 1 ? "s" : ""} em aberto
                    </strong>{" "}
                    {faturasAbertas !== 1 ? "serão canceladas" : "será cancelada"}.
                  </>
                ) : (
                  "Não há fatura em aberto."
                )}
              </li>
              <li>Não recebe mais cobrança, novidades nem resumo semanal.</li>
              <li>As lojas param de sincronizar.</li>
              <li>
                <strong>Ninguém é avisado</strong> — nenhum e-mail ou mensagem sai.
              </li>
            </ul>
            {temAssinaturaAsaas && (
              <label className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={cancelarAsaas}
                  onChange={(e) => setCancelarAsaas(e.target.checked)}
                />
                <span>
                  Cancelar também a <strong>assinatura no Asaas</strong> (para de
                  cobrar o cartão/boleto). Sem isso o Asaas continua cobrando.
                </span>
              </label>
            )}
            {parceladoAnual && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                Este cliente está no <strong>anual em 12x</strong>: o parcelamento
                não é cancelado por aqui (parcela paga só sai com estorno, direto
                no Asaas).
              </p>
            )}
            <label className="flex flex-col gap-1 text-xs font-medium">
              Motivo
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="Ex.: sem pagamento desde agosto"
                className="rounded-md border bg-background px-2.5 py-2 text-sm font-normal"
              />
            </label>
          </>
        )}

        {erro && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
            {erro}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={encerrado ? "default" : "destructive"}
            onClick={confirmar}
            disabled={pending || (!encerrado && motivo.trim().length < 3)}
          >
            {pending ? "Salvando…" : encerrado ? "Reabrir cliente" : "Encerrar cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Faixa no topo da ficha de um cliente encerrado: desde quando e por quê. */
export function ClienteEncerradoAviso({
  encerradoEm,
  motivo,
}: {
  encerradoEm: string
  motivo: string | null
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
      <Archive className="mt-0.5 size-4 shrink-0" />
      <div>
        <b>Cliente encerrado em {fmtData(encerradoEm)}.</b>
        {motivo ? <> Motivo: {motivo}.</> : null} Não gera fatura, não recebe
        e-mails e as lojas não sincronizam.
      </div>
    </div>
  )
}
