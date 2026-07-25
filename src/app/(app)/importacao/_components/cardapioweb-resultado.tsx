import Link from "next/link"
import { CheckCircle2, XCircle } from "lucide-react"

/**
 * Mostra o desfecho da autorização OAuth do Cardápio Web.
 *
 * O callback devolve o resultado na query (?cw=ok|erro), mas até então nada
 * lia isso: a pessoa autorizava no portal, voltava pra cá e não via NADA —
 * nem sucesso, nem o motivo da falha. Autorização é justamente o momento em
 * que se precisa saber se deu certo.
 */

/** Motivos técnicos do callback → explicação e o que fazer. */
const MOTIVOS: Record<string, { titulo: string; acao: string }> = {
  access_denied: {
    titulo: "A autorização foi recusada no portal do Cardápio Web.",
    acao: "Só o perfil Proprietário da loja consegue autorizar. Confira com qual usuário você entrou no portal deles.",
  },
  callback_incompleto: {
    titulo: "O Cardápio Web não devolveu o código de autorização.",
    acao: "Tente conectar de novo. Se repetir, é falha do lado deles.",
  },
  state_invalido: {
    titulo: "A sessão de conexão não foi reconhecida.",
    acao: "Isso acontece se você abriu o portal em outro navegador. Comece de novo pelo botão Conectar.",
  },
  state_expirado: {
    titulo: "A autorização demorou mais de 10 minutos.",
    acao: "Por segurança, o pedido expira. É só conectar de novo e autorizar em seguida.",
  },
  troca_token: {
    titulo: "O Cardápio Web recusou a troca do código pelo acesso.",
    acao: "Normalmente é a URL de retorno cadastrada no app, que precisa bater exatamente com a nossa.",
  },
  criar_instalacao: {
    titulo: "Não foi possível registrar a conexão aqui do nosso lado.",
    acao: "Tente de novo. Se persistir, o erro está no nosso banco de dados.",
  },
  guardar_token: {
    titulo: "A conexão foi autorizada, mas não conseguimos guardar o acesso.",
    acao: "Conecte de novo. Nada foi perdido no Cardápio Web.",
  },
  merchant_indisponivel: {
    titulo: "Autorizamos, mas o Cardápio Web não informou qual loja foi conectada.",
    acao: "A conexão existe. Tente sincronizar — se falhar, conecte de novo.",
  },
}

export function CardapiowebResultado({
  cw,
  loja,
  motivo,
  detalhe,
}: {
  cw?: string
  loja?: string
  motivo?: string
  /** Código/descrição vinda do Cardápio Web — ajuda a diagnosticar. */
  detalhe?: string
}) {
  if (cw !== "ok" && cw !== "erro") return null

  if (cw === "ok") {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-emerald-300 bg-emerald-50/70 px-4 py-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/25">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0">
          <p className="font-semibold text-emerald-800 dark:text-emerald-300">
            Loja conectada ao Cardápio Web
            {loja ? `: ${loja}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-emerald-800/80 dark:text-emerald-400/80">
            O histórico entra em lotes.{" "}
            <Link href="/integracao/cardapioweb" className="underline">
              Abrir a integração e sincronizar
            </Link>
            .
          </p>
        </div>
      </div>
    )
  }

  const m = motivo ? MOTIVOS[motivo] : undefined
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-rose-300 bg-rose-50/70 px-4 py-3 text-sm dark:border-rose-900/50 dark:bg-rose-950/25">
      <XCircle className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
      <div className="min-w-0">
        <p className="font-semibold text-rose-800 dark:text-rose-300">
          {m?.titulo ?? "Não foi possível conectar a loja do Cardápio Web."}
        </p>
        <p className="mt-0.5 text-xs text-rose-800/80 dark:text-rose-400/80">
          {m?.acao ??
            "Tente conectar de novo pela tela de integração do Cardápio Web."}
        </p>
        {(detalhe || (motivo && !m)) && (
          <p className="mt-1 font-mono text-[11px] text-rose-800/70 dark:text-rose-400/70">
            {[motivo && !m ? `código: ${motivo}` : null, detalhe]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
    </div>
  )
}
