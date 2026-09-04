"use client"

import { useState, useTransition } from "react"
import { Check, Copy, ExternalLink, Link2, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { pedirLinkAutorizacao99 } from "./_actions-link-99"

/**
 * "Gerar link de autorização" — o caminho que dispensa o Portal do Parceiro.
 *
 * O link é criado NO CLIQUE (vale 7 dias, então guardar só criaria um prazo
 * pra alguém perder) e vem em nome da Lab of Change. Quem abre precisa ser
 * super-admin da loja no 99 — está escrito na tela porque gerente comum abre
 * e não vê nada, e aí a culpa cai na integração.
 */
export function Link99Botao() {
  const [pending, start] = useTransition()
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  function gerar() {
    setErro(null)
    setCopiado(false)
    start(async () => {
      const r = await pedirLinkAutorizacao99()
      if (r.ok) setUrl(r.url)
      else {
        setUrl(null)
        setErro(r.error)
      }
    })
  }

  async function copiar() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setErro("Não consegui copiar. Selecione o link e copie na mão.")
    }
  }

  return (
    <div className="max-w-3xl rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Link2 className="size-4 text-muted-foreground" />
            Deixar o cliente autorizar sozinho
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Em vez de vincular loja por loja no portal, mande um link: o dono
            abre, vê as lojas dele e autoriza. A conexão entra aqui em segundos.
          </p>
        </div>
        <Button onClick={gerar} disabled={pending} size="sm">
          {pending ? "Gerando…" : url ? "Gerar outro" : "Gerar link"}
        </Button>
      </div>

      {url && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border bg-muted/40 px-2 py-1.5 font-mono text-[11px]"
            />
            <Button size="sm" variant="outline" onClick={copiar}>
              {copiado ? (
                <>
                  <Check className="size-3.5" /> Copiado
                </>
              ) : (
                <>
                  <Copy className="size-3.5" /> Copiar
                </>
              )}
            </Button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-accent"
            >
              <ExternalLink className="size-3.5" /> Abrir
            </a>
          </div>
          {/* As três armadilhas da doc do 99, na ordem em que mordem. */}
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li className="flex gap-1.5">
              <TriangleAlert className="mt-0.5 size-3 shrink-0 text-amber-600" />
              Quem abrir precisa ser <strong>super-admin da loja no 99</strong>.
              Gerente comum abre e não vê nada.
            </li>
            <li className="flex gap-1.5">
              <TriangleAlert className="mt-0.5 size-3 shrink-0 text-amber-600" />
              Ele vai ver <strong>todas</strong> as lojas da conta dele. Diga
              qual autorizar — clicar na errada liga a loja trocada.
            </li>
            <li className="flex gap-1.5">
              <TriangleAlert className="mt-0.5 size-3 shrink-0 text-amber-600" />
              Vale <strong>7 dias</strong>. Passou disso, gere outro: é um
              clique.
            </li>
          </ul>
        </div>
      )}

      {erro && (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {erro}
        </p>
      )}
    </div>
  )
}
