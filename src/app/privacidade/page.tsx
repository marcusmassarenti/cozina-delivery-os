import { LegalSection, LegalShell } from "@/components/legal/legal-shell"

export const metadata = { title: "Política de Privacidade — Delivery OS" }

/** Linha da tabela "dado → finalidade → base legal". */
function Linha({
  dados,
  finalidade,
  base,
}: {
  dados: string
  finalidade: string
  base: string
}) {
  return (
    <tr className="border-t align-top">
      <td className="py-2 pr-3">{dados}</td>
      <td className="py-2 pr-3">{finalidade}</td>
      <td className="py-2">{base}</td>
    </tr>
  )
}

export default function PrivacidadePage() {
  return (
    <LegalShell title="Política de Privacidade" updatedAt="25 de julho de 2026">
      <p>
        Esta Política explica como a <strong>LAB OF CHANGE LTDA</strong>,
        inscrita no CNPJ sob o nº <strong>38.613.971/0001-80</strong>{" "}
        (&quot;nós&quot; ou &quot;Delivery OS&quot;), coleta, usa, compartilha e
        protege dados pessoais na plataforma <strong>Delivery OS</strong>, em
        conformidade com a Lei nº 13.709/2018 (&quot;LGPD&quot;).
      </p>
      <p>
        Nosso objetivo é que você entenda, sem juridiquês, o que fazemos com os
        dados — e o que <em>não</em> fazemos.
      </p>

      <LegalSection n={1} title="Conceitos que usamos">
        <ul className="list-disc pl-5">
          <li>
            <strong>Dado pessoal:</strong> informação que identifica ou pode
            identificar uma pessoa natural (nome, e-mail, telefone, endereço,
            CPF).
          </li>
          <li>
            <strong>Titular:</strong> a pessoa a quem os dados se referem.
          </li>
          <li>
            <strong>Tratamento:</strong> qualquer operação com dados pessoais —
            coleta, armazenamento, uso, compartilhamento, eliminação.
          </li>
          <li>
            <strong>Controlador:</strong> quem decide como e por que os dados
            são tratados.
          </li>
          <li>
            <strong>Operador:</strong> quem trata os dados seguindo as
            instruções do Controlador.
          </li>
          <li>
            <strong>Cliente:</strong> a empresa que contrata o Delivery OS.
          </li>
          <li>
            <strong>Plataformas de Delivery:</strong> iFood, 99 Food, Keeta,
            Cardápio Web e similares, de onde os dados da operação são obtidos.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={2} title="Nossos dois papéis — leia esta parte">
        <p>
          Dependendo do dado, atuamos em papéis diferentes. Essa distinção
          define quem responde pelo quê:
        </p>
        <p>
          <strong>1) Somos Controladores</strong> dos dados de quem se relaciona
          diretamente conosco: usuários da Plataforma, representantes do
          Cliente, interessados que preenchem formulários no nosso site e nossos
          colaboradores. Aqui, somos nós que decidimos as finalidades.
        </p>
        <p>
          <strong>2) Somos Operadores</strong> dos dados pessoais de{" "}
          <strong>clientes finais do Cliente</strong> — os consumidores que
          fizeram pedidos nas lojas. Esses dados chegam até nós porque o Cliente
          conectou sua operação à Plataforma. Quem decide sobre eles é o{" "}
          <strong>Cliente, que atua como Controlador</strong>; nós apenas os
          processamos para entregar o serviço contratado.
        </p>
        <p>
          Se você é consumidor e quer exercer direitos sobre dados de um pedido
          que fez, o caminho é procurar <strong>a loja onde você comprou</strong>{" "}
          (ou a plataforma de delivery que usou). Podemos encaminhar sua
          solicitação, mas quem decide é o Controlador.
        </p>
      </LegalSection>

      <LegalSection n={3} title="A quem esta Política se aplica">
        <ul className="list-disc pl-5">
          <li>usuários com conta na Plataforma;</li>
          <li>
            representantes e contatos das empresas Clientes e de interessados em
            contratar;
          </li>
          <li>visitantes do nosso site e páginas públicas;</li>
          <li>
            consumidores finais cujos dados de pedido cheguem à Plataforma —
            observado o papel de Operador descrito acima.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={4} title="Dados que tratamos, para quê e com qual base legal">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="text-foreground">
              <tr>
                <th className="pb-2 pr-3 font-semibold">Dados</th>
                <th className="pb-2 pr-3 font-semibold">Finalidade</th>
                <th className="pb-2 font-semibold">Base legal (LGPD)</th>
              </tr>
            </thead>
            <tbody>
              <Linha
                dados="Nome, e-mail, telefone, empresa"
                finalidade="Contato comercial, demonstração e testes da Plataforma"
                base="Legítimo interesse (art. 7º, IX)"
              />
              <Linha
                dados="Nome, e-mail, senha (criptografada), perfil de acesso"
                finalidade="Criar e manter a conta, autenticar e controlar permissões"
                base="Execução de contrato (art. 7º, V)"
              />
              <Linha
                dados="Razão social, CNPJ, endereço, dados fiscais"
                finalidade="Contratação, faturamento e emissão de nota fiscal da assinatura"
                base="Execução de contrato (art. 7º, V) e obrigação legal (art. 7º, II)"
              />
              <Linha
                dados="Dados de cobrança da assinatura"
                finalidade="Processar o pagamento recorrente (feito pela Asaas)"
                base="Execução de contrato (art. 7º, V)"
              />
              <Linha
                dados="Dados operacionais da loja: vendas, pedidos, repasses, avaliações, cardápio"
                finalidade="Consolidar a operação e gerar painéis, relatórios e demonstrativos"
                base="Execução de contrato (art. 7º, V)"
              />
              <Linha
                dados="Nome, telefone, e-mail e endereço de consumidores finais, quando fornecidos pelas Plataformas de Delivery"
                finalidade="Exibir o pedido ao Cliente e permitir a gestão da operação dele"
                base="Tratados como Operador, conforme instrução do Cliente (Controlador)"
              />
              <Linha
                dados="Comentários de avaliações"
                finalidade="Análise de reputação e qualidade do atendimento"
                base="Tratados como Operador, conforme instrução do Cliente"
              />
              <Linha
                dados="Registros de acesso, IP, navegador, data e hora das ações"
                finalidade="Segurança, prevenção a fraude, auditoria e suporte"
                base="Obrigação legal (art. 7º, II) e legítimo interesse (art. 7º, IX)"
              />
              <Linha
                dados="Conteúdo das conversas com o assistente de IA"
                finalidade="Gerar as respostas solicitadas e manter o histórico para o usuário"
                base="Execução de contrato (art. 7º, V)"
              />
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          Não tratamos dados pessoais sensíveis (art. 5º, II, da LGPD) e não
          solicitamos esse tipo de informação.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Como obtemos os dados">
        <ul className="list-disc pl-5">
          <li>
            <strong>Você fornece:</strong> ao criar conta, contratar, preencher
            formulários ou falar com nosso suporte.
          </li>
          <li>
            <strong>Sua operação gera:</strong> ao usar a Plataforma
            (importações, lançamentos, configurações).
          </li>
          <li>
            <strong>As Plataformas de Delivery enviam:</strong> quando o Cliente
            autoriza a integração via API ou importa relatórios. Recebemos
            apenas dados das lojas que o Cliente conectou.
          </li>
          <li>
            <strong>Coleta automática:</strong> registros técnicos de acesso e
            cookies necessários ao funcionamento.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={6} title="Inteligência artificial">
        <p>
          Quando o usuário solicita um diagnóstico, um plano de ação ou conversa
          com o assistente, um recorte dos dados já existentes na conta
          (indicadores da loja, avaliações, produtos e histórico) é enviado ao
          nosso provedor de IA, a <strong>Anthropic</strong>, exclusivamente
          para gerar aquela resposta.
        </p>
        <p>
          <strong>Esses dados não são usados para treinar modelos de IA.</strong>{" "}
          O envio ocorre sob demanda, no momento em que o recurso é acionado.
        </p>
        <p>
          As respostas são geradas automaticamente e podem conter erros. Elas
          não tomam decisões sobre pessoas nem produzem efeitos jurídicos
          automáticos — apenas apoiam a análise do Cliente, que decide.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Com quem compartilhamos">
        <p>
          <strong>Não vendemos dados pessoais</strong> e não os cedemos para
          publicidade de terceiros. Compartilhamos apenas o necessário, com
          prestadores que atuam como operadores:
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Supabase</strong> — banco de dados, autenticação e
            armazenamento de arquivos;
          </li>
          <li>
            <strong>Vercel</strong> — hospedagem e execução da aplicação;
          </li>
          <li>
            <strong>Asaas</strong> — cobrança da assinatura e emissão de nota
            fiscal;
          </li>
          <li>
            <strong>Anthropic</strong> — modelo de IA que gera diagnósticos e
            respostas do assistente;
          </li>
          <li>
            <strong>Cloudflare</strong> — proteção contra acessos automatizados
            na tela de login;
          </li>
          <li>
            <strong>Plataformas de Delivery</strong> — das quais{" "}
            <em>recebemos</em> os dados da operação do Cliente.
          </li>
        </ul>
        <p>
          Também podemos compartilhar dados para cumprir obrigação legal, ordem
          judicial ou requisição de autoridade competente, e em caso de
          reorganização societária, mediante comunicação e mantida a proteção
          desta Política.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Transferência internacional">
        <p>
          Parte dos nossos prestadores processa dados em servidores fora do
          Brasil, principalmente nos <strong>Estados Unidos</strong>. Nesses
          casos, adotamos salvaguardas contratuais e técnicas para assegurar
          proteção compatível com a LGPD, conforme os arts. 33 a 36.
        </p>
        <p>
          A aplicação e o banco de dados principais são executados em região do
          Brasil sempre que a infraestrutura permite, para reduzir latência e
          exposição.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Segurança">
        <p>Adotamos medidas técnicas e organizacionais, entre elas:</p>
        <ul className="list-disc pl-5">
          <li>criptografia em trânsito (HTTPS) e no armazenamento;</li>
          <li>
            isolamento lógico entre empresas — uma conta não enxerga dados de
            outra;
          </li>
          <li>controle de acesso por perfil e permissão;</li>
          <li>
            proteção contra acessos automatizados e limitação de tentativas de
            login;
          </li>
          <li>
            segredos e credenciais mantidos fora do código-fonte, em cofre de
            variáveis de ambiente;
          </li>
          <li>
            registros de auditoria e backups periódicos com política de
            retenção.
          </li>
        </ul>
        <p>
          Nenhum sistema é totalmente inviolável. Mantemos processo de resposta
          a incidentes e revisamos periodicamente nossos controles.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Incidentes de segurança">
        <p>
          Se ocorrer incidente de segurança que possa acarretar risco ou dano
          relevante aos titulares, comunicaremos a{" "}
          <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong> e os
          titulares afetados em prazo razoável, informando a natureza dos dados,
          os riscos envolvidos e as medidas adotadas, nos termos do art. 48 da
          LGPD.
        </p>
        <p>
          Quando o incidente envolver dados em que atuamos como Operador,
          comunicaremos o Cliente (Controlador) para que ele cumpra seus
          próprios deveres legais.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Por quanto tempo guardamos">
        <ul className="list-disc pl-5">
          <li>
            <strong>Enquanto a conta estiver ativa:</strong> mantemos os dados
            necessários à prestação do serviço.
          </li>
          <li>
            <strong>Após o encerramento:</strong> o Cliente tem{" "}
            <strong>30 (trinta) dias corridos</strong> para exportar seus dados.
            Findo o prazo, eles são eliminados ou anonimizados.
          </li>
          <li>
            <strong>Guarda obrigatória:</strong> registros fiscais, contábeis e
            de acesso são mantidos pelos prazos exigidos em lei, ainda que a
            conta seja encerrada.
          </li>
          <li>
            <strong>Defesa de direitos:</strong> dados necessários ao exercício
            regular de direitos em processo judicial, administrativo ou arbitral
            podem ser retidos até o desfecho.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={12} title="Cookies">
        <p>
          Utilizamos <strong>apenas cookies necessários</strong> ao
          funcionamento da Plataforma — manter a sessão autenticada, lembrar
          preferências básicas como tema e idioma, e proteger o login contra
          acessos automatizados.
        </p>
        <p>
          <strong>Não utilizamos cookies de publicidade</strong> nem de
          rastreamento comportamental para terceiros. Como são essenciais,
          bloqueá-los pelo navegador pode impedir o acesso à sua conta.
        </p>
      </LegalSection>

      <LegalSection n={13} title="Seus direitos como titular">
        <p>Nos termos do art. 18 da LGPD, você pode solicitar:</p>
        <ul className="list-disc pl-5">
          <li>confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>
            anonimização, bloqueio ou eliminação de dados desnecessários,
            excessivos ou tratados em desconformidade com a lei;
          </li>
          <li>portabilidade a outro fornecedor, observados os limites legais;</li>
          <li>
            eliminação dos dados tratados com base em consentimento, quando
            aplicável;
          </li>
          <li>informação sobre com quem compartilhamos seus dados;</li>
          <li>
            informação sobre a possibilidade de não consentir e as
            consequências disso;
          </li>
          <li>revogação do consentimento, quando essa for a base legal;</li>
          <li>
            oposição a tratamento fundado em legítimo interesse, com análise do
            caso concreto.
          </li>
        </ul>
        <p>
          <strong>Como exercer:</strong> escreva para{" "}
          <a href="mailto:privacidade@deliveryos.food" className="underline">
            privacidade@deliveryos.food
          </a>{" "}
          informando seu nome, qual a sua relação com o Delivery OS (usuário,
          cliente, visitante, consumidor de uma loja), o direito que deseja
          exercer e uma descrição do pedido.
        </p>
        <p>
          Podemos solicitar informações adicionais para confirmar sua
          identidade — é uma proteção contra pedidos fraudulentos. Responderemos
          no menor prazo possível. Se você for consumidor final de uma loja,
          veja a seção 2: encaminharemos o pedido ao Controlador.
        </p>
      </LegalSection>

      <LegalSection n={14} title="Crianças e adolescentes">
        <p>
          A Plataforma é destinada ao uso profissional por maiores de 18 anos.
          Não coletamos intencionalmente dados de crianças e adolescentes. Se
          identificarmos coleta indevida, eliminaremos os dados.
        </p>
      </LegalSection>

      <LegalSection n={15} title="Encarregado pelo tratamento de dados (DPO)">
        <p>
          Para dúvidas, solicitações ou reclamações sobre proteção de dados,
          contate nosso Encarregado:{" "}
          <a href="mailto:privacidade@deliveryos.food" className="underline">
            privacidade@deliveryos.food
          </a>
          .
        </p>
        <p>
          Você também pode apresentar reclamação à Autoridade Nacional de
          Proteção de Dados (ANPD).
        </p>
      </LegalSection>

      <LegalSection n={16} title="Atualizações desta Política">
        <p>
          Podemos atualizar esta Política para refletir mudanças legais,
          técnicas ou de negócio. A versão vigente é sempre a publicada nesta
          página, com a data da última atualização no topo.
        </p>
        <p>
          Mudanças relevantes serão comunicadas pela Plataforma ou por e-mail,
          com antecedência razoável.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
