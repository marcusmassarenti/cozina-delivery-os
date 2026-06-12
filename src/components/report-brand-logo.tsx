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
  const { logoUrl, companyName } = await getCurrentUserContext()
  return (
    <div className="flex flex-col items-start gap-1">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className={imgClassName} />
      ) : (
        <DeliveryOsMark className="size-10" />
      )}
      {companyName && (
        <span className="text-xs font-semibold leading-tight text-foreground print:text-sm">
          {companyName}
        </span>
      )}
    </div>
  )
}
