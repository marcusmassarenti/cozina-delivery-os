import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getReportPrefs } from "@/lib/data/report-prefs"
import { isAiPlan } from "@/lib/data/billing"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { ReportPrefsForm } from "../_components/report-prefs-form"
import { IaToggle } from "../_components/ia-toggle"

export const dynamic = "force-dynamic"

export default async function RelatoriosTab() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect("/login")

  const [prefs, isAi, holdingId] = await Promise.all([
    getReportPrefs(),
    isAiPlan(),
    getCurrentHoldingId(),
  ])
  let iaOn = true
  if (holdingId) {
    const admin = createAdminClient()
    const { data } = await admin
      .from("holdings")
      .select("ia_habilitada")
      .eq("id", holdingId)
      .maybeSingle()
    iaOn = data?.ia_habilitada ?? true
  }

  return (
    <div className="flex flex-col gap-5">
      <IaToggle inicial={iaOn} isAi={isAi} />
      <ReportPrefsForm prefs={prefs} />
    </div>
  )
}
