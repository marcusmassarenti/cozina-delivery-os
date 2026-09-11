import { LegalShell } from "@/components/legal/legal-shell"
import { ContratoClausulas } from "@/components/legal/contrato-clausulas"
import {
  CONTRATO_ATUALIZADO_EM,
  CONTRATO_VERSAO,
} from "@/lib/contrato-adesao-texto"

export const metadata = {
  title: "Contrato de Prestação de Serviços — Delivery OS",
}

/**
 * Contrato-mestre, público e versionado.
 *
 * POR QUE ESTA PÁGINA EXISTE: a proposta comercial que o cliente assina NÃO
 * carrega as cláusulas jurídicas — ela referencia esta URL. É o modelo da
 * Mercos, e o ganho é prático: não se renegocia cláusula a cada venda, muda só
 * escopo e preço. O Termo de Aceite da proposta aponta pra cá.
 *
 * ⚠️ Alterar este texto altera o contrato de TODOS os clientes ativos. A
 * cláusula 14.1 obriga aviso com 30 dias de antecedência e dá ao cliente o
 * direito de rescindir sem multa se a mudança for desfavorável. Mexer aqui é
 * ato jurídico, não edição de texto — suba a versão e a data junto.
 */
export default function ContratoPage() {
  return (
    <LegalShell
      title="Contrato de Prestação de Serviços de Software (SaaS)"
      updatedAt={CONTRATO_ATUALIZADO_EM}
    >
      <p>
        Este contrato rege a prestação dos serviços da plataforma{" "}
        <strong>Delivery OS</strong>, operada por{" "}
        <strong>LAB OF CHANGE LTDA</strong>, inscrita no CNPJ sob o nº{" "}
        <strong>38.613.971/0001-80</strong> (&quot;DELIVERY OS&quot;), e é parte
        integrante e complementar da <strong>Proposta Comercial</strong> aceita
        pelo cliente (&quot;CLIENTE&quot;), que o qualifica.
      </p>
      <p className="rounded-md border-l-2 border-primary bg-primary/5 px-3 py-2 text-xs">
        <strong>Versão {CONTRATO_VERSAO}.</strong> Este documento não é assinado
        individualmente: o aceite da Proposta Comercial vincula o CLIENTE a
        estes termos.
      </p>

      <ContratoClausulas />
    </LegalShell>
  )
}
