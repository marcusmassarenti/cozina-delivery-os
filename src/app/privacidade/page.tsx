import { LegalSection, LegalShell } from "@/components/legal/legal-shell"

export const metadata = { title: "Política de Privacidade — Delivery OS" }

export default function PrivacidadePage() {
  return (
    <LegalShell title="Política de Privacidade" updatedAt="11 de julho de 2026">
      <p>
        Esta Política descreve como a <strong>LAB OF CHANGE LTDA</strong>,
        inscrita no CNPJ sob o nº <strong>38.613.971/0001-80</strong>{" "}
        (&quot;nós&quot;), na qualidade de controladora, trata dados pessoais na
        plataforma <strong>Delivery OS</strong>, em conformidade com a Lei nº
        13.709/2018 (&quot;LGPD&quot;).
      </p>

      <LegalSection n={1} title="Quais dados tratamos">
        <ul className="list-disc pl-5">
          <li>
            <strong>Cadastro:</strong> nome, e-mail e perfil de acesso do
            usuário; senha (armazenada de forma criptografada pelo provedor de
            autenticação).
          </li>
          <li>
            <strong>Dados da empresa:</strong> razão social, CNPJ, lojas,
            marcas e configurações.
          </li>
          <li>
            <strong>Dados operacionais:</strong> pedidos, faturamento,
            avaliações, cardápio e indicadores importados das plataformas de
            delivery — relativos à operação do Cliente.
          </li>
          <li>
            <strong>Dados de pagamento:</strong> a assinatura é processada pela{" "}
            <strong>Asaas</strong>. Os dados do cartão são digitados no ambiente
            seguro da Asaas — <strong>não armazenamos o número do seu cartão</strong>.
          </li>
          <li>
            <strong>Dados de uso:</strong> registros de acesso (logs) e dados
            técnicos necessários à segurança e ao funcionamento.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={2} title="Para que usamos (finalidades e bases legais)">
        <ul className="list-disc pl-5">
          <li>
            <strong>Execução do contrato</strong> (art. 7º, V): prover, manter e
            operar a Plataforma para o Cliente.
          </li>
          <li>
            <strong>Legítimo interesse</strong> (art. 7º, IX): segurança,
            prevenção a fraudes, melhoria do serviço e suporte.
          </li>
          <li>
            <strong>Cumprimento de obrigação legal</strong> (art. 7º, II):
            quando exigido por lei ou autoridade competente.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={3} title="Inteligência artificial (Delivery OS AI)">
        <p>
          Quando você solicita um diagnóstico ou plano de ação, um recorte dos
          dados já presentes na sua conta (números da loja, funil, avaliações e
          produtos) é enviado ao nosso provedor de IA, a{" "}
          <strong>Anthropic</strong>, apenas para gerar a resposta.{" "}
          <strong>Esses dados não são usados para treinar modelos de IA.</strong>{" "}
          A geração é sob demanda e você controla quando utilizá-la.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Isolamento entre empresas">
        <p>
          A Plataforma é multiempresa, com isolamento lógico: os dados de uma
          empresa não são acessíveis por usuários de outra. Apenas o operador da
          plataforma, em caráter restrito e para fins de suporte e segurança,
          pode acessar dados de forma controlada.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Compartilhamento e operadores">
        <p>
          Não vendemos dados pessoais. Utilizamos prestadores que atuam como
          operadores, apenas para viabilizar o serviço:
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Supabase</strong> (banco de dados, autenticação e
            armazenamento de arquivos);
          </li>
          <li>
            <strong>Vercel</strong> (hospedagem da aplicação);
          </li>
          <li>
            <strong>Asaas</strong> (processamento de pagamento da assinatura);
          </li>
          <li>
            <strong>Anthropic</strong> (provedor do modelo de IA que gera o
            diagnóstico e o plano de ação);
          </li>
          <li>
            Plataformas de delivery (iFood, 99 Food, Keeta), das quais{" "}
            <em>recebemos</em> os dados da operação do Cliente.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={6} title="Transferência internacional">
        <p>
          Alguns operadores podem processar dados em servidores fora do Brasil.
          Nesses casos, adotamos medidas para assegurar proteção adequada,
          conforme os arts. 33 a 36 da LGPD.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Direitos do titular">
        <p>
          Nos termos do art. 18 da LGPD, o titular pode solicitar: confirmação e
          acesso aos dados; correção; anonimização, bloqueio ou eliminação;
          portabilidade; informação sobre compartilhamentos; e revogação de
          consentimento. Para exercer, escreva para{" "}
          <a href="mailto:privacidade@deliveryos.food" className="underline">
            privacidade@deliveryos.food
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection n={8} title="Retenção e eliminação">
        <p>
          Mantemos os dados enquanto a conta estiver ativa e pelo prazo
          necessário às finalidades acima ou ao cumprimento de obrigações
          legais. Encerrada a relação, os dados podem ser exportados a pedido e,
          em seguida, eliminados, ressalvadas as hipóteses de guarda legal.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Segurança">
        <p>
          Adotamos medidas técnicas e organizacionais para proteger os dados,
          incluindo controle de acesso por perfil, isolamento entre empresas,
          criptografia em trânsito e credenciais sensíveis fora do código. Nenhum
          sistema é 100% inviolável; em caso de incidente relevante, agiremos
          conforme a LGPD.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Cookies">
        <p>
          Utilizamos apenas cookies necessários ao funcionamento (ex.: manter a
          sessão autenticada). Não utilizamos cookies de publicidade.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Encarregado (DPO) e contato">
        <p>
          Para assuntos de privacidade e proteção de dados, contate o
          Encarregado:{" "}
          <a href="mailto:privacidade@deliveryos.food" className="underline">
            privacidade@deliveryos.food
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection n={12} title="Alterações">
        <p>
          Esta Política pode ser atualizada. Mudanças relevantes serão
          comunicadas pela Plataforma, com indicação da data de atualização.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
