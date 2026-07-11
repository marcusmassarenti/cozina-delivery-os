import { LegalSection, LegalShell } from "@/components/legal/legal-shell"

export const metadata = { title: "Termos de Uso — Delivery OS" }

export default function TermosPage() {
  return (
    <LegalShell title="Termos de Uso" updatedAt="11 de julho de 2026">
      <p>
        Estes Termos de Uso (&quot;Termos&quot;) regem o acesso e a utilização da
        plataforma <strong>Delivery OS</strong> (&quot;Plataforma&quot;),
        operada por <strong>LAB OF CHANGE LTDA</strong>, inscrita no CNPJ sob o
        nº <strong>38.613.971/0001-80</strong> (&quot;nós&quot;). Ao acessar ou
        usar a Plataforma, você (&quot;Cliente&quot; ou &quot;Usuário&quot;)
        concorda com estes Termos. Se não concordar, não utilize a Plataforma.
      </p>

      <LegalSection n={1} title="Objeto">
        <p>
          A Plataforma é um sistema de gestão e monitoramento de operações de
          delivery, que consolida dados de plataformas terceiras (iFood, 99
          Food, Keeta e outras), relatórios financeiros, pedidos, avaliações e
          indicadores operacionais, permitindo a visualização e a análise
          dessas informações pelo Cliente.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Cadastro e conta">
        <p>
          O acesso é feito por conta individual, protegida por e-mail e senha.
          O Usuário é responsável por manter a confidencialidade de suas
          credenciais e por todas as atividades realizadas em sua conta. O
          Cliente deve fornecer informações verdadeiras e mantê-las atualizadas.
        </p>
        <p>
          Cada empresa (&quot;tenant&quot;) tem seu ambiente isolado; um Usuário
          só acessa os dados da empresa à qual está vinculado.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Uso aceitável">
        <p>O Usuário compromete-se a não:</p>
        <ul className="list-disc pl-5">
          <li>utilizar a Plataforma para fins ilícitos ou não autorizados;</li>
          <li>
            tentar acessar dados de outras empresas, contornar mecanismos de
            segurança ou de isolamento;
          </li>
          <li>
            sobrecarregar, prejudicar ou interferir no funcionamento da
            Plataforma ou de sua infraestrutura;
          </li>
          <li>
            reproduzir, revender ou sublicenciar a Plataforma sem autorização.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={4} title="Dados do Cliente">
        <p>
          Os dados operacionais e financeiros inseridos ou importados pelo
          Cliente são de <strong>titularidade do Cliente</strong>. Concedemos
          ao Cliente acesso a esses dados enquanto a conta estiver ativa.
          Tratamos esses dados conforme a{" "}
          <a href="/privacidade" className="underline">
            Política de Privacidade
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection n={5} title="Assinatura, pagamento e cancelamento">
        <p>
          Os planos e valores vigentes são apresentados na Plataforma. A
          cobrança da assinatura é recorrente e processada pela{" "}
          <strong>Asaas</strong>. Você pode cancelar a qualquer momento, sem
          multa; o acesso permanece até o fim do período já pago.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Propriedade intelectual">
        <p>
          A Plataforma, seu código, design, marcas e funcionalidades são de
          propriedade da LAB OF CHANGE LTDA. Estes Termos não transferem
          qualquer direito de propriedade intelectual sobre a Plataforma ao
          Cliente.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Integrações de terceiros">
        <p>
          A Plataforma pode se conectar a serviços de terceiros (ex.: iFood, 99
          Food, Keeta). Não nos responsabilizamos por indisponibilidades,
          alterações ou conteúdos desses serviços, que possuem termos próprios.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Disponibilidade e limitação de responsabilidade">
        <p>
          Empregamos esforços razoáveis para manter a Plataforma disponível e
          segura, mas ela é fornecida &quot;no estado em que se encontra&quot;,
          sem garantia de operação ininterrupta ou livre de erros. Na máxima
          extensão permitida pela lei, não respondemos por danos indiretos,
          lucros cessantes ou perda de dados decorrentes do uso da Plataforma.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Vigência e encerramento">
        <p>
          Estes Termos vigoram enquanto a conta estiver ativa. Podemos suspender
          ou encerrar o acesso em caso de violação destes Termos. Encerrada a
          conta, o Cliente pode solicitar a exportação ou a exclusão de seus
          dados, conforme a Política de Privacidade.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Alterações">
        <p>
          Podemos atualizar estes Termos a qualquer momento. Alterações
          relevantes serão comunicadas pela Plataforma. O uso continuado após a
          atualização implica concordância com a nova versão.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Lei aplicável e foro">
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil.
          Fica eleito o foro da comarca da sede da LAB OF CHANGE LTDA para
          dirimir controvérsias, salvo disposição legal em contrário.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Contato">
        <p>
          Dúvidas sobre estes Termos:{" "}
          <a href="mailto:contato@deliveryos.food" className="underline">
            contato@deliveryos.food
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  )
}
