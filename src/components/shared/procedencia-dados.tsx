import { AlertTriangle, Database } from "lucide-react"

import type { Procedencia } from "@/lib/data/procedencia"

/**
 * A procedência do número — na tela e, principalmente, DENTRO do arquivo.
 *
 * ── POR QUE ELE APARECE DUAS VEZES (Marcus, 22/08/26) ────────────────────
 * Um gestor mandou o relatório do mês pro cliente dele com a importação da
 * Keeta parada, e o cliente questionou o número. O aviso existia no sistema —
 * mas o arquivo viaja sozinho, e chegou lá sem ele.
 *
 * Por isso o bloco de impressão não é opcional nem decorativo: é ele que faz a
 * ressalva chegar junto com o número, na mão de quem vai perguntar. Na tela o
 * mesmo dado aparece discreto; no papel, aparece por extenso.
 */
export function ProcedenciaDados({ p }: { p: Procedencia }) {
  const usadas = p.plataformas.filter((x) => x.declarada)
  if (usadas.length === 0) return null

  return (
    <>
      {/* TELA — discreto, uma linha. Só ganha cor quando há lacuna. */}
      <div
        data-print="hide"
        className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-[11px] ${
          p.temLacuna
            ? "border-amber-300 bg-amber-50/60 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300"
            : "bg-muted/40 text-muted-foreground"
        }`}
      >
        {p.temLacuna ? (
          <AlertTriangle className="size-3.5 shrink-0" />
        ) : (
          <Database className="size-3.5 shrink-0" />
        )}
        <span className="font-medium">Dados:</span>
        {usadas.map((x) => (
          <span
            key={x.plataforma}
            className={
              x.estado === "atrasada" || x.estado === "sem-dado"
                ? "font-semibold"
                : ""
            }
          >
            {x.frase}
          </span>
        ))}
      </div>

      {/* PAPEL — a mesma informação, por extenso, no topo do que for impresso.
          `hidden` na tela e visível só no print (regra em globals.css). */}
      <div data-print="only" className="hidden">
        <p style={{ fontSize: 11, margin: "0 0 2px" }}>
          <strong>Procedência dos dados</strong> · relatório gerado em {p.geradoEm}
        </p>
        <p style={{ fontSize: 11, margin: 0 }}>{p.linha}</p>
        {p.temLacuna && (
          <p style={{ fontSize: 11, margin: "2px 0 0", fontWeight: 600 }}>
            Atenção: {p.comLacuna.map((x) => x.rotulo).join(", ")}{" "}
            {p.comLacuna.length === 1 ? "está" : "estão"} com importação em
            atraso — os totais abaixo não incluem esse período.
          </p>
        )}
      </div>
    </>
  )
}
