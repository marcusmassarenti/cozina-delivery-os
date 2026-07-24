"use client"

import * as React from "react"
import {
  Check,
  CheckCircle2,
  FileWarning,
  RefreshCw,
  ShieldAlert,
  Star,
  XCircle,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PlatformLogo } from "@/components/platform-logo"

/** Espelha o retorno de /api/integracao/ifood-sync-run (syncIfoodAll). */
type ReconLine = {
  competencia: string
  ok?: boolean
  status?: number
  rowCount?: number
  persisted?: number
  substituido?: boolean
  /** Linhas da competência que já existiam (0 = período novo). */
  jaExistia?: number
  /** Variação líquida de linhas vs a sync anterior (persisted − jaExistia). */
  novas?: number
  skipped?: string
  error?: string
}

const MES_CURTO = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
]

/** "2026-06" → "jun/26". */
function fmtMesCurto(comp: string): string {
  const m = comp.match(/^(\d{4})-(\d{2})$/)
  if (!m) return comp
  return `${MES_CURTO[Number(m[2]) - 1] ?? m[2]}/${m[1].slice(2)}`
}

/** Rótulo do que entrou numa competência: "novo", "+N", "atualizado". */
function deltaLabel(r: ReconLine): string {
  if ((r.jaExistia ?? 0) === 0) return "novo"
  const novas = r.novas ?? 0
  return novas > 0 ? `+${novas.toLocaleString("pt-BR")}` : "atualizado"
}
type UnitResult = {
  unitCode: string
  unitName?: string
  merchantId: string
  primeiraSincronizacao?: boolean
  reconciliation?: ReconLine[]
}
type SyncRunResult = {
  ok: boolean
  unitsProcessed?: number
  results?: UnitResult[]
  /** Lojas do usuário com iFood ativo mas SEM vínculo com a API — não
   *  entram no sync; o dialog explica em vez de parecer que "faltou". */
  semVinculo?: string[]
  /** Auto-vínculo por CNPJ: lojas recém-conectadas e histórico puxado. */
  autoLink?: {
    vinculadas?: { unitCode: string; unitName: string }[]
    backfill?: { unitCode: string; unitName: string; linhas: number; meses: number }[]
  } | null
  error?: string
}

/** Espelha o retorno de /api/integracao/ifood-review-sync-run. */
type ReviewUnitResult = {
  unitId: string
  unitCode: string
  unitName: string
  merchantId: string
  ok: boolean
  gravadas: number
  puladas: number
  status?: number
  motivo?: string
}
type ReviewRunResult = {
  ok: boolean
  lojasProcessadas?: number
  totalGravadas?: number
  homologacao?: boolean
  flagRaw?: string
  temCredenciais?: boolean
  appClientId?: string
  resultados?: ReviewUnitResult[]
  error?: string
}

/** Categoria derivada do resultado de cada loja. */
type Bucket = "online" | "manual" | "erro"

type StoreVerdict = {
  code: string
  name: string
  bucket: Bucket
  persisted: number
  months: string[]
  detail: string
  /** Estreia da loja na integração — destaca "nova loja conectada". */
  nova?: boolean
}

/** Decide se a loja puxou online, é só manual (sem arquivo) ou deu erro. */
function classify(u: UnitResult): StoreVerdict {
  const recon = u.reconciliation ?? []
  const persisted = recon.reduce((s, r) => s + (r.persisted ?? 0), 0)
  const okLines = recon.filter((r) => r.ok && (r.rowCount ?? 0) > 0)
  const okMonths = okLines.map((r) => r.competencia)
  const errs = recon.filter((r) => r.error)
  // "No reconciliation file" / 404 = o iFood não gera o arquivo de conciliação
  // externa pra esse merchant → segue por importação manual.
  const semArquivo =
    errs.length > 0 &&
    errs.every(
      (r) =>
        r.status === 404 ||
        (r.error ?? "").toLowerCase().includes("no reconciliation file") ||
        (r.error ?? "").includes("404"),
    )

  const name = u.unitName ?? u.unitCode

  if (persisted > 0) {
    return {
      code: u.unitCode,
      name,
      bucket: "online",
      persisted,
      nova: u.primeiraSincronizacao,
      months: okMonths,
      // Por competência: "jun/26: 7.650 (+51) · mai/26: 6.040 (atualizado)".
      detail: okLines
        .map(
          (r) =>
            `${fmtMesCurto(r.competencia)}: ${(r.persisted ?? 0).toLocaleString("pt-BR")} (${deltaLabel(r)})`,
        )
        .join(" · "),
    }
  }
  if (semArquivo) {
    return {
      code: u.unitCode,
      name,
      bucket: "manual",
      persisted: 0,
      months: [],
      detail: "iFood não gera conciliação via API — segue por planilha",
    }
  }
  // Erro real (rede, parse, etc.) ou nada gravado.
  const firstErr = errs[0]?.error
  return {
    code: u.unitCode,
    name,
    bucket: "erro",
    persisted: 0,
    months: [],
    detail: firstErr ?? "Sem dados gravados",
  }
}

export function SyncIfoodButton() {
  const [pending, setPending] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [result, setResult] = React.useState<SyncRunResult | null>(null)
  const [review, setReview] = React.useState<ReviewRunResult | null>(null)

  async function runFinanceiro(): Promise<SyncRunResult> {
    try {
      const r = await fetch("/api/integracao/ifood-sync-run", { method: "POST" })
      // Timeout/erro de servidor vem como texto (ex.: "A server error has
      // occurred"), não JSON — então nunca chamamos r.json() cru (dava
      // "Unexpected token 'A'..." na cara do usuário).
      const txt = await r.text()
      try {
        return JSON.parse(txt) as SyncRunResult
      } catch {
        return {
          ok: false,
          error:
            r.status === 504 || r.status === 500 || /server error|timeout/i.test(txt)
              ? "A sincronização demorou mais que o previsto e foi interrompida. O que já sincronizou está salvo — tente de novo em instantes."
              : `Não foi possível concluir a sincronização (erro ${r.status}). Tente de novo.`,
        }
      }
    } catch {
      return {
        ok: false,
        error:
          "Não foi possível concluir a sincronização. Verifique a conexão e tente de novo.",
      }
    }
  }

  async function runAvaliacoes(): Promise<ReviewRunResult> {
    try {
      const r = await fetch("/api/integracao/ifood-review-sync-run", {
        method: "POST",
      })
      const txt = await r.text()
      try {
        return JSON.parse(txt) as ReviewRunResult
      } catch {
        return {
          ok: false,
          error:
            r.status === 504 || r.status === 500
              ? "As avaliações demoraram mais que o previsto e foram interrompidas. O que sincronizou está salvo — tente de novo."
              : `Não foi possível sincronizar as avaliações (erro ${r.status}). Tente de novo.`,
        }
      }
    } catch {
      return { ok: false, error: "Falha de conexão nas avaliações. Tente de novo." }
    }
  }

  async function run() {
    setPending(true)
    setResult(null)
    setReview(null)
    // Financeiro e avaliações são dois apps/pipelines independentes — rodam em
    // paralelo, cada um cai na sua seção do popup. Um falhar não derruba o outro.
    const [fin, rev] = await Promise.all([runFinanceiro(), runAvaliacoes()])
    setResult(fin)
    setReview(rev)
    setPending(false)
    setOpen(true)
  }

  const verdicts = (result?.results ?? []).map(classify)
  const online = verdicts.filter((v) => v.bucket === "online")
  const manual = verdicts.filter((v) => v.bucket === "manual")
  const erro = verdicts.filter((v) => v.bucket === "erro")

  // Avaliações (segundo app) — mesmos baldes do botão antigo de /avaliacoes.
  const rev = review?.resultados ?? []
  const revPuxaram = rev.filter((r) => r.ok && r.gravadas > 0)
  const revSemNovas = rev.filter((r) => r.ok && r.gravadas === 0)
  const revFaltaAutorizar = rev.filter((r) => !r.ok && r.status === 403)
  const revComErro = rev.filter((r) => !r.ok && r.status !== 403)
  const revAlertaHomolog =
    !!review?.homologacao && revPuxaram.length === 0 && rev.length > 0

  const done =
    !!result?.ok && !result?.error && !!review?.ok && !review?.error && !open

  // Resumo de período: quais competências foram sincronizadas e onde entrou
  // dado novo (período inédito OU linhas a mais vs a última sync).
  const byComp = new Map<string, { novas: number; novo: boolean }>()
  for (const u of result?.results ?? []) {
    for (const l of u.reconciliation ?? []) {
      if (!l.ok || (l.rowCount ?? 0) <= 0) continue
      const cur = byComp.get(l.competencia) ?? { novas: 0, novo: false }
      cur.novas += l.novas ?? 0
      if ((l.jaExistia ?? 0) === 0) cur.novo = true
      byComp.set(l.competencia, cur)
    }
  }
  const comps = [...byComp.keys()].sort().reverse()
  const periodoLabel = comps.map(fmtMesCurto).join(" + ")
  const novoComps = comps
    .filter((c) => byComp.get(c)!.novo || byComp.get(c)!.novas > 0)
    .map((c) => {
      const v = byComp.get(c)!
      return v.novo
        ? `${fmtMesCurto(c)} (período novo)`
        : `${fmtMesCurto(c)} (+${v.novas.toLocaleString("pt-BR")} linhas)`
    })

  return (
    <>
      {/* Pill no mesmo estilo do "Sincronizar 99" pra os dois ficarem juntos. */}
      <button
        type="button"
        disabled={pending}
        onClick={run}
        title="Sincronizar conciliação financeira do iFood agora"
        className="inline-flex items-center gap-1 rounded-full border border-current/25 px-2 py-0.5 text-[11px] font-medium opacity-70 transition hover:opacity-100 disabled:opacity-50"
      >
        {pending ? (
          <RefreshCw className="size-3 animate-spin" />
        ) : done ? (
          <Check className="size-3" />
        ) : (
          <RefreshCw className="size-3" />
        )}
        {pending
          ? "Sincronizando iFood…"
          : done
            ? "iFood sincronizado"
            : "Sincronizar iFood"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlatformLogo platform="ifood" className="size-5" />
              Sincronização iFood
            </DialogTitle>
            <DialogDescription>
              Conciliação financeira + avaliações das suas lojas iFood, numa
              rodada só.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
            {/* ===== Financeiro ===== */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <PlatformLogo platform="ifood" className="size-4" /> Financeiro
              {!result?.error && (
                <span className="font-normal">
                  · {result?.unitsProcessed ?? 0} loja(s), mês atual e anterior
                </span>
              )}
            </div>
            {result?.error ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
                {result.error}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
              {/* Loja(s) que se conectaram sozinhas nesta rodada (auto-vínculo
                  por CNPJ) — o histórico já foi puxado. */}
              {(result?.autoLink?.vinculadas?.length ?? 0) > 0 && (
                <div className="rounded-md border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 text-xs dark:border-emerald-800/50 dark:bg-emerald-950/25">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {result!.autoLink!.vinculadas!.length === 1
                      ? "🎉 1 loja nova conectada ao iFood"
                      : `🎉 ${result!.autoLink!.vinculadas!.length} lojas novas conectadas ao iFood`}
                  </p>
                  <div className="mt-1 space-y-0.5 text-muted-foreground">
                    {result!.autoLink!.vinculadas!.map((v) => {
                      const bf = result!.autoLink!.backfill?.find(
                        (b) => b.unitCode === v.unitCode,
                      )
                      return (
                        <div key={v.unitCode}>
                          <b className="text-foreground">
                            {v.unitCode} · {v.unitName}
                          </b>
                          {bf
                            ? ` — histórico puxado (${bf.meses} ${bf.meses === 1 ? "mês" : "meses"}, ${bf.linhas.toLocaleString("pt-BR")} lançamentos)`
                            : " — vinculada; histórico entra na próxima sync"}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Período sincronizado + onde entrou dado novo. */}
              {comps.length > 0 && (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                  <div>
                    <span className="font-medium text-foreground">
                      Período sincronizado:
                    </span>{" "}
                    {periodoLabel}
                  </div>
                  <div className="mt-0.5">
                    <span className="font-medium text-foreground">Dado novo:</span>{" "}
                    {novoComps.length > 0 ? (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {novoComps.join(", ")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        nenhum (refresh — o período já estava sincronizado)
                      </span>
                    )}
                  </div>
                </div>
              )}
              <Group
                tone="emerald"
                icon={<CheckCircle2 className="size-4" />}
                title="Puxaram da API"
                empty="Nenhuma loja atualizada agora"
                items={online}
              />
              <Group
                tone="amber"
                icon={<FileWarning className="size-4" />}
                title="Só manual (sem conciliação na API)"
                empty="Nenhuma"
                items={manual}
              />
              {erro.length > 0 && (
                <Group
                  tone="rose"
                  icon={<XCircle className="size-4" />}
                  title="Com erro"
                  empty=""
                  items={erro}
                />
              )}

              {/* Defasagem vs o portal — é logo depois do sync que o lojista
                  abre o portal do lado pra comparar. */}
              <p className="rounded-md border border-sky-200/60 bg-sky-50/50 px-3 py-2 text-[11px] leading-snug text-muted-foreground dark:border-sky-900/30 dark:bg-sky-950/20">
                <b className="text-foreground">Comparando com o portal?</b> O
                portal do iFood mostra as vendas <b>ao vivo</b>; a conciliação
                financeira fecha com algumas horas de defasagem — no mês em
                aberto o portal pode aparecer um pouco maior. Quando o mês
                fecha, os números batem ao centavo.
              </p>

              {/* Lojas fora do sync por não terem a integração — sem este
                  aviso o lojista acha que a sincronização "esqueceu" delas. */}
              {(result?.semVinculo?.length ?? 0) > 0 && (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {result!.semVinculo!.length === 1
                      ? "1 loja não entrou na sincronização"
                      : `${result!.semVinculo!.length} lojas não entraram na sincronização`}
                  </p>
                  <p className="mt-0.5">
                    {result!.semVinculo!.length === 1 ? "Ela" : "Elas"} ainda não{" "}
                    {result!.semVinculo!.length === 1 ? "tem" : "têm"} a
                    integração com o iFood — o financeiro dela
                    {result!.semVinculo!.length === 1 ? "" : "s"} segue via
                    importação de planilha. Pra conectar, use o botão em{" "}
                    <b>Editar unidade → iFood via API</b>.
                  </p>
                  <p className="mt-1 leading-snug">
                    {result!.semVinculo!.slice(0, 8).join(" · ")}
                    {result!.semVinculo!.length > 8
                      ? ` · +${result!.semVinculo!.length - 8}`
                      : ""}
                  </p>
                </div>
              )}
              </div>
            )}

            {/* ===== Avaliações ===== */}
            <div className="border-t pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Star className="size-4" /> Avaliações
                {!review?.error && (
                  <span className="font-normal">
                    ·{" "}
                    {review?.totalGravadas?.toLocaleString("pt-BR") ?? 0}{" "}
                    atualizada(s) em {review?.lojasProcessadas ?? 0} loja(s)
                  </span>
                )}
              </div>
              {review?.error ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
                  {review.error}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Qual app de Avaliações o servidor amarrou — deve ser e5002ff2… */}
                  {review?.appClientId && (
                    <p className="font-mono text-[11px] text-muted-foreground">
                      app de Avaliações em uso: <b>{review.appClientId}</b>
                    </p>
                  )}
                  {revAlertaHomolog && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs dark:border-amber-800/50 dark:bg-amber-950/30">
                      <p className="font-semibold text-amber-800 dark:text-amber-300">
                        App ainda em modo homologação
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        Todas as lojas voltaram 403 porque o sistema está usando
                        o app de <b>teste</b> (que só vê a loja sandbox). Isso só
                        acontece se <b>IFOOD_REVIEW_SANDBOX=true</b> estiver
                        setado na Vercel — apague essa var (ou ponha{" "}
                        <b>false</b>) e faça <b>Redeploy</b>.
                      </p>
                      <p className="mt-1.5 font-mono text-[11px] text-amber-800 dark:text-amber-300">
                        IFOOD_REVIEW_SANDBOX = <b>{review?.flagRaw ?? "?"}</b>
                        {review?.temCredenciais === false &&
                          " · credenciais do app AUSENTES"}
                      </p>
                    </div>
                  )}
                  <ReviewGroup
                    tone="emerald"
                    icon={<CheckCircle2 className="size-4" />}
                    title="Trouxeram avaliações"
                    items={revPuxaram}
                    render={(r) => `${r.gravadas.toLocaleString("pt-BR")} avaliações`}
                  />
                  {/* Etapa manual: loja que ainda não autorizou o app no portal. */}
                  {revFaltaAutorizar.length > 0 && (
                    <ReviewGroup
                      tone="amber"
                      icon={<ShieldAlert className="size-4" />}
                      title="Falta autorizar o app no portal iFood"
                      items={revFaltaAutorizar}
                      render={() => "autorize esta loja no portal e sincronize de novo"}
                    />
                  )}
                  {revSemNovas.length > 0 && (
                    <ReviewGroup
                      tone="muted"
                      icon={<Check className="size-4" />}
                      title="Sem avaliações novas"
                      items={revSemNovas}
                      render={() => "já estava em dia"}
                    />
                  )}
                  {revComErro.length > 0 && (
                    <ReviewGroup
                      tone="rose"
                      icon={<XCircle className="size-4" />}
                      title="Com erro"
                      items={revComErro}
                      render={(r) => r.motivo ?? "erro"}
                    />
                  )}
                  {rev.length === 0 && (
                    <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      Nenhuma loja com merchant iFood vinculado no seu acesso.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Group({
  tone,
  icon,
  title,
  empty,
  items,
}: {
  tone: "emerald" | "amber" | "rose"
  icon: React.ReactNode
  title: string
  empty: string
  items: StoreVerdict[]
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : "text-rose-700 dark:text-rose-400"

  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${toneCls}`}>
        {icon}
        {title}
        <span className="text-muted-foreground">({items.length})</span>
      </div>
      {items.length === 0 ? (
        empty ? (
          <p className="mt-1 pl-5 text-xs text-muted-foreground">{empty}</p>
        ) : null
      ) : (
        <ul className="mt-1.5 space-y-1">
          {items.map((v) => (
            <li
              key={v.code}
              className="rounded-md border bg-card px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="text-sm font-medium">
                  <span className="text-muted-foreground tabular-nums">
                    {v.code}
                  </span>{" "}
                  {v.name}
                </span>
                {v.nova && (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    nova loja conectada
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {v.detail}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Grupo de lojas na seção de Avaliações (mesmo layout do financeiro). */
function ReviewGroup({
  tone,
  icon,
  title,
  items,
  render,
}: {
  tone: "emerald" | "amber" | "rose" | "muted"
  icon: React.ReactNode
  title: string
  items: ReviewUnitResult[]
  render: (r: ReviewUnitResult) => string
}) {
  if (items.length === 0) return null
  const toneCls =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "rose"
          ? "text-rose-700 dark:text-rose-400"
          : "text-muted-foreground"

  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${toneCls}`}>
        {icon}
        {title}
        <span className="text-muted-foreground">({items.length})</span>
      </div>
      <ul className="mt-1.5 space-y-1">
        {items.map((r) => (
          <li key={r.unitId} className="rounded-md border bg-card px-3 py-2">
            <span className="text-sm font-medium">
              <span className="tabular-nums text-muted-foreground">
                {r.unitCode}
              </span>{" "}
              {r.unitName}
            </span>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{render(r)}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
