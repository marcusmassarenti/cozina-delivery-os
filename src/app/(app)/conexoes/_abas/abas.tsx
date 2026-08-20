import Link from "next/link"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"

/**
 * As abas de Conexões.
 *
 * ── POR QUE (Marcus, 20/08/26): "muita tela pra poder ficar trabalhando" ──
 * Eram SEIS telas pra mesma coisa — e duas se chamavam "Conexões". Quatro
 * delas nem estavam no menu: só se chegava por link de dentro de outra, o que
 * é o motivo real da sensação de bagunça — elas não tinham endereço fixo na
 * cabeça de ninguém.
 *
 * A aba mora na URL (`?aba=ifood`) de propósito: dá pra favoritar a aba que
 * você usa todo dia, o botão voltar funciona, e cada aba carrega só o seu
 * dado — com o Cardápio Web sozinho tendo 700 linhas de página, carregar tudo
 * junto faria a tela inteira esperar pela mais lenta.
 */
export type AbaId =
  | "geral"
  | "ifood"
  | "99food"
  | "cardapioweb"
  | "keeta"
  | "api"

export const ABAS: {
  id: AbaId
  label: string
  plataforma?: PlatformId
}[] = [
  { id: "geral", label: "Visão geral" },
  { id: "ifood", label: "iFood", plataforma: "ifood" },
  { id: "99food", label: "99 Food", plataforma: "99food" },
  { id: "cardapioweb", label: "Cardápio Web", plataforma: "cardapioweb" },
  { id: "keeta", label: "Keeta", plataforma: "keeta" },
  { id: "api", label: "API / ERP" },
]

export function ehAba(v: string | undefined): AbaId {
  return (ABAS.find((a) => a.id === v)?.id ?? "geral") as AbaId
}

/**
 * O badge é o ponto da tela: bater o olho e saber ONDE tem trabalho, sem
 * entrar em nada. Zero não vira "0" — vira nada, senão a fila vazia compete
 * visualmente com a que tem 15 esperando.
 */
export function Abas({
  atual,
  pendencias,
}: {
  atual: AbaId
  pendencias: Partial<Record<AbaId, number>>
}) {
  return (
    <div className="-mb-px flex flex-wrap items-center gap-1 border-b">
      {ABAS.map((a) => {
        const n = pendencias[a.id] ?? 0
        const ativa = a.id === atual
        return (
          <Link
            key={a.id}
            href={`/conexoes?aba=${a.id}`}
            aria-current={ativa ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3.5 py-2 text-sm transition-colors ${
              ativa
                ? "border-border bg-card font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            {a.plataforma && <PlatformLogo platform={a.plataforma} size="sm" />}
            {a.label}
            {n > 0 && (
              <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {n}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
