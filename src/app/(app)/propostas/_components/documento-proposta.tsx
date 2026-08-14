"use client"

import type { DadosProposta } from "@/lib/data/propostas"

/**
 * A FOLHA. Isto é o que o cliente recebe — na tela e no PDF, o mesmo componente.
 *
 * Cores fixas (branco/preto/laranja) e não tokens de tema: documento é papel.
 * Se herdasse o tema, quem está no modo escuro veria — e imprimiria — texto
 * preto sobre fundo preto. Já aconteceu na primeira versão em HTML.
 */
const LARANJA = "#ff4d1c"

function brl(v: number): string {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function dataBr(iso: string): string {
  if (!iso) return "—"
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

export function DocumentoProposta({
  numero,
  d,
}: {
  numero: string
  d: DadosProposta
}) {
  const adicionais = Math.max(Number(d.lojas || 1) - 1, 0)

  return (
    <div
      data-doc
      className="mx-auto w-full max-w-[820px] bg-white p-12 text-[13px] leading-relaxed text-zinc-700 shadow-sm print:max-w-none print:p-0 print:shadow-none"
      style={{ colorScheme: "light" }}
    >
      {/* ── Cabeçalho ───────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 border-b-2 pb-5" style={{ borderColor: LARANJA }}>
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 512 512" className="size-11 rounded-[11px]">
            <rect width="512" height="512" rx="104" fill={LARANJA} />
            <g
              transform="translate(98 98) scale(13.2)"
              fill="none"
              stroke="#fff"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v18h18" />
              <path d="M18 17V9" />
              <path d="M13 17V5" />
              <path d="M8 17v-3" />
            </g>
          </svg>
          <div>
            <p className="text-lg font-extrabold tracking-tight text-zinc-900">
              Delivery<span style={{ color: LARANJA }}>OS</span>
            </p>
            <p className="text-[11px] text-zinc-500">
              LAB OF CHANGE LTDA · CNPJ 38.613.971/0001-80
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-widest text-zinc-500">
            Proposta comercial
          </p>
          <p className="text-lg font-extrabold tabular-nums text-zinc-900">
            nº {numero}
          </p>
          <p className="text-[11px] text-zinc-500">
            Válida até {dataBr(d.validadeAte)}
          </p>
        </div>
      </div>

      {/* ── Cliente ─────────────────────────────────────────────── */}
      <Titulo>Cliente</Titulo>
      <table className="w-full text-[12px]">
        <tbody>
          <Linha rot="Razão social" val={d.razaoSocial || "—"} />
          <Linha rot="CNPJ" val={d.cnpj || "—"} />
          <Linha rot="Endereço" val={d.endereco || "—"} />
          <Linha
            rot="Contato"
            val={
              [d.contatoNome, d.contatoEmail, d.contatoTelefone]
                .filter(Boolean)
                .join(" · ") || "—"
            }
          />
        </tbody>
      </table>

      {/* ── Escopo ──────────────────────────────────────────────── */}
      <Titulo>Escopo contratado</Titulo>
      <p>
        Plano <b className="text-zinc-900">{d.planoLabel}</b> para{" "}
        <b className="text-zinc-900">{d.lojas}</b>{" "}
        {d.lojas === 1 ? "loja" : "lojas"}, com usuários ilimitados.
      </p>
      <p className="mt-1.5">
        Integração automática com <b className="text-zinc-900">iFood, 99 Food,
        Keeta e Cardápio Web</b>: faturamento, pedidos, taxas, cancelamentos,
        avaliações e cardápio entram todos os dias, sem planilha. Onde a
        integração não estiver disponível, a importação por planilha continua
        valendo.
      </p>

      {/* ── Investimento ────────────────────────────────────────── */}
      <Titulo>Investimento</Titulo>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-zinc-900 text-white">
            <th className="p-2 text-left text-[10px] font-bold uppercase tracking-wider">Item</th>
            <th className="p-2 text-right text-[10px] font-bold uppercase tracking-wider">Qtd.</th>
            <th className="p-2 text-right text-[10px] font-bold uppercase tracking-wider">Unitário</th>
            <th className="p-2 text-right text-[10px] font-bold uppercase tracking-wider">Mensal</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="p-2">{d.planoLabel} — 1ª loja</td>
            <td className="p-2 text-right tabular-nums">1</td>
            <td className="p-2 text-right tabular-nums">{brl(d.precoPrimeira)}</td>
            <td className="p-2 text-right tabular-nums">{brl(d.precoPrimeira)}</td>
          </tr>
          {adicionais > 0 && (
            <tr className="border-b bg-zinc-50">
              <td className="p-2">{d.planoLabel} — lojas adicionais</td>
              <td className="p-2 text-right tabular-nums">{adicionais}</td>
              <td className="p-2 text-right tabular-nums">{brl(d.precoAdicional)}</td>
              <td className="p-2 text-right tabular-nums">
                {brl(d.precoAdicional * adicionais)}
              </td>
            </tr>
          )}
          {Number(d.descontoMensal) > 0 && (
            <tr className="border-b">
              <td className="p-2">Desconto comercial</td>
              <td className="p-2 text-right">—</td>
              <td className="p-2 text-right">—</td>
              <td className="p-2 text-right tabular-nums">
                −{brl(d.descontoMensal)}
              </td>
            </tr>
          )}
          <tr style={{ background: "#fff7ed", borderTop: `2px solid ${LARANJA}` }}>
            <td className="p-2 font-extrabold text-zinc-900" colSpan={3}>
              Total mensal
            </td>
            <td className="p-2 text-right font-extrabold tabular-nums text-zinc-900">
              {brl(d.totalMensal)}
            </td>
          </tr>
          <tr style={{ background: "#fff7ed" }}>
            <td className="p-2 font-extrabold text-zinc-900" colSpan={3}>
              Total do período (12 meses)
            </td>
            <td className="p-2 text-right font-extrabold tabular-nums text-zinc-900">
              {brl(d.totalMensal * 12)}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="mt-3 w-full text-[12px]">
        <tbody>
          <Linha rot="Setup inicial" val={d.setup || "—"} />
          <Linha rot="Treinamento" val={d.treinamento || "—"} />
          <Linha rot="Vencimento" val={`Dia ${d.vencimentoDia} de cada mês`} />
          <Linha
            rot="Meios de pagamento"
            val="Cartão de crédito, boleto ou PIX (Asaas), com NFS-e automática"
          />
          <Linha
            rot="Reajuste"
            val="Anual, pelo IPCA/IBGE, na data de aniversário do contrato"
          />
        </tbody>
      </table>

      {/* ── Vigência ────────────────────────────────────────────── */}
      <Titulo>Vigência</Titulo>
      <p>
        <b className="text-zinc-900">12 (doze) meses</b>, renováveis
        automaticamente por iguais períodos, salvo manifestação escrita de
        qualquer das partes com 30 (trinta) dias de antecedência.
      </p>

      {d.observacoes && (
        <>
          <Titulo>Observações</Titulo>
          <p className="whitespace-pre-wrap">{d.observacoes}</p>
        </>
      )}

      {/* ── Termo de aceite ─────────────────────────────────────── */}
      <div className="mt-8 break-inside-avoid rounded-lg border-2 p-5" style={{ borderColor: LARANJA }}>
        <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest" style={{ color: LARANJA }}>
          Termo de aceite
        </p>
        <p className="text-[12px]">
          O <b className="text-zinc-900">&quot;De acordo&quot;</b> nesta proposta
          vincula as partes ao cumprimento de suas condições, representa a
          autorização de{" "}
          <b className="text-zinc-900">{d.razaoSocial || "—"}</b> para o início
          das atividades e o compromisso pelo pagamento dos valores devidos.
        </p>
        <p className="mt-2 text-[12px]">
          Esta proposta obedece integralmente ao{" "}
          <b className="text-zinc-900">
            Contrato de Prestação de Serviços de Software (SaaS) — Delivery OS
          </b>
          , do qual é parte integrante e complementar, disponível em{" "}
          <b className="text-zinc-900">www.deliveryos.food/contrato</b>.
        </p>

        <div className="mt-7 grid grid-cols-2 gap-8">
          <div>
            <div className="border-b border-zinc-800 pb-6" />
            <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
              {d.razaoSocial || "Cliente"} — representante legal
            </p>
          </div>
          <div>
            <div className="border-b border-zinc-800 pb-6" />
            <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Data
            </p>
          </div>
        </div>
      </div>

      <p className="mt-5 text-[10px] text-zinc-500">
        Consultor: {d.consultorNome || "—"}
        {d.consultorEmail ? ` · ${d.consultorEmail}` : ""} · Delivery OS ·
        deliveryos.food
      </p>
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-2 mt-7 break-after-avoid border-b pb-1 text-[13px] font-extrabold tracking-tight text-zinc-900"
      style={{ borderColor: LARANJA }}
    >
      {children}
    </h2>
  )
}

function Linha({ rot, val }: { rot: string; val: string }) {
  return (
    <tr>
      <td className="w-[170px] py-1 pr-3 align-top text-zinc-500">{rot}</td>
      <td className="py-1 align-top text-zinc-900">{val}</td>
    </tr>
  )
}
