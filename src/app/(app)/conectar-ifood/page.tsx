import Link from "next/link"
import { ArrowLeft, Plug } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { getPanoramaConexaoIfood } from "@/lib/data/conectar-ifood"

import {
  AvisoEmAndamento,
  ListaParaConectar,
  TudoConectado,
} from "./_components/lista-para-conectar"

/**
 * "Conectar as lojas ao iFood" — a tela que faltava.
 *
 * O pedido de conexão já existia, mas só dentro da página de CADA unidade.
 * Com 49 lojas isso vira 9 repetições do mesmo formulário, e o resultado
 * prático foi 10 lojas na base que nunca conectaram. Aqui é tudo de uma vez.
 */
export default async function ConectarIfoodPage() {
  const { faltando, emAndamento, conectadas, totalComIfood } =
    await getPanoramaConexaoIfood()

  return (
    <div className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <div>
        <Link
          href="/inicio"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-3" />
          Voltar
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <PlatformLogo platform="ifood" className="size-6" />
          Conectar suas lojas ao iFood
        </h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
          Loja conectada traz faturamento, pedidos e avaliações sozinha, todo
          dia — sem ninguém baixar planilha. {conectadas} de {totalComIfood}{" "}
          {totalComIfood === 1 ? "loja já está" : "lojas já estão"} assim.
        </p>
      </div>

      {emAndamento > 0 && <AvisoEmAndamento quantas={emAndamento} />}

      {faltando.length === 0 ? (
        <TudoConectado />
      ) : (
        <>
          <div className="flex items-start gap-3 rounded-lg border bg-background p-4">
            <Plug className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium">
                {faltando.length}{" "}
                {faltando.length === 1
                  ? "loja ainda depende de planilha"
                  : "lojas ainda dependem de planilha"}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Confira o CNPJ de cada uma — é por ele que a loja do iFood casa
                com a loja daqui — e peça a conexão de todas de uma vez.
              </p>
            </div>
          </div>

          <ListaParaConectar lojas={faltando} />
        </>
      )}
    </div>
  )
}
