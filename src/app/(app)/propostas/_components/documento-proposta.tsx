"use client"

import type { DadosProposta } from "@/lib/data/propostas"
import type { ModeloProposta } from "@/lib/data/proposta-modelo"

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
  modelo,
  numero,
  d,
}: {
  numero: string
  d: DadosProposta
  /** Textos padrão (editáveis em /propostas/modelo). */
  modelo: ModeloProposta
}) {
  const adicionais = Math.max(Number(d.lojas || 1) - 1, 0)
  const escopo = modelo.escopoItens

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
          {/* Quem assina é o dono; quem paga é o financeiro. Mandar boleto pro
              e-mail de quem assinou é como uma cobrança some por três semanas. */}
          <Linha
            rot="Recebe o boleto"
            val={
              [d.contatoBoletoNome, d.contatoBoletoEmail, d.contatoBoletoTelefone]
                .filter(Boolean)
                .join(" · ") || "—"
            }
          />
          <Linha
            rot="Recebe a nota fiscal"
            val={
              [d.contatoNfNome, d.contatoNfEmail, d.contatoNfTelefone]
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
      {/* ⚠️ ITEM A ITEM, INCLUSIVE O QUE NÃO ENTRA.
          Era a lacuna mais séria da versão anterior, que resolvia o escopo num
          parágrafo. Sem a lista do que fica DE FORA, "eu achei que tinha
          relatório de X" vira discussão no quarto mês — e sempre com quem já
          está pagando. O "–" é tão importante quanto o "✓". */}
      <table className="mt-2 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border-b-2" style={{ borderColor: LARANJA }}>
            <th className="py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Recurso
            </th>
            <th className="w-[110px] py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Plano {d.planoLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {escopo.map((item) => {
            const tem = item.planos.includes(d.plano)
            return (
              <tr key={item.recurso} className="border-b border-zinc-100">
                <td className={`py-1 ${tem ? "text-zinc-900" : "text-zinc-400"}`}>
                  {item.recurso}
                </td>
                <td className="py-1 text-center">
                  {tem ? (
                    <span style={{ color: LARANJA }} className="font-bold">
                      ✓
                    </span>
                  ) : (
                    <span className="text-zinc-300">–</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-zinc-500">
        Onde a integração automática não estiver disponível, a importação por
        planilha continua valendo.
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
        </tbody>
      </table>

      {/* ── Cronograma ──────────────────────────────────────────── */}
      {/* A Mercos lista as 12 parcelas com data. Aqui a mensalidade é fixa, então
          repetir doze linhas iguais seria encher página — o que a pessoa
          precisa saber é QUANDO começa e QUANDO vence cada uma. */}
      <Titulo>Pagamento</Titulo>
      <table className="w-full text-[12px]">
        <tbody>
          <Linha
            rot="Primeira cobrança"
            val={
              d.inicioCobranca
                ? dataBr(d.inicioCobranca)
                : "Na contratação"
            }
          />
          <Linha rot="Demais parcelas" val={`Todo dia ${d.vencimentoDia}, por 12 meses`} />
          <Linha rot="Faturamento" val={modelo.faturamento} />
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

      {/* ── Atendimento e condições ─────────────────────────────── */}
      <Titulo>Atendimento e condições</Titulo>
      <table className="w-full text-[12px]">
        <tbody>
          <Linha rot="Atendimento" val={modelo.atendimento} />
          <Linha rot="Novas lojas" val={modelo.contratarMais} />
          <Linha rot="Treinamento" val={modelo.treinamentoPrazo} />
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
        <p className="text-[12px]">{modelo.termoAceite}</p>
        <p className="mt-2 text-[12px]">
          Esta proposta obedece integralmente ao{" "}
          <b className="text-zinc-900">
            Contrato de Prestação de Serviços de Software (SaaS) — Delivery OS
          </b>
          , do qual é parte integrante e complementar, disponível em{" "}
          <b className="text-zinc-900">
            {modelo.contratoUrl.replace(/^https?:\/\//, "")}
          </b>
          .
        </p>

        <div className="mt-7 grid grid-cols-2 gap-8">
          <div>
            <div className="border-b border-zinc-800 pb-6" />
            <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Nome do representante legal
            </p>
          </div>
          <div>
            <div className="border-b border-zinc-800 pb-6" />
            <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
              CNPJ
            </p>
          </div>
          <div>
            <div className="border-b border-zinc-800 pb-6" />
            <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Assinatura
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

      {/* Protege contra "não usei, não pago" e contra o número mudar sem
          documento novo. A Mercos põe isso em nota de rodapé; mesma ideia. */}
      <p className="mt-4 text-[10px] leading-relaxed text-zinc-500">
        {modelo.rodapeValores}
      </p>

      <p className="mt-3 text-[10px] text-zinc-500">
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
