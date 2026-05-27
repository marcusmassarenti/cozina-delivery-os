/**
 * Dados de demonstração — substituir por queries Supabase quando
 * integrações iFood/manuais estiverem ativas.
 *
 * Valores baseados no que a consultoria de delivery mostra hoje +
 * estrutura da planilha mensal por loja (Jardins, abril/2024).
 */

import type { PlatformId } from "@/components/platform-logo"

export type PlatformBreakdown = {
  id: PlatformId
  name: string
  bruto: number
  liquido: number
  pctLoja: number
}

export type UnitMonthly = {
  pedidos: number
  pedidosCancelados: number
  clientesNovos: number | null
  ticketMedio: number
  faturamentoBruto: number
  faturamentoLiquido: number
  totalLiquido: number
  vrRecebido: number
  vrTaxaMedia8: number
  cancelamentosReembolsos: number
  taxaEntregaIfood: number
  promocoes: number
  taxaComissaoIfood: number
  servicosLogisticos: number
  outrosDescontosIfood: number
  custoProdutosCozina: number
  custoProdutosLoja: number | null
  margemLiquida: number
  margemLucroPct: number
  notaMedia: number
  observacoes: string
  platforms: PlatformBreakdown[]
}

export type Unit = {
  code: string
  name: string
  city: string
  state: string
  cnpj: string
  active: boolean
  monthly: UnitMonthly
}

const empty: UnitMonthly = {
  pedidos: 0,
  pedidosCancelados: 0,
  clientesNovos: null,
  ticketMedio: 0,
  faturamentoBruto: 0,
  faturamentoLiquido: 0,
  totalLiquido: 0,
  vrRecebido: 0,
  vrTaxaMedia8: 0,
  cancelamentosReembolsos: 0,
  taxaEntregaIfood: 0,
  promocoes: 0,
  taxaComissaoIfood: 0,
  servicosLogisticos: 0,
  outrosDescontosIfood: 0,
  custoProdutosCozina: 0,
  custoProdutosLoja: null,
  margemLiquida: 0,
  margemLucroPct: 0,
  notaMedia: 0,
  observacoes: "",
  platforms: [
    { id: "ifood", name: "iFood", bruto: 0, liquido: 0, pctLoja: 0 },
    { id: "99food", name: "99 Food", bruto: 0, liquido: 0, pctLoja: 0 },
    { id: "keeta", name: "Keeta", bruto: 0, liquido: 0, pctLoja: 0 },
  ],
}

export const units: Unit[] = [
  {
    code: "02",
    name: "Churrasco no Pote — JK",
    city: "São Paulo",
    state: "SP",
    cnpj: "00.000.000/0001-02",
    active: true,
    monthly: {
      pedidos: 3600,
      pedidosCancelados: 312,
      clientesNovos: 480,
      ticketMedio: 60.65,
      faturamentoBruto: 216646.43,
      faturamentoLiquido: 146835.99,
      totalLiquido: 158520.0,
      vrRecebido: 13800.0,
      vrTaxaMedia8: 1104.0,
      cancelamentosReembolsos: 1020.0,
      taxaEntregaIfood: 3450.0,
      promocoes: 3370.0,
      taxaComissaoIfood: 31952.5,
      servicosLogisticos: 24560.0,
      outrosDescontosIfood: 6477.94,
      custoProdutosCozina: 56789.0,
      custoProdutosLoja: null,
      margemLiquida: 101731.0,
      margemLucroPct: 46.96,
      notaMedia: 4.8,
      observacoes: "",
      platforms: [
        { id: "ifood", name: "iFood", bruto: 130000, liquido: 84000, pctLoja: 64.6 },
        { id: "99food", name: "99 Food", bruto: 54000, liquido: 40000, pctLoja: 74.1 },
        { id: "keeta", name: "Keeta", bruto: 32646.43, liquido: 22835.99, pctLoja: 69.9 },
      ],
    },
  },
  {
    code: "04",
    name: "Churrasco no Pote — Brooklin",
    city: "São Paulo",
    state: "SP",
    cnpj: "00.000.000/0001-04",
    active: true,
    monthly: {
      pedidos: 1476,
      pedidosCancelados: 128,
      clientesNovos: 210,
      ticketMedio: 65.41,
      faturamentoBruto: 96182.75,
      faturamentoLiquido: 60838.3,
      totalLiquido: 66120.0,
      vrRecebido: 6200.0,
      vrTaxaMedia8: 496.0,
      cancelamentosReembolsos: 420.0,
      taxaEntregaIfood: 1530.0,
      promocoes: 1492.0,
      taxaComissaoIfood: 14180.0,
      servicosLogisticos: 11200.0,
      outrosDescontosIfood: 2942.45,
      custoProdutosCozina: 22890.0,
      custoProdutosLoja: null,
      margemLiquida: 43230.0,
      margemLucroPct: 44.94,
      notaMedia: 4.6,
      observacoes: "",
      platforms: [
        { id: "ifood", name: "iFood", bruto: 58000, liquido: 36000, pctLoja: 62.1 },
        { id: "99food", name: "99 Food", bruto: 22000, liquido: 16000, pctLoja: 72.7 },
        { id: "keeta", name: "Keeta", bruto: 16182.75, liquido: 8838.3, pctLoja: 54.6 },
      ],
    },
  },
  {
    code: "05",
    name: "Churrasco no Pote — Hortolândia",
    city: "Hortolândia",
    state: "SP",
    cnpj: "00.000.000/0001-05",
    active: false,
    monthly: empty,
  },
  {
    code: "10",
    name: "Churrasco no Pote — Ribeirão Preto",
    city: "Ribeirão Preto",
    state: "SP",
    cnpj: "00.000.000/0001-10",
    active: true,
    monthly: {
      pedidos: 83,
      pedidosCancelados: 6,
      clientesNovos: 18,
      ticketMedio: 63.53,
      faturamentoBruto: 5211.64,
      faturamentoLiquido: 2883.87,
      totalLiquido: 3210.0,
      vrRecebido: 340.0,
      vrTaxaMedia8: 27.2,
      cancelamentosReembolsos: 32.0,
      taxaEntregaIfood: 95.0,
      promocoes: 82.0,
      taxaComissaoIfood: 740.0,
      servicosLogisticos: 1280.0,
      outrosDescontosIfood: 130.77,
      custoProdutosCozina: 1380.0,
      custoProdutosLoja: null,
      margemLiquida: 1830.0,
      margemLucroPct: 35.11,
      notaMedia: 4.5,
      observacoes: "",
      platforms: [
        { id: "ifood", name: "iFood", bruto: 3200, liquido: 1700, pctLoja: 53.1 },
        { id: "99food", name: "99 Food", bruto: 1211.64, liquido: 883.87, pctLoja: 73.0 },
        { id: "keeta", name: "Keeta", bruto: 800, liquido: 300, pctLoja: 37.5 },
      ],
    },
  },
  {
    code: "11",
    name: "Churrasco no Pote — São José dos Campos",
    city: "São José dos Campos",
    state: "SP",
    cnpj: "00.000.000/0001-11",
    active: true,
    monthly: {
      pedidos: 335,
      pedidosCancelados: 24,
      clientesNovos: 52,
      ticketMedio: 68.71,
      faturamentoBruto: 22770.83,
      faturamentoLiquido: 14575.1,
      totalLiquido: 15890.0,
      vrRecebido: 1450.0,
      vrTaxaMedia8: 116.0,
      cancelamentosReembolsos: 160.0,
      taxaEntregaIfood: 380.0,
      promocoes: 355.0,
      taxaComissaoIfood: 3220.0,
      servicosLogisticos: 2920.0,
      outrosDescontosIfood: 720.73,
      custoProdutosCozina: 5680.0,
      custoProdutosLoja: null,
      margemLiquida: 10210.0,
      margemLucroPct: 44.84,
      notaMedia: 4.7,
      observacoes: "",
      platforms: [
        { id: "ifood", name: "iFood", bruto: 14000, liquido: 9000, pctLoja: 64.3 },
        { id: "99food", name: "99 Food", bruto: 4770.83, liquido: 3575.1, pctLoja: 74.9 },
        { id: "keeta", name: "Keeta", bruto: 4000, liquido: 2000, pctLoja: 50.0 },
      ],
    },
  },
  {
    code: "12",
    name: "Churrasco no Pote — Tatuapé",
    city: "São Paulo",
    state: "SP",
    cnpj: "00.000.000/0001-12",
    active: true,
    monthly: {
      pedidos: 126,
      pedidosCancelados: 9,
      clientesNovos: 21,
      ticketMedio: 82.22,
      faturamentoBruto: 10359.69,
      faturamentoLiquido: 7045.13,
      totalLiquido: 7680.0,
      vrRecebido: 720.0,
      vrTaxaMedia8: 57.6,
      cancelamentosReembolsos: 78.0,
      taxaEntregaIfood: 160.0,
      promocoes: 155.0,
      taxaComissaoIfood: 1480.0,
      servicosLogisticos: 1280.0,
      outrosDescontosIfood: 239.56,
      custoProdutosCozina: 2680.0,
      custoProdutosLoja: null,
      margemLiquida: 5000.0,
      margemLucroPct: 48.27,
      notaMedia: 4.8,
      observacoes: "",
      platforms: [
        { id: "ifood", name: "iFood", bruto: 6500, liquido: 4400, pctLoja: 67.7 },
        { id: "99food", name: "99 Food", bruto: 2059.69, liquido: 1645.13, pctLoja: 79.9 },
        { id: "keeta", name: "Keeta", bruto: 1800, liquido: 1000, pctLoja: 55.6 },
      ],
    },
  },
]

//---------- Helpers de formatação --------------------------------

export const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n)

export const fmtBRLShort = (n: number) => {
  if (n === 0) return "—"
  if (n >= 1000) return `R$ ${(n / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`
  return fmtBRL(n)
}

export const fmtNum = (n: number) =>
  new Intl.NumberFormat("pt-BR").format(n)

export const fmtPct = (n: number) => `${n.toFixed(1)}%`

//---------- Agregados da rede ------------------------------------

export const networkTotals = (() => {
  const all = units.filter((u) => u.active)
  const sum = (sel: (u: Unit) => number) => all.reduce((acc, u) => acc + sel(u), 0)

  const pedidos = sum((u) => u.monthly.pedidos)
  const faturamentoBruto = sum((u) => u.monthly.faturamentoBruto)
  const faturamentoLiquido = sum((u) => u.monthly.faturamentoLiquido)
  const totalLiquido = sum((u) => u.monthly.totalLiquido)
  const mediaTicket = pedidos > 0 ? faturamentoBruto / pedidos : 0
  const mediaDia = pedidos / 30
  const taxaRepasse = faturamentoBruto > 0 ? (faturamentoLiquido / faturamentoBruto) * 100 : 0

  return {
    pedidos,
    mediaDia: Math.round(mediaDia),
    faturamentoBruto,
    faturamentoLiquido,
    totalLiquido,
    mediaTicket,
    taxaRepasse,
  }
})()

export const platformTotals = (() => {
  const sum = (id: PlatformId, sel: (p: PlatformBreakdown) => number) =>
    units
      .filter((u) => u.active)
      .reduce((acc, u) => {
        const platform = u.monthly.platforms.find((p) => p.id === id)
        return acc + (platform ? sel(platform) : 0)
      }, 0)

  return (["ifood", "99food", "keeta"] as PlatformId[]).map((id) => {
    const name = id === "ifood" ? "iFood" : id === "99food" ? "99 Food" : "Keeta"
    const bruto = sum(id, (p) => p.bruto)
    const liquido = sum(id, (p) => p.liquido)
    const pctLoja = bruto > 0 ? (liquido / bruto) * 100 : 0
    return { id, name, bruto, liquido, pctLoja }
  })
})()
