import type { Metadata } from "next"

import { LegalShell, LegalSection } from "@/components/legal/legal-shell"

export const metadata: Metadata = {
  title: "Segurança dos seus dados · Delivery OS",
  description:
    "Como o Delivery OS protege e trata os dados da sua operação: isolamento entre empresas, criptografia, LGPD e mais.",
}

export default function SegurancaPage() {
  return (
    <LegalShell title="Seus dados estão seguros" updatedAt="junho de 2026">
      <p>
        O Delivery OS cuida de números sensíveis da sua operação — faturamento,
        repasses, pedidos e custos. Levamos isso a sério. Aqui está, em
        português claro, como a gente protege e trata os seus dados.
      </p>

      <LegalSection n={1} title="Cada empresa vê só os próprios dados">
        <p>
          Os dados de cada empresa são <strong>isolados</strong>. Um cliente
          nunca enxerga a operação de outro — nem as lojas, nem os números, nem
          os relatórios. Essa separação é garantida no próprio código, em todas
          as telas, e não depende de ninguém lembrar de filtrar.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Você não dá senha de nada">
        <p>
          Você sobe os relatórios que <strong>já baixa hoje</strong> do iFood, 99
          Food e Keeta. A gente <strong>não pede</strong> a senha das suas contas
          nas plataformas, nem login de banco, nem acesso que possa colocar sua
          conta em risco. Sem robôs entrando no seu lugar.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Tudo trafega e fica criptografado">
        <p>
          A comunicação com o sistema é sempre por conexão segura (HTTPS/TLS), e
          os dados ficam guardados em banco <strong>criptografado em repouso</strong>.
          Mesmo a equipe de infraestrutura não vê suas informações “abertas”.
        </p>
      </LegalSection>

      <LegalSection n={4} title="A gente nunca compartilha nem vende">
        <p>
          Seus números são seus. <strong>Não vendemos</strong> e{" "}
          <strong>não compartilhamos</strong> seus dados com terceiros para
          publicidade ou qualquer outra finalidade. Usamos apenas para entregar o
          serviço pra você.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Controle de acesso por pessoa">
        <p>
          Cada usuário só acessa o que o papel dele permite. O administrador da
          plataforma cuida de cobrança e suporte em uma área separada —{" "}
          <strong>não usa isso para bisbilhotar a sua operação</strong>; a visão
          do dia a dia continua restrita à sua empresa.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Em conformidade com a LGPD">
        <p>
          Tratamos os dados de acordo com a Lei Geral de Proteção de Dados
          (LGPD). Você pode pedir <strong>acesso, correção ou exclusão</strong>{" "}
          dos seus dados quando quiser. Veja também a nossa Política de
          Privacidade.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Infraestrutura confiável e com backup">
        <p>
          Rodamos em provedores de primeira linha (banco de dados gerenciado e
          hospedagem na nuvem), com <strong>backups</strong> e monitoramento.
          Se algo falhar de um lado, seus dados não se perdem.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Você no controle dos seus dados">
        <p>
          A qualquer momento você pode pedir a <strong>exportação</strong> ou a{" "}
          <strong>exclusão</strong> dos seus dados. Cancelou o serviço? A gente
          remove. Seus dados não ficam “presos” na plataforma.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Tem alguma dúvida de segurança?">
        <p>
          Fala com a gente — é só clicar no botão de ajuda dentro do sistema, ou
          escrever pelos nossos canais de atendimento. A gente responde.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
