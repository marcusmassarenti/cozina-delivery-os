"use client"

import Link from "next/link"
import { useEffect } from "react"
import { ArrowLeft, ShieldAlert } from "lucide-react"

/**
 * Error boundary da rota /administracao/usuarios.
 * Captura especialmente o ForbiddenError do requireAdmin pra mostrar
 * uma tela amigável de "acesso restrito" em vez do overlay vermelho do Next.
 */
export default function UsuariosError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log opcional pra observabilidade futura
    console.error("usuarios error:", error)
  }, [error])

  const isForbidden =
    error.name === "ForbiddenError" ||
    error.message?.includes("administradores")
  const isAuth =
    error.name === "AuthError" || error.message?.includes("Sessão")

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          <ShieldAlert className="size-6" />
        </div>
        <h2 className="text-lg font-semibold">
          {isForbidden
            ? "Acesso restrito"
            : isAuth
              ? "Sessão expirada"
              : "Erro ao carregar"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isForbidden
            ? "Essa página é só pra administradores da Cozina Foods. Peça pra alguém com esse perfil te dar acesso."
            : isAuth
              ? "Sua sessão expirou. Faz login de novo pra continuar."
              : error.message ?? "Algo deu errado."}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium hover:bg-muted"
          >
            <ArrowLeft className="size-3.5" />
            Voltar pro dashboard
          </Link>
          {!isForbidden && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Tentar de novo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
