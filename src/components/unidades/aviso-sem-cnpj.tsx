import Link from "next/link"

/**
 * Aviso das unidades sem CNPJ no cadastro.
 *
 * Cinza, uma linha, sem ícone de alerta — é pendência de cadastro, não
 * incidente. Mas não é cosmético: o CNPJ é a chave que casa a loja do iFood
 * com a loja daqui. Enquanto ele estiver vazio, toda loja nova precisa ser
 * vinculada na mão, uma a uma (aconteceu em 29/07 com a Edmai's e a Forno
 * Itália, da DG Foods).
 *
 * Só aparece quando existe pendência.
 */
export function AvisoSemCnpj({
  unidades,
}: {
  unidades: { code: string; name: string }[]
}) {
  if (unidades.length === 0) return null
  const n = unidades.length
  return (
    <details className="group rounded-lg border border-dashed bg-card px-4 py-2.5 text-[11px] text-muted-foreground">
      <summary className="cursor-pointer list-none">
        <strong className="font-semibold text-foreground">
          {n} unidade{n > 1 ? "s" : ""} sem CNPJ
        </strong>{" "}
        no cadastro — é por ele que a loja do iFood casa sozinha com a loja
        daqui.{" "}
        <span className="underline underline-offset-2 group-open:hidden">
          ver quais
        </span>
        <span className="hidden underline underline-offset-2 group-open:inline">
          esconder
        </span>
      </summary>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {unidades.map((u) => (
          <li key={u.code}>
            <Link
              href={`/unidades/${u.code}`}
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              {u.code} · {u.name}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  )
}
