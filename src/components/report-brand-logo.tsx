import "server-only"

import { getCurrentUserContext } from "@/lib/auth/context"
import { DeliveryOsMark } from "@/components/delivery-os-logo"

/**
 * Logo de cabeçalho de relatório (entra no PDF). White-label: usa o logo da
 * empresa quando há; senão, a marca padrão do produto (Delivery OS).
 */
export async function ReportBrandLogo({
  imgClassName = "h-10 w-auto",
}: {
  imgClassName?: string
}) {
  const { logoUrl } = await getCurrentUserContext()
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" className={imgClassName} />
  }
  return <DeliveryOsMark className="size-10" />
}
