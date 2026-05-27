"use client"

import * as React from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { CalendarDays, FileText } from "lucide-react"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import type { DailyAggregate, MonthlyEntry } from "@/lib/data/lancamentos"
import type { PlatformId } from "@/components/platform-logo"
import { DiaryTab } from "./diary-tab"
import { MonthlyTab, type MonthlySummary } from "./monthly-tab"

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

export function LancamentosView({
  unitId,
  year,
  month,
  aggregates,
  daySummary,
  monthlyEntry,
  unitActivePlatforms,
}: {
  unitId: string
  year: number
  month: number
  aggregates: DailyAggregate[]
  daySummary: MonthlySummary
  monthlyEntry: MonthlyEntry
  unitActivePlatforms: PlatformId[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const onChangeMonth = (newYear: number, newMonth: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("ano", String(newYear))
    params.set("mes", String(newMonth))
    router.push(`${pathname}?${params.toString()}`)
  }

  const monthOptions: { year: number; month: number; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    monthOptions.push({
      year: y,
      month: m,
      label: `${MESES[m - 1]} / ${y}`,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          Período:
        </label>
        <select
          value={`${year}-${month}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-").map(Number)
            onChangeMonth(y, m)
          }}
          className="h-9 rounded-md border bg-card px-3 text-xs font-medium outline-none"
        >
          {monthOptions.map((o) => (
            <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <Tabs defaultValue="diario">
        <TabsList>
          <TabsTrigger value="diario">
            <CalendarDays className="mr-1.5 size-3.5" />
            Diário
          </TabsTrigger>
          <TabsTrigger value="mensal">
            <FileText className="mr-1.5 size-3.5" />
            Mensal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="diario" className="mt-4">
          <DiaryTab
            unitId={unitId}
            year={year}
            month={month}
            aggregates={aggregates}
            unitActivePlatforms={unitActivePlatforms}
          />
        </TabsContent>

        <TabsContent value="mensal" className="mt-4">
          <MonthlyTab
            unitId={unitId}
            year={year}
            month={month}
            daySummary={daySummary}
            initial={monthlyEntry}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
