"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, Download, ExternalLink, Loader2 } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import type { PassoConexao } from "@/lib/data/onboarding-conexao"

import { concluirPasso, marcarInicio99 } from "../../_actions"

/** Link de autorização do 99 — é do NOSSO app, igual pra todo cliente. */
const LINK_99 =
  "https://merchant.99app.com/pt-BR/manager/app-authorize?app_id=5764607791719778299&enterprise_name=Lab+of+Change+Ltda&scope=all&sign=0c55fa392114d4fb9830fd3003fcda84&time=1787088970&uid=646635983585588890"

const LINK_CW = "https://deliveryos.food/conectar/cardapioweb"

type Copy = {
  titulo: string
  como: string
  /** O que acontece depois que ele clica — dito ANTES, não depois. */
  depois: string
  acao?: { rotulo: string; href: string; externo: boolean }
  botao: string
}

/**
 * O texto de cada passo.
 *
 * ⚠️ Cada um diz O QUE ACONTECE DEPOIS do clique, antes do clique. É a
 * diferença entre "concluí e agora?" e "concluí, sei o que esperar" — e foi
 * justamente o silêncio pós-conexão que fez o cliente achar que estava com
 * problema (Marcus, 18/08/26).
 */
const COPY: Record<PlatformId, Copy> = {
  ifood: {
    titulo: "iFood",
    como:
      "A conexão do iFood tem três mãos: você pede aqui, nós cadastramos a sua loja no portal do iFood, e aí você autoriza dentro do app de Integrações.",
    depois:
      "Ao concluir, avisamos nosso time. Quando cadastrarmos, você recebe um e-mail dizendo que chegou a sua vez de autorizar.",
    botao: "Pedir conexão com o iFood",
  },
  "99food": {
    titulo: "99 Food",
    como:
      "Abra o link, entre com o login do 99 e autorize o Delivery OS a ver os dados da sua loja.",
    depois:
      "Ao voltar e concluir, procuramos a sua loja na hora. Se acharmos, já conectamos; se houver mais de uma candidata, nosso time confirma qual é.",
    acao: { rotulo: "Autorizar no 99", href: LINK_99, externo: true },
    botao: "Já autorizei no 99",
  },
  cardapioweb: {
    titulo: "Cardápio Web",
    como:
      "Abra o link e autorize com o login de PROPRIETÁRIO da loja — outros perfis não conseguem conceder o acesso.",
    depois:
      "Ao concluir, conferimos na hora. Se a autorização tiver chegado, o histórico começa a entrar imediatamente.",
    acao: { rotulo: "Autorizar o Cardápio Web", href: LINK_CW, externo: true },
    botao: "Já autorizei",
  },
  keeta: {
    titulo: "Keeta",
    como:
      "A Keeta ainda não tem integração automática — o único caminho é a planilha que você exporta no portal dela.",
    depois:
      "Baixe o modelo, preencha com o relatório da Keeta e suba na tela de Importação. Não há o que conectar aqui.",
    acao: { rotulo: "Baixar modelo", href: "/importacao", externo: false },
    botao: "Entendi, vou pela planilha",
  },
}

export function EsteiraConexao({
  unitId,
  lojaCode,
  passos,
  temCnpj,
}: {
  unitId: string
  lojaCode: string
  passos: PassoConexao[]
  temCnpj: boolean
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = React.useState<string | null>(null)
  const [msg, setMsg] = React.useState<Record<string, string>>({})
  const [erro, setErro] = React.useState<Record<string, string>>({})

  async function concluir(platform: PlatformId) {
    setOcupado(platform)
    setErro((p) => ({ ...p, [platform]: "" }))
    const r = await concluirPasso(unitId, platform)
    setOcupado(null)
    if (r.ok) {
      setMsg((p) => ({ ...p, [platform]: r.mensagem ?? "Pronto!" }))
      router.refresh()
    } else {
      setErro((p) => ({ ...p, [platform]: r.erro ?? "Não deu." }))
    }
  }

  const feitos = passos.filter(
    (p) => p.etapa === "conectada" || p.etapa === "cliente_concluiu",
  ).length

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">
            {feitos} de {passos.length}{" "}
            {passos.length === 1 ? "plataforma" : "plataformas"}
          </p>
          {feitos === passos.length && (
            <a
              href="/inicio"
              className="text-xs font-semibold text-primary hover:underline"
            >
              Ir para o painel →
            </a>
          )}
        </div>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="bg-emerald-500 transition-all"
            style={{
              width: `${passos.length ? (feitos / passos.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {passos.map((p) => {
        const c = COPY[p.platform]
        const pronto = p.etapa === "conectada"
        const aguardando = p.etapa === "cliente_concluiu"
        const bloqueadoSemCnpj = p.platform === "ifood" && !temCnpj

        return (
          <div key={p.platform} className="rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <PlatformLogo platform={p.platform} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold">{c.titulo}</h2>
                  {pronto && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                      <Check className="size-3" />
                      conectada
                    </span>
                  )}
                  {aguardando && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-400">
                      com a gente
                    </span>
                  )}
                </div>

                <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
                  {pronto ? "Está tudo certo por aqui." : c.como}
                </p>

                {!pronto && (
                  <p className="mt-1.5 max-w-[70ch] text-[12px] leading-relaxed text-muted-foreground/80">
                    {c.depois}
                  </p>
                )}

                {bloqueadoSemCnpj && (
                  <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                    Falta o CNPJ desta loja no cadastro — é ele que o iFood usa
                    pra liberar o acesso.
                  </p>
                )}

                {!pronto && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {c.acao && (
                      <a
                        href={c.acao.href}
                        target={c.acao.externo ? "_blank" : undefined}
                        rel={c.acao.externo ? "noopener noreferrer" : undefined}
                        onClick={() => {
                          // Fotografa as lojas do 99 ANTES de ele sair — é o
                          // recorte que permite achar a dele na volta.
                          if (p.platform === "99food") void marcarInicio99(unitId)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                      >
                        {c.acao.externo ? (
                          <ExternalLink className="size-3.5" />
                        ) : (
                          <Download className="size-3.5" />
                        )}
                        {c.acao.rotulo}
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={ocupado === p.platform || bloqueadoSemCnpj}
                      onClick={() => void concluir(p.platform)}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40"
                    >
                      {ocupado === p.platform && (
                        <Loader2 className="size-3.5 animate-spin" />
                      )}
                      {aguardando ? "Avisar de novo" : c.botao}
                    </button>
                  </div>
                )}

                {msg[p.platform] && (
                  <p className="mt-2 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
                    {msg[p.platform]}
                  </p>
                )}
                {erro[p.platform] && (
                  <p className="mt-2 text-[12px] font-medium text-rose-700 dark:text-rose-400">
                    {erro[p.platform]}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}

      <p className="px-1 text-[11.5px] text-muted-foreground">
        Pode sair desta tela quando quiser — ela fica em{" "}
        <b>Unidades → {lojaCode} → Conectar</b> e guarda o que já foi feito.
      </p>
    </div>
  )
}
