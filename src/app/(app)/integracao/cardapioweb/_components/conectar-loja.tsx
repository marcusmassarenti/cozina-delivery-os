"use client"

import * as React from "react"
import { Link2, Plug } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { gerarConviteAction, type ConviteState } from "../_actions"

export type UnidadeOpcao = { id: string; code: string; name: string }

/**
 * Porta de entrada do fluxo OAuth: manda pro /api/cardapioweb/oauth/start,
 * que gera o PKCE e redireciona pro portal do Cardápio Web.
 *
 * Navegação por `window.location` de propósito — é um redirect de página
 * inteira pra um domínio externo, não uma rota interna do app.
 */
export function ConectarLoja({
  unidades,
  redirectUri,
  mostrarAmbiente = false,
}: {
  unidades: UnidadeOpcao[]
  /** URL de retorno em uso. Visível de propósito — ver comentário no rodapé. */
  redirectUri: string | null
  /**
   * Sandbox é ferramenta de quem constrói a integração. Pro lojista o seletor
   * some e a conexão vai direto pra produção — deixá-lo à mostra convida a
   * conectar uma loja real no ambiente errado, onde o faturamento não conta.
   */
  mostrarAmbiente?: boolean
}) {
  const [ambiente, setAmbiente] = React.useState<"sandbox" | "producao">(
    mostrarAmbiente ? "sandbox" : "producao",
  )
  const [unitId, setUnitId] = React.useState<string>("")
  const [indo, setIndo] = React.useState(false)
  const [gerando, setGerando] = React.useState(false)
  const [copiado, setCopiado] = React.useState(false)
  const [convite, setConvite] = React.useState<ConviteState | null>(null)

  async function gerarConvite() {
    if (!unitId) return
    setGerando(true)
    setConvite(null)
    try {
      setConvite(await gerarConviteAction(unitId, ambiente))
    } finally {
      setGerando(false)
    }
  }

  /**
   * Manda pro DOMÍNIO CANÔNICO, sempre.
   *
   * ⚠️ Era `window.location.origin`. O painel responde em mais de um domínio
   * (delivery.cozinafoods.com é um deles) e o fluxo herdava o de onde a pessoa
   * estava — enquanto a `redirect_uri` registrada no Cardápio Web é fixa em
   * deliveryos.food. Começar num domínio e voltar em outro é pedir pra
   * autorização se perder no meio (Marcus, 18/08/26).
   *
   * Vai pela página pública `/conectar/cardapioweb` e não direto na rota de
   * API: ela cuida do login quando a sessão não veio junto na troca de
   * domínio, e devolve a pessoa pro mesmo ponto depois.
   */
  function conectar() {
    setIndo(true)
    const url = new URL("https://deliveryos.food/conectar/cardapioweb")
    url.searchParams.set("ambiente", ambiente)
    if (unitId) url.searchParams.set("unit_id", unitId)
    window.location.href = url.toString()
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Plug className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Conectar uma loja</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Você será levado ao portal do Cardápio Web para autorizar. Só o
            perfil <b>Proprietário</b> da loja consegue autorizar lá.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        {mostrarAmbiente && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Ambiente
          </label>
          <Select
            value={ambiente}
            onValueChange={(v) =>
              setAmbiente((v as "sandbox" | "producao") ?? "sandbox")
            }
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Sandbox (teste)</SelectItem>
              <SelectItem value="producao">Produção</SelectItem>
            </SelectContent>
          </Select>
        </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Vincular à unidade (opcional)
          </label>
          <Select value={unitId} onValueChange={(v) => setUnitId(v ?? "")}>
            <SelectTrigger className="h-9 w-64">
              {/* Sem a função, o Base UI mostraria o uuid da unidade. */}
              <SelectValue placeholder="Escolher depois">
                {(v) => {
                  const u = unidades.find((x) => x.id === v)
                  return u ? `#${u.code} · ${u.name}` : "Escolher depois"
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {unidades.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  #{u.code} · {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={conectar} disabled={indo} className="h-9">
          <Plug className="size-4" />
          {indo ? "Redirecionando..." : "Conectar no Cardápio Web"}
        </Button>

        {/* O botão do convite fica LADO A LADO com o de conectar, e não escondido
            atrás de um "avançado": na maioria dos nossos clientes quem opera o
            painel é a assessoria e quem autoriza é o dono da loja — duas pessoas.
            O caminho de duas pessoas é o normal, não a exceção. */}
        <Button
          variant="outline"
          onClick={gerarConvite}
          disabled={gerando || !unitId}
          className="h-9"
          title={
            unitId
              ? "Gera um link pro dono da loja autorizar sem ter conta aqui"
              : "Escolha a unidade primeiro"
          }
        >
          <Link2 className="size-4" />
          {gerando ? "Gerando..." : "Gerar link pro dono da loja"}
        </Button>
      </div>

      {convite?.url && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
            Link pronto — mande pro dono da loja
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-800/80 dark:text-emerald-400/80">
            Ele abre, entra com o login <b>do Cardápio Web</b> dele e autoriza.
            Não precisa de conta no Delivery OS. Vale até{" "}
            {convite.expiraEm
              ? new Date(convite.expiraEm).toLocaleDateString("pt-BR")
              : "7 dias"}
            .
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={convite.url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-8 flex-1 rounded border bg-background px-2 text-[11px]"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              onClick={() => {
                void navigator.clipboard.writeText(convite.url ?? "")
                setCopiado(true)
                setTimeout(() => setCopiado(false), 2000)
              }}
            >
              {copiado ? "Copiado!" : "Copiar"}
            </Button>
          </div>
        </div>
      )}
      {convite && !convite.ok && (
        <p className="mt-2 text-[11px] text-destructive">{convite.message}</p>
      )}

      {/* A URL de retorno precisa bater LETRA POR LETRA com a cadastrada no
          app. Mostrar aqui evita depender do DevTools pra saber o que estamos
          mandando — e serve de conferência na hora de falar com o suporte. */}
      {mostrarAmbiente && (
      <p className="mt-3 break-all text-[11px] text-muted-foreground">
        URL de retorno em uso:{" "}
        {redirectUri ? (
          <code className="font-mono">{redirectUri}</code>
        ) : (
          <b className="text-amber-700 dark:text-amber-400">
            não configurada (CARDAPIOWEB_REDIRECT_URI)
          </b>
        )}
      </p>
      )}

      {mostrarAmbiente && ambiente === "producao" && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          O app ainda está cadastrado apenas no <b>sandbox</b>. Produção exige
          liberação separada junto ao Cardápio Web.
        </p>
      )}
    </div>
  )
}
