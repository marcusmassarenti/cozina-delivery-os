import { cn } from "@/lib/utils"

/**
 * Plataformas de venda da loja. O Cardápio Web entra com o mesmo peso dos
 * marketplaces: soma no bruto, nos pedidos e no ticket.
 */
export type PlatformId = "ifood" | "99food" | "keeta" | "cardapioweb"

/** Alias histórico. Hoje é o mesmo conjunto — prefira PlatformId. */
export type CanalId = PlatformId

/**
 * Só os marketplaces. Use onde a estrutura é de REPASSE — comissão, VR,
 * conciliação, upload de planilha, cobertura de relatório, ficha técnica.
 *
 * O Cardápio Web fica de fora desses porque a loja recebe direto: não existe
 * comissão pra somar nem planilha pra subir. Deixá-lo entrar ali criaria uma
 * coluna de taxa que sempre valeria zero, e um relatório que nunca chega.
 */
export type MarketplaceId = Exclude<PlatformId, "cardapioweb">

export const MARKETPLACES: MarketplaceId[] = ["ifood", "99food", "keeta"]

/** Toda plataforma, na ordem canônica de exibição. */
export const PLATAFORMAS: PlatformId[] = [
  "ifood",
  "99food",
  "keeta",
  "cardapioweb",
]

/**
 * Nome de exibição da plataforma.
 *
 * Existe porque o código repetia `id === "ifood" ? "iFood" : id === "99food" ?
 * "99 Food" : "Keeta"` — um ternário em que QUALQUER id novo cai no último
 * ramo e é rotulado como Keeta, sem erro de compilação. Centralizar aqui faz
 * o compilador cobrar o rótulo quando uma plataforma nova entra.
 */
export function rotuloPlataforma(id: PlatformId): string {
  return config[id].label
}

/**
 * Marketplace cobra comissão e repassa com desconto; canal próprio recebe
 * direto. Só use onde a diferença importa de verdade — upload de planilha de
 * repasse, conciliação, cobertura de relatório —, não pra decidir se o
 * faturamento entra na conta (entra sempre).
 */
export function ehMarketplace(canal: PlatformId): canal is MarketplaceId {
  return canal !== "cardapioweb"
}

type Size = "sm" | "md" | "lg"

type Config = {
  label: string
  bg: string
  /** Aparece quando o PNG não existe — ver comentário no componente. */
  sigla: string
  fg: string
}

// Brand colors usados como fundo (caso a imagem falhe carregar)
const config: Record<CanalId, Config> = {
  ifood: { label: "iFood", bg: "#EA1D2C", sigla: "iF", fg: "#FFFFFF" },
  "99food": { label: "99 Food", bg: "#FFD300", sigla: "99", fg: "#111111" },
  keeta: { label: "Keeta", bg: "#FFCD00", sigla: "K", fg: "#111111" },
  // Canal PRÓPRIO da loja, não marketplace — fundo branco porque o logo do
  // Cardápio Web é roxo sobre branco, e invertido ele some.
  cardapioweb: {
    label: "Cardápio Web",
    bg: "#FFFFFF",
    sigla: "CW",
    fg: "#5B2A86",
  },
}

const sizeClass: Record<Size, string> = {
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-10 w-10",
}

const siglaClass: Record<Size, string> = {
  sm: "text-[8px]",
  md: "text-[10px]",
  lg: "text-sm",
}

/**
 * Renderiza o logo oficial do canal a partir de /platforms/{id}.png.
 *
 * A sigla fica ATRÁS da imagem, e a imagem vai por cima com alt="". Quando o
 * PNG não existe, o navegador não desenha nada no lugar de uma imagem com alt
 * vazio — então aparece a sigla, e não o ícone de imagem quebrada. É o que
 * segura um canal novo cujo logo ainda não subiu (o nome real continua no
 * aria-label e no title, então leitor de tela e tooltip não perdem nada).
 */
export function PlatformLogo({
  platform,
  size = "md",
  className,
}: {
  platform: CanalId
  size?: Size
  className?: string
}) {
  const c = config[platform]
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded",
        sizeClass[size],
        className,
      )}
      style={{ backgroundColor: c.bg }}
      aria-label={c.label}
      title={c.label}
    >
      <span
        aria-hidden
        className={cn("font-bold leading-none", siglaClass[size])}
        style={{ color: c.fg }}
      >
        {c.sigla}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/platforms/${platform}.png`}
        alt=""
        className="absolute inset-0 size-full object-contain"
      />
    </span>
  )
}
