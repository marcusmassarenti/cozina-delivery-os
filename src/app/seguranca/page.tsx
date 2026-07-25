import type { Metadata } from "next"

import { LegalShell, LegalSection } from "@/components/legal/legal-shell"

export const metadata: Metadata = {
  title: "Segurança dos seus dados · Delivery OS",
  description:
    "Como o Delivery OS protege os dados da sua operação: isolamento entre empresas, criptografia, acesso às plataformas sem senha, LGPD e continuidade.",
}

export default function SegurancaPage() {
  return (
    <LegalShell
      title="Segurança dos seus dados"
      updatedAt="25 de julho de 2026"
    >
      <p>
        O Delivery OS guarda números sensíveis da sua operação — faturamento,
        repasses, custos e avaliações. Esta página explica, em português claro,
        como protegemos essas informações e{" "}
        <strong>o que ainda não fazemos</strong>. Preferimos ser exatos a
        parecer impressionantes.
      </p>

      <LegalSection n={1} title="Cada empresa enxerga só os próprios dados">
        <p>
          A separação entre empresas não depende de alguém lembrar de filtrar
          uma consulta: ela é aplicada <strong>no próprio banco de dados</strong>,
          por regras de acesso por linha (RLS). Hoje,{" "}
          <strong>100% das tabelas</strong> do sistema têm essas regras ativas,
          todas amarradas ao vínculo do usuário com a empresa.
        </p>
        <p>
          Na prática: mesmo que uma consulta fosse escrita errada, o banco não
          devolveria dados de outro cliente.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Nunca pedimos a senha das suas contas">
        <p>
          Para trazer os dados do iFood, 99 Food, Keeta ou Cardápio Web, existem
          dois caminhos — e <strong>nenhum deles envolve nos dar sua senha</strong>:
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Envio de relatórios:</strong> você sobe os arquivos que já
            baixa hoje do portal.
          </li>
          <li>
            <strong>Conexão por API:</strong> você autoriza o aplicativo Delivery
            OS <em>dentro do portal oficial da plataforma</em>. A autorização é
            sua, nominal, e{" "}
            <strong>você pode revogá-la quando quiser</strong>, direto no portal
            — a sincronização para na hora.
          </li>
        </ul>
        <p>
          Com a conexão por API, acessamos <strong>somente leitura</strong> dos
          dados das lojas que você conectou. Não alteramos cardápio, preços,
          status da loja nem pedidos.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Criptografia">
        <p>
          Todo o tráfego entre o seu navegador e o sistema usa conexão segura
          (HTTPS/TLS). Os dados armazenados ficam em banco com{" "}
          <strong>criptografia em repouso</strong>, e as cópias de segurança
          seguem o mesmo padrão.
        </p>
        <p>
          Senhas nunca são guardadas em texto: o provedor de autenticação
          armazena apenas um resumo criptográfico, que não permite recuperar a
          senha original.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Proteção do acesso">
        <p>Para dificultar invasão de contas:</p>
        <ul className="list-disc pl-5">
          <li>
            <strong>verificação em duas etapas (2FA)</strong> disponível para
            qualquer usuário, com aplicativo autenticador — ative em{" "}
            <em>Minha conta → Segurança</em>. Com ela, saber sua senha não basta
            para entrar. Você recebe <strong>8 códigos de recuperação</strong>{" "}
            de uso único para o caso de perder o celular;
          </li>
          <li>
            a tela de login é protegida contra robôs por verificação do
            Cloudflare, quase sempre invisível para você;
          </li>
          <li>
            tentativas de login são limitadas por origem, o que trava ataques de
            força bruta;
          </li>
          <li>
            cada usuário tem credencial própria e permissões conforme o papel —
            quem só precisa ver relatório não recebe acesso ao financeiro;
          </li>
          <li>
            o navegador recebe uma política de conteúdo restritiva, que reduz o
            risco de scripts maliciosos.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={5} title="Quem, do nosso lado, pode ver seus dados">
        <p>
          Vamos ser diretos: <strong>existe acesso administrativo</strong>. Ele
          é necessário para dar suporte, investigar um número que não fecha,
          corrigir uma importação e operar a cobrança.
        </p>
        <p>
          Esse acesso é <strong>restrito à equipe do Delivery OS</strong>,
          usado apenas quando necessário para operar o serviço ou atender um
          chamado seu, e as pessoas com acesso têm dever de sigilo. As chamadas
          às integrações ficam registradas.
        </p>
        <p>
          Nenhum outro cliente, em nenhuma hipótese, enxerga a sua operação.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Inteligência artificial">
        <p>
          Quando você pede um diagnóstico ou conversa com o assistente, um
          recorte dos seus números é enviado ao provedor de IA apenas para gerar
          aquela resposta.{" "}
          <strong>Esses dados não são usados para treinar modelos.</strong>
        </p>
        <p>
          O conteúdo que vem das plataformas — comentários de avaliação, por
          exemplo — é tratado pela IA como <em>informação a analisar</em>, nunca
          como comando. Isso evita que um texto escrito por terceiros consiga
          manipular o comportamento do assistente.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Com quem compartilhamos (e com quem não)">
        <p>
          <strong>Não vendemos seus dados</strong> e não os usamos para
          publicidade — nossa nem de ninguém. Também não compartilhamos sua
          operação com outros clientes.
        </p>
        <p>
          Para o serviço funcionar, usamos fornecedores de infraestrutura que
          processam dados por nossa conta: hospedagem, banco de dados, cobrança,
          proteção do login e o provedor de IA. Todos estão{" "}
          <strong>nomeados</strong> no{" "}
          <a href="/tratamento-de-dados" className="underline">
            Anexo de Tratamento de Dados
          </a>
          , e mudanças nessa lista são avisadas com 30 dias de antecedência.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Backup e continuidade">
        <p>
          O banco de dados tem <strong>backup diário automático</strong>, com
          retenção que permite voltar a um ponto anterior. Além disso, geramos
          cópias periódicas das configurações críticas ao longo do dia.
        </p>
        <p>
          Mantemos um procedimento de recuperação documentado, para que a
          restauração não dependa de improviso na hora do problema.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Como o sistema é construído">
        <ul className="list-disc pl-5">
          <li>
            chaves e segredos ficam <strong>fora do código-fonte</strong>, em
            cofre de variáveis de ambiente — nunca em repositório;
          </li>
          <li>
            webhooks de pagamento e de plataformas exigem assinatura válida e
            são rejeitados por padrão quando não conseguem ser verificados;
          </li>
          <li>
            rotinas automáticas exigem credencial própria para executar;
          </li>
          <li>
            arquivos enviados são conferidos pelo conteúdo real, não apenas pela
            extensão do nome;
          </li>
          <li>
            verificações de segurança rodam automaticamente a cada alteração,
            antes de o código chegar à produção.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={10} title="LGPD e seus direitos">
        <p>
          Tratamos dados conforme a Lei Geral de Proteção de Dados. Você pode
          pedir acesso, correção, portabilidade ou exclusão a qualquer momento
          pelo e-mail{" "}
          <a href="mailto:privacidade@deliveryos.food" className="underline">
            privacidade@deliveryos.food
          </a>
          .
        </p>
        <p>
          Sobre os dados dos <strong>seus</strong> clientes finais, quem decide é
          você — nós apenas processamos, seguindo suas instruções. As regras
          estão na{" "}
          <a href="/privacidade" className="underline">
            Política de Privacidade
          </a>{" "}
          e no{" "}
          <a href="/tratamento-de-dados" className="underline">
            Anexo de Tratamento de Dados
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection n={11} title="Seus dados não ficam presos aqui">
        <p>
          Você pode exportar suas informações enquanto a conta estiver ativa. Se
          cancelar, tem <strong>30 dias corridos</strong> para exportar tudo;
          depois disso os dados são eliminados ou anonimizados, salvo o que a
          lei obriga a guardar.
        </p>
        <p>
          Recomendamos exportar o que você precisa <em>antes</em> de cancelar.
        </p>
      </LegalSection>

      <LegalSection n={12} title="O que ainda não temos">
        <p>
          Nenhum sistema é inviolável, e achamos honesto dizer onde estamos:
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>O 2FA é opcional, não obrigatório.</strong> Cada usuário
            decide ativar. Não forçamos a rede inteira porque o segundo fator
            depende de um aparelho, e aparelho se perde — preferimos que a
            adoção seja consciente a criar bloqueios em massa.
          </li>
          <li>
            <strong>Não temos certificação formal</strong> (ISO 27001, SOC 2).
            Somos uma operação enxuta e preferimos declarar isso a sugerir o
            contrário.
          </li>
        </ul>
        <p>
          Nossa postura de segurança é revisada periodicamente e evolui junto com
          o produto.
        </p>
      </LegalSection>

      <LegalSection n={13} title="Encontrou uma falha? Conte pra gente">
        <p>
          Se você identificar uma vulnerabilidade, escreva para{" "}
          <a href="mailto:seguranca@deliveryos.food" className="underline">
            seguranca@deliveryos.food
          </a>{" "}
          com os detalhes para reproduzir. Analisamos todo relato de boa-fé,
          respondemos e corrigimos o que for procedente — sem retaliação a quem
          reporta de forma responsável.
        </p>
        <p>
          Dúvidas gerais de segurança:{" "}
          <a href="mailto:contato@deliveryos.food" className="underline">
            contato@deliveryos.food
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  )
}
