import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Quanto o sistema pesa hoje, e quanto engordou desde ontem.
 *
 * Mede e GRAVA o snapshot do dia na mesma passada: o delta de amanhã depende
 * de a medição de hoje ter ficado registrada. Se só medisse, todo dia mostraria
 * o tamanho absoluto e ninguém veria a inclinação — que é a única coisa que
 * responde "quando isso vira problema".
 *
 * Roda no cron de saúde (14h UTC / 11h BRT), depois das rodadas de importação
 * da manhã: medir antes contaria o dia anterior.
 */

const MB = 1024 * 1024

export type TabelaCrescimento = {
  tabela: string
  bytes: number
  /** Quanto cresceu desde a medição anterior. Null na primeira vez. */
  delta: number | null
}

export type InfraMetricas = {
  dbBytes: number
  storageBytes: number
  storageArquivos: number
  /** Crescimento do banco desde a última medição. Null se não há anterior. */
  dbDelta: number | null
  storageDelta: number | null
  /** Dias entre esta medição e a anterior (1 no fluxo normal). */
  diasDesdeAnterior: number | null
  /** As que mais cresceram, da maior pra menor. Só as que cresceram. */
  cresceram: TabelaCrescimento[]
  /** As maiores, independente de crescimento. */
  maiores: TabelaCrescimento[]
}

type LinhaTabela = { t: string; b: number }

export async function medirInfra(): Promise<InfraMetricas | null> {
  const admin = createAdminClient()

  const { data, error } = await admin.rpc("infra_metricas")
  if (error || !data) {
    console.error("infra_metricas:", error?.message)
    return null
  }
  const atual = (Array.isArray(data) ? data[0] : data) as {
    db_bytes: number | string
    storage_bytes: number | string
    storage_arquivos: number
    tabelas: LinhaTabela[]
  }
  const dbBytes = Number(atual.db_bytes)
  const storageBytes = Number(atual.storage_bytes)
  const tabelas = (atual.tabelas ?? []) as LinhaTabela[]

  // A medição ANTERIOR, seja de ontem ou de quando o cron rodou pela última
  // vez. Não assume "ontem": se o cron falhou dois dias, o delta é de dois
  // dias e a tela precisa dizer isso, senão o número parece um salto de um dia.
  const hojeIso = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  })
  const { data: ant } = await admin
    .from("infra_metricas_diarias")
    .select("dia, db_bytes, storage_bytes, tabelas")
    .lt("dia", hojeIso)
    .order("dia", { ascending: false })
    .limit(1)
    .maybeSingle()

  const anterior = ant as
    | { dia: string; db_bytes: number; storage_bytes: number; tabelas: LinhaTabela[] }
    | null

  const antesPorTabela = new Map<string, number>(
    (anterior?.tabelas ?? []).map((x) => [x.t, Number(x.b)]),
  )

  const comDelta: TabelaCrescimento[] = tabelas.map((x) => {
    const antes = antesPorTabela.get(x.t)
    return {
      tabela: x.t,
      bytes: Number(x.b),
      delta: antes == null ? null : Number(x.b) - antes,
    }
  })

  await admin.from("infra_metricas_diarias").upsert(
    {
      dia: hojeIso,
      db_bytes: dbBytes,
      storage_bytes: storageBytes,
      storage_arquivos: atual.storage_arquivos,
      tabelas,
      medido_em: new Date().toISOString(),
    },
    { onConflict: "dia" },
  )

  const diasDesdeAnterior = anterior
    ? Math.max(
        1,
        Math.round(
          (new Date(hojeIso + "T00:00:00").getTime() -
            new Date(anterior.dia + "T00:00:00").getTime()) /
            86_400_000,
        ),
      )
    : null

  return {
    dbBytes,
    storageBytes,
    storageArquivos: atual.storage_arquivos,
    dbDelta: anterior ? dbBytes - Number(anterior.db_bytes) : null,
    storageDelta: anterior ? storageBytes - Number(anterior.storage_bytes) : null,
    diasDesdeAnterior,
    // Corte de 1 MB: variação menor que isso é vacuum e índice respirando,
    // não crescimento. Listar ruído faria a lista mudar todo dia sem informar.
    cresceram: comDelta
      .filter((x) => (x.delta ?? 0) >= MB)
      .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
      .slice(0, 5),
    maiores: comDelta.slice(0, 5),
  }
}

/** Bytes em MB/GB, como se fala. */
export function fmtBytes(b: number): string {
  const abs = Math.abs(b)
  if (abs >= 1024 * MB)
    return `${(b / (1024 * MB)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`
  if (abs >= MB)
    return `${(b / MB).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
  return `${Math.round(b / 1024)} KB`
}
