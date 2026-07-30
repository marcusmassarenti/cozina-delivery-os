import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import { getClientDetail } from "@/lib/data/plataforma"
import { ClientDetailView } from "../_components/client-detail-view"

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!(await isSuperadmin())) notFound()
  const { id } = await params
  const c = await getClientDetail(id)
  if (!c) notFound()

  return (
    <div className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <Link
        href="/clientes"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Clientes da plataforma
      </Link>
      <ClientDetailView detail={c} />
    </div>
  )
}
