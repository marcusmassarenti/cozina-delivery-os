import { cn } from "@/lib/utils"

/**
 * Marketplaces: cobram comissão, repassam com desconto, têm VR e
 * cancelamento próprio. É a família que alimenta DRE, ranking e cobertura.
 */
export type PlatformId = "ifood" | "99food" | "keeta"

/**
 * Todo canal de venda, incluindo os PRÓPRIOS (Cardápio Web).
 *
 * De propósito é um tipo separado de PlatformId: canal próprio não tem
 * comissão nem repasse, então não cabe nas contas de marketplace. Use CanalId
 * onde a pergunta é "por onde essa loja vende?", e PlatformId onde a pergunta
 * envolve dinheiro de marketplace.
 */
export type CanalId = PlatformId | "cardapioweb"

/**
 * Separa marketplace de canal próprio. Usado onde a tela só faz sentido pra
 * marketplace — importação de planilha, DRE, cobertura — pra o Cardápio Web
 * não aparecer pedindo um relatório que não existe.
 */
export function ehMarketplace(canal: CanalId): canal is PlatformId {
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
