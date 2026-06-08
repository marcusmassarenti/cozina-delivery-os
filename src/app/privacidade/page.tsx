import { LegalSection, LegalShell } from "@/components/legal/legal-shell"

export const metadata = { title: "Política de Privacidade — Cozina Delivery OS" }

export default function PrivacidadePage() {
  return (
    <LegalShell title="Política de Privacidade" updatedAt="8 de junho de 2026">
      <p>
        Esta Política descreve como a <strong>Cozina Foods</strong>{" "}
        (&quot;nós&quot;), na qualidade de controladora, trata dados pessoais na
        plataforma <strong>Cozina Delivery OS</strong>, em conformidade com a
        Lei nº 13.709/2018 (&quot;LGPD&quot;).
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

      <LegalSection n={3} title="Isolamento entre empresas">
        <p>
          A Plataforma é multiempresa, com isolamento lógico: os dados de uma
          empresa não são acessíveis por usuários de outra. Apenas o operador da
          plataforma, em caráter restrito e para fins de suporte e segurança,
          pode acessar dados de forma controlada.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Compartilhamento e operadores">
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
            Plataformas de delivery (iFood, 99 Food, Keeta), das quais{" "}
            <em>recebemos</em> os dados da operação do Cliente.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={5} title="Transferência internacional">
        <p>
          Alguns operadores podem processar dados em servidores fora do Brasil.
          Nesses casos, adotamos medidas para assegurar proteção adequada,
          conforme os arts. 33 a 36 da LGPD.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Direitos do titular">
        <p>
          Nos termos do art. 18 da LGPD, o titular pode solicitar: confirmação e
          acesso aos dados; correção; anonimização, bloqueio ou eliminação;
          portabilidade; informação sobre compartilhamentos; e revogação de
          consentimento. Para exercer, escreva para{" "}
          <a href="mailto:privacidade@cozinafoods.com" className="underline">
            privacidade@cozinafoods.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection n={7} title="Retenção e eliminação">
        <p>
          Mantemos os dados enquanto a conta estiver ativa e pelo prazo
          necessário às finalidades acima ou ao cumprimento de obrigações
          legais. Encerrada a relação, os dados podem ser exportados a pedido e,
          em seguida, eliminados, ressalvadas as hipóteses de guarda legal.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Segurança">
        <p>
          Adotamos medidas técnicas e organizacionais para proteger os dados,
          incluindo controle de acesso por perfil, isolamento entre empresas,
          criptografia em trânsito e credenciais sensíveis fora do código. Nenhum
          sistema é 100% inviolável; em caso de incidente relevante, agiremos
          conforme a LGPD.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Cookies">
        <p>
          Utilizamos apenas cookies necessários ao funcionamento (ex.: manter a
          sessão autenticada). Não utilizamos cookies de publicidade.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Encarregado (DPO) e contato">
        <p>
          Para assuntos de privacidade e proteção de dados, contate o
          Encarregado:{" "}
          <a href="mailto:privacidade@cozinafoods.com" className="underline">
            privacidade@cozinafoods.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection n={11} title="Alterações">
        <p>
          Esta Política pode ser atualizada. Mudanças relevantes serão
          comunicadas pela Plataforma, com indicação da data de atualização.
        </p>
      </LegalSection>

      <p className="mt-4 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        Documento-modelo. Confirme os dados do controlador (razão social, CNPJ,
        endereço), o Encarregado (DPO) e a lista de operadores, e submeta o texto
        à revisão jurídica antes do uso comercial.
      </p>
    </LegalShell>
  )
}
