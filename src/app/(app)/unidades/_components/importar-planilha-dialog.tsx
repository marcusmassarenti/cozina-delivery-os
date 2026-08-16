"use client"

/**
 * Cadastro em massa: baixar a planilha, importar de volta, subir os logos.
 *
 * ── POR QUE PRÉVIA ANTES DE GRAVAR ───────────────────────────────────────
 * Importar 300 lojas é a operação com maior potencial de estrago do sistema.
 * Uma coluna deslocada e a rede inteira ganha o telefone errado. Então o fluxo
 * tem um degrau no meio de propósito: escolher o arquivo mostra o que VAI
 * acontecer (quantas criam, quantas atualizam, o que deu erro e em que linha),
 * e só depois aparece o botão que grava.
 *
 * É o mesmo princípio do resto do sistema — mostrar o número antes de agir.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ImageUp,
  Loader2,
  Upload,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  importarPlanilha,
  previaDaPlanilha,
  subirLogosEmMassa,
  type ResultadoImportacao,
  type ResultadoLogos,
} from "../_actions-planilha"
import type { PreviaImportacao } from "@/lib/unidades/planilha-leitura"

export function ImportarPlanilhaDialog() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)

  const [arquivo, setArquivo] = React.useState<File | null>(null)
  const [previa, setPrevia] = React.useState<PreviaImportacao | null>(null)
  const [lendo, setLendo] = React.useState(false)
  const [gravando, setGravando] = React.useState(false)
  const [resultado, setResultado] = React.useState<ResultadoImportacao | null>(null)

  const [logos, setLogos] = React.useState<ResultadoLogos | null>(null)
  const [subindoLogos, setSubindoLogos] = React.useState(false)

  /**
   * Quantas linhas de fato ESCREVEM algo.
   *
   * Reimportar a planilha sem editar dá "atualizar 300" no papel e zero
   * mudança no banco. Oferecer o botão nesse caso convida a um clique que não
   * faz nada — e um clique que não faz nada ensina a duvidar dos outros.
   */
  const vaiEscrever = previa
    ? previa.criar +
      previa.linhas.filter(
        (l) => l.acao === "atualizar" && l.mudancas.length > 0,
      ).length
    : 0

  const escolherArquivo = async (f: File | null) => {
    setArquivo(f)
    setPrevia(null)
    setResultado(null)
    if (!f) return
    setLendo(true)
    const fd = new FormData()
    fd.set("arquivo", f)
    setPrevia(await previaDaPlanilha(fd))
    setLendo(false)
  }

  const confirmar = async () => {
    if (!arquivo) return
    setGravando(true)
    const fd = new FormData()
    fd.set("arquivo", arquivo)
    const r = await importarPlanilha(fd)
    setResultado(r)
    setGravando(false)
    if (r.ok) router.refresh()
  }

  const enviarLogos = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setSubindoLogos(true)
    setLogos(null)
    const fd = new FormData()
    for (const f of Array.from(files)) fd.append("logos", f)
    const r = await subirLogosEmMassa(fd)
    setLogos(r)
    setSubindoLogos(false)
    if (r.ok) router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted"
          >
            <Upload className="size-3.5" />
            Importar em massa
          </button>
        }
      />
      <DialogContent className="max-h-[calc(100dvh-6rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cadastrar em massa</DialogTitle>
          <DialogDescription>
            Baixe a planilha, preencha no Excel e traga de volta. Serve pra
            cadastrar lojas novas e pra completar as que já existem.
          </DialogDescription>
        </DialogHeader>

        {/* ── 1. Baixar ────────────────────────────────────────────────── */}
        <section className="rounded-lg border p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-5 place-items-center rounded-full bg-muted text-[11px] font-bold">
              1
            </span>
            Baixe a planilha modelo
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Vem <strong className="text-foreground">vazia</strong>, com uma
            linha por loja pra preencher. A aba{" "}
            <strong className="text-foreground">LEIA-ME</strong> explica cada
            coluna, lista os valores aceitos e traz um exemplo preenchido.
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Quer <strong className="text-foreground">corrigir lojas que já existem</strong>?
            Use o botão <strong className="text-foreground">Exportar unidades</strong> na
            tela — ele traz a sua lista preenchida, e é só editar e trazer de volta.
          </p>
          <a
            href="/api/unidades/planilha?tipo=modelo"
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted"
          >
            <Download className="size-3.5" />
            Baixar modelo (.xlsx)
          </a>
        </section>

        {/* ── 2. Importar ──────────────────────────────────────────────── */}
        <section className="rounded-lg border p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-5 place-items-center rounded-full bg-muted text-[11px] font-bold">
              2
            </span>
            Traga a planilha preenchida
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            O <strong className="text-foreground">Código</strong> é a chave:
            código que já existe atualiza a loja, código novo cria. Nada é
            gravado antes de você conferir o resumo.
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Salve como <strong className="text-foreground">.xlsx</strong>.{" "}
            <strong className="text-foreground">CSV não serve</strong>: no Excel
            em português ele separa colunas por ponto e vírgula, e a coluna
            Plataformas usa ponto e vírgula por dentro (
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">ifood;99food</code>
            ) — o arquivo desalinha e grava dado trocado sem avisar.
          </p>

          <label className="mt-3 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted">
            <Upload className="size-3.5" />
            {arquivo ? arquivo.name : "Escolher arquivo .xlsx"}
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
            />
          </label>

          {lendo && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Conferindo a planilha…
            </p>
          )}

          {previa && !resultado && <Previa previa={previa} />}

          {previa &&
            !resultado &&
            previa.fatais.length === 0 &&
            vaiEscrever > 0 && (
              <button
                type="button"
                onClick={confirmar}
                disabled={gravando}
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {gravando && <Loader2 className="size-3.5 animate-spin" />}
                {gravando
                  ? "Gravando…"
                  : `Confirmar — criar ${previa.criar} e atualizar ${vaiEscrever - previa.criar}`}
              </button>
            )}

          {previa &&
            !resultado &&
            previa.fatais.length === 0 &&
            vaiEscrever === 0 &&
            previa.erros === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                Nada a fazer: a planilha está igual ao que já está cadastrado.
              </p>
            )}

          {resultado && <Resultado r={resultado} />}
        </section>

        {/* ── 3. Logos ─────────────────────────────────────────────────── */}
        <section className="rounded-lg border p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-5 place-items-center rounded-full bg-muted text-[11px] font-bold">
              3
            </span>
            Logos das lojas (opcional)
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Selecione várias imagens de uma vez.{" "}
            <strong className="text-foreground">
              O nome do arquivo tem que ser o código da loja
            </strong>{" "}
            — <code className="rounded bg-muted px-1 py-0.5 text-[11px]">01.png</code>{" "}
            vai pra unidade 01. PNG, JPG ou WEBP.
          </p>

          <label className="mt-3 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted">
            <ImageUp className="size-3.5" />
            Escolher imagens
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => enviarLogos(e.target.files)}
            />
          </label>

          {subindoLogos && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Enviando…
            </p>
          )}

          {logos && <ResultadoLogosView r={logos} />}
        </section>
      </DialogContent>
    </Dialog>
  )
}

function Previa({ previa }: { previa: PreviaImportacao }) {
  if (previa.fatais.length > 0) {
    return (
      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
        {previa.fatais.map((f) => (
          <p key={f} className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {f}
          </p>
        ))}
      </div>
    )
  }

  const comErro = previa.linhas.filter((l) => l.acao === "erro")
  // Só as que MUDAM algo: numa reimportação sem edição, dizer "atualiza 300"
  // assustaria à toa.
  const mudam = previa.linhas.filter(
    (l) => l.acao === "atualizar" && l.mudancas.length > 0,
  )
  const iguais = previa.atualizar - mudam.length

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <Selo cor="verde" n={previa.criar} texto="loja nova" />
        <Selo cor="azul" n={mudam.length} texto="loja com alteração" />
        {iguais > 0 && <Selo cor="cinza" n={iguais} texto="sem mudança" />}
        <Selo cor="vermelho" n={previa.erros} texto="com erro" />
      </div>

      {comErro.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30">
          <p className="border-b border-amber-200 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-900/40 dark:text-amber-200">
            Estas linhas ficam de fora — o resto é gravado normalmente
          </p>
          <ul className="max-h-48 overflow-y-auto px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            {comErro.slice(0, 40).map((l) => (
              <li key={l.linha} className="border-b border-amber-200/50 py-1 last:border-0">
                <strong>Linha {l.linha}</strong>
                {l.code ? ` · ${l.code}` : ""} — {l.erros.join("; ")}
              </li>
            ))}
            {comErro.length > 40 && (
              <li className="py-1 font-medium">
                + {comErro.length - 40} outras linhas com erro
              </li>
            )}
          </ul>
        </div>
      )}

      {mudam.length > 0 && (
        <details className="rounded-lg border text-xs">
          <summary className="cursor-pointer px-3 py-2 font-semibold">
            Ver o que muda nas {mudam.length} lojas existentes
          </summary>
          <ul className="max-h-48 overflow-y-auto border-t px-3 py-2 text-muted-foreground">
            {mudam.slice(0, 60).map((l) => (
              <li key={l.linha} className="border-b py-1 last:border-0">
                <strong className="text-foreground">
                  {l.code} · {l.name}
                </strong>{" "}
                — {l.mudancas.join(", ")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Resultado({ r }: { r: ResultadoImportacao }) {
  if (!r.ok) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        {r.message}
      </p>
    )
  }
  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
      <p className="flex items-center gap-2 font-semibold">
        <CheckCircle2 className="size-4" />
        {r.criadas} criada(s) · {r.atualizadas} atualizada(s)
      </p>
      {(r.falhas?.length ?? 0) > 0 && (
        <ul className="mt-2 text-xs">
          {r.falhas!.map((f) => (
            <li key={f.linha}>
              Linha {f.linha} ({f.code}): {f.erro}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ResultadoLogosView({ r }: { r: ResultadoLogos }) {
  if (!r.ok) {
    return <p className="mt-3 text-sm text-red-700 dark:text-red-300">{r.message}</p>
  }
  return (
    <div className="mt-3 space-y-2 text-xs">
      <p className="font-semibold text-emerald-700 dark:text-emerald-300">
        {r.enviados?.length ?? 0} logo(s) aplicado(s)
      </p>
      {(r.semLoja?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-semibold">
            Sem loja com esse código — renomeie e mande de novo:
          </p>
          <p className="mt-0.5">{r.semLoja!.join(", ")}</p>
        </div>
      )}
      {(r.recusados?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          <p className="font-semibold">Recusados:</p>
          <ul className="mt-0.5">
            {r.recusados!.map((f) => (
              <li key={f.arquivo}>
                {f.arquivo} — {f.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Selo({
  cor,
  n,
  texto,
}: {
  cor: "verde" | "azul" | "cinza" | "vermelho"
  n: number
  texto: string
}) {
  if (n === 0 && cor !== "verde" && cor !== "azul") return null
  const cores = {
    verde:
      "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    azul: "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
    cinza: "bg-muted text-muted-foreground",
    vermelho: "bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200",
  }[cor]
  return (
    <span className={`rounded-full px-2.5 py-1 font-semibold ${cores}`}>
      {n} {texto}
      {n === 1 ? "" : "s"}
    </span>
  )
}
