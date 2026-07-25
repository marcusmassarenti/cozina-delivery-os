import { LegalSection, LegalShell } from "@/components/legal/legal-shell"

export const metadata = { title: "Termos de Uso — Delivery OS" }

export default function TermosPage() {
  return (
    <LegalShell title="Termos de Uso" updatedAt="25 de julho de 2026">
      <p>
        Estes Termos de Uso (&quot;Termos&quot;) regem o acesso e a utilização
        da plataforma <strong>Delivery OS</strong> (&quot;Plataforma&quot;),
        operada por <strong>LAB OF CHANGE LTDA</strong>, inscrita no CNPJ sob o
        nº <strong>38.613.971/0001-80</strong> (&quot;nós&quot; ou
        &quot;Delivery OS&quot;). Ao criar uma conta, contratar um plano ou
        utilizar a Plataforma, o Cliente declara que leu, entendeu e concorda
        integralmente com estes Termos. Se não concordar, não utilize a
        Plataforma.
      </p>
      <p>
        Recomendamos a leitura na íntegra: o aceite é condição para o cadastro e
        para o uso da Plataforma.
      </p>

      <LegalSection n={1} title="Definições">
        <ul className="list-disc pl-5">
          <li>
            <strong>Cliente:</strong> pessoa jurídica (ou pessoa física
            empresária) que contrata a Plataforma para gerir sua operação de
            delivery.
          </li>
          <li>
            <strong>Usuário:</strong> pessoa física autorizada pelo Cliente a
            acessar a Plataforma com credenciais próprias.
          </li>
          <li>
            <strong>Loja / Unidade:</strong> cada estabelecimento do Cliente
            cadastrado na Plataforma.
          </li>
          <li>
            <strong>Plataformas de Delivery:</strong> serviços de terceiros dos
            quais os dados são obtidos, como iFood, 99 Food, Keeta e Cardápio
            Web.
          </li>
          <li>
            <strong>Dados do Cliente:</strong> informações operacionais,
            financeiras e cadastrais inseridas pelo Cliente ou obtidas das
            Plataformas de Delivery em nome dele.
          </li>
          <li>
            <strong>Integração via API:</strong> conexão autorizada pelo Cliente
            que permite à Plataforma obter dados diretamente das Plataformas de
            Delivery, sem envio manual de arquivos.
          </li>
          <li>
            <strong>Plano:</strong> modalidade de assinatura contratada, com as
            funcionalidades e o preço vigentes no momento da contratação.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={2} title="Objeto e natureza do serviço">
        <p>
          A Plataforma é um sistema de <strong>gestão e análise</strong> da
          operação de delivery: consolida dados de vendas, financeiro, pedidos,
          avaliações, cardápio e indicadores das Plataformas de Delivery, e os
          apresenta em painéis, relatórios e demonstrativos.
        </p>
        <p>
          <strong>O que a Plataforma não é:</strong> não somos plataforma de
          vendas, marketplace, intermediadora de pagamentos dos pedidos do
          Cliente, nem prestadora de serviços contábeis, fiscais, jurídicos ou
          de consultoria financeira. Os relatórios e demonstrativos (incluindo
          DRE e fluxo de caixa) são <strong>ferramentas de apoio à gestão</strong>{" "}
          e não substituem a escrituração contábil, a apuração fiscal ou o
          parecer de profissional habilitado.
        </p>
        <p>
          As decisões de negócio tomadas a partir das informações da Plataforma
          são de responsabilidade exclusiva do Cliente.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Cadastro, conta e credenciais">
        <p>
          O acesso é feito por conta individual protegida por e-mail e senha. O
          Cliente é responsável por definir quais Usuários terão acesso e qual
          perfil de permissão cada um receberá.
        </p>
        <p>
          O Usuário é responsável por manter suas credenciais em sigilo e
          responde por todas as atividades realizadas em sua conta. O Cliente
          deve nos comunicar imediatamente qualquer uso não autorizado.
        </p>
        <p>
          Cada empresa possui ambiente logicamente isolado: um Usuário só
          acessa dados da empresa à qual está vinculado.
        </p>
        <p>
          O Cliente é o único responsável pela veracidade e atualização das
          informações cadastradas, inclusive dados fiscais utilizados na
          emissão de documentos da assinatura.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Integrações com as Plataformas de Delivery">
        <p>
          A Plataforma pode obter os dados do Cliente de duas formas: por{" "}
          <strong>importação de arquivos</strong> enviados pelo Cliente ou por{" "}
          <strong>Integração via API</strong>, quando o Cliente autoriza
          expressamente a conexão.
        </p>
        <p>
          A Integração via API depende de autorização concedida pelo próprio
          Cliente no portal da Plataforma de Delivery correspondente. O Cliente
          declara ter poderes para conceder tal autorização e pode revogá-la a
          qualquer momento, diretamente naquele portal — hipótese em que a
          sincronização automática cessa.
        </p>
        <p>
          Acessamos exclusivamente os dados necessários às finalidades da
          Plataforma e apenas das lojas que o Cliente conectou. Não realizamos,
          por meio dessas integrações, alterações no cardápio, nos preços, no
          status da loja ou em pedidos, salvo funcionalidade expressamente
          contratada e informada.
        </p>
        <p>
          <strong>Dependência de terceiros:</strong> as Plataformas de Delivery
          são independentes de nós e possuem termos próprios. Não respondemos
          por indisponibilidade, lentidão, alteração, descontinuação, mudança de
          regras ou suspensão da conta do Cliente nesses serviços, nem por
          divergências, atrasos ou inconsistências nos dados por elas
          fornecidos. Falhas dessa natureza não geram direito a abatimento,
          suspensão de pagamento ou indenização.
        </p>
        <p>
          Sempre que houver divergência entre a Plataforma e o portal oficial da
          Plataforma de Delivery, <strong>prevalece o portal oficial</strong>{" "}
          como fonte da informação.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Recursos de inteligência artificial">
        <p>
          A Plataforma oferece recursos de inteligência artificial (como o
          assistente e os diagnósticos automáticos) que analisam os dados já
          presentes na conta do Cliente e geram textos, sugestões e planos de
          ação.
        </p>
        <p>
          Esses recursos são <strong>apoio à decisão</strong>, produzidos por
          modelos estatísticos que <strong>podem conter erros, imprecisões ou
          omissões</strong>. Não constituem aconselhamento contábil, fiscal,
          jurídico, financeiro ou de investimento. O Cliente deve conferir as
          informações antes de agir com base nelas.
        </p>
        <p>
          O uso desses recursos pode estar limitado a determinados Planos e
          sujeito a cotas de utilização, informadas na Plataforma. O tratamento
          de dados envolvido está descrito na Política de Privacidade.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Obrigações do Cliente">
        <p>O Cliente obriga-se a:</p>
        <ul className="list-disc pl-5">
          <li>
            utilizar a Plataforma conforme estes Termos e a legislação
            aplicável;
          </li>
          <li>
            garantir a veracidade dos dados cadastrados e conferir as
            informações antes de utilizá-las para decisões, obrigações fiscais
            ou prestação de contas;
          </li>
          <li>
            assegurar que possui autorização para conectar as contas das
            Plataformas de Delivery e para enviar os arquivos que importa;
          </li>
          <li>
            garantir que apenas pessoas autorizadas acessem a Plataforma, e
            revogar acessos de quem deixar sua equipe;
          </li>
          <li>
            manter dispositivos, conexão de internet e navegador atualizados e
            adequados ao uso;
          </li>
          <li>
            não utilizar a Plataforma para fins ilícitos, ofensivos ou
            fraudulentos;
          </li>
          <li>
            não tentar acessar dados de outras empresas, contornar mecanismos de
            segurança ou de isolamento entre contas;
          </li>
          <li>
            não sobrecarregar, prejudicar ou interferir no funcionamento da
            Plataforma ou de sua infraestrutura, inclusive por automações não
            autorizadas, raspagem de dados ou volume anormal de requisições;
          </li>
          <li>
            não reproduzir, descompilar, aplicar engenharia reversa, revender ou
            sublicenciar a Plataforma;
          </li>
          <li>
            cumprir a legislação de proteção de dados quanto às informações de
            seus próprios clientes que venham a ser tratadas na Plataforma.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={7} title="Nossas obrigações e suporte">
        <p>Comprometemo-nos a:</p>
        <ul className="list-disc pl-5">
          <li>
            envidar esforços razoáveis para manter a Plataforma disponível e
            funcional;
          </li>
          <li>
            corrigir falhas identificadas e realizar melhorias, podendo, para
            isso, suspender temporariamente o serviço para manutenção — quando
            programada, com aviso prévio sempre que possível;
          </li>
          <li>
            manter os dados do Cliente em ambiente seguro, conforme a Política
            de Privacidade;
          </li>
          <li>
            prestar suporte por <strong>e-mail e WhatsApp</strong>, em dias
            úteis, das <strong>9h às 18h</strong> (horário de Brasília), para
            dúvidas relacionadas ao uso da Plataforma.
          </li>
        </ul>
        <p>
          O suporte não abrange consultoria de gestão, contabilidade,
          configuração de equipamentos de terceiros ou atendimento às
          Plataformas de Delivery.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Planos, pagamento e reajuste">
        <p>
          Os Planos, funcionalidades e valores vigentes são apresentados na
          Plataforma no momento da contratação. A cobrança é{" "}
          <strong>recorrente e antecipada</strong>, processada pela{" "}
          <strong>Asaas</strong>, e dá acesso às funcionalidades do Plano
          durante o período contratado.
        </p>
        <p>
          <strong>Atraso.</strong> O não pagamento na data de vencimento sujeita
          o Cliente a juros de 1% ao mês e multa de 2% sobre o valor em atraso.
          Persistindo a inadimplência, poderemos{" "}
          <strong>suspender o acesso</strong> à Plataforma, mediante aviso, até
          a regularização. A suspensão não interrompe a contagem do período
          contratado.
        </p>
        <p>
          <strong>Reajuste.</strong> Os valores são reajustados{" "}
          <strong>anualmente pela variação positiva do IPCA/IBGE</strong> (ou
          índice que o substitua), a contar da data de contratação, com
          comunicação prévia ao Cliente.
        </p>
        <p>
          <strong>Alteração de preços e planos.</strong> Podemos alterar
          Planos, funcionalidades e valores, comunicando previamente o Cliente.
          As alterações valem a partir do ciclo de assinatura seguinte. O
          Cliente que não concordar pode cancelar antes da renovação, sem ônus.
        </p>
        <p>
          <strong>Renovação automática.</strong> A assinatura renova-se
          automaticamente ao final de cada ciclo, salvo cancelamento na forma da
          cláusula 9.
        </p>
        <p>
          Descontos e condições promocionais são concedidos por liberalidade,
          válidos pelo prazo e nas condições informadas, e não se incorporam ao
          contrato.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Cancelamento, arrependimento e encerramento">
        <p>
          <strong>Cancelamento pelo Cliente.</strong> O Cliente pode cancelar a
          assinatura a qualquer momento, sem multa. O acesso permanece ativo até
          o fim do período já pago, não havendo reembolso proporcional do ciclo
          em curso.
        </p>
        <p>
          <strong>Direito de arrependimento.</strong> Nos{" "}
          <strong>7 (sete) dias corridos</strong> seguintes à contratação
          inicial, o Cliente pode desistir e receber a devolução integral do
          valor pago. A devolução é feita pelo mesmo meio de pagamento; quando
          inviável, por PIX informado pelo Cliente, que responde pela veracidade
          dos dados fornecidos. Pagamentos com cartão seguem os prazos da
          administradora.
        </p>
        <p>
          <strong>Encerramento por nós.</strong> Podemos suspender ou encerrar o
          acesso, com aviso prévio de 30 (trinta) dias e devolução proporcional
          dos valores pagos e não usufruídos. Independentemente de aviso e sem
          direito a reembolso, podemos encerrar imediatamente em caso de: (i)
          violação destes Termos; (ii) inadimplência superior a 30 (trinta)
          dias; (iii) uso fraudulento, ilícito ou que comprometa a segurança da
          Plataforma ou de outros Clientes; (iv) falsidade nas declarações
          prestadas.
        </p>
        <p>
          <strong>Dados após o encerramento.</strong> O Cliente terá{" "}
          <strong>30 (trinta) dias corridos</strong>, contados do encerramento,
          para exportar seus dados pela Plataforma ou solicitar a exportação.
          Findo esse prazo, os dados poderão ser eliminados, ressalvadas as
          hipóteses de guarda obrigatória por lei. Recomendamos que o Cliente
          exporte o que precisar antes de cancelar.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Propriedade intelectual">
        <p>
          A Plataforma — incluindo código-fonte, arquitetura, design, marcas,
          textos, layouts, relatórios, metodologias de cálculo e demais
          elementos — é de titularidade exclusiva da LAB OF CHANGE LTDA e
          protegida pela legislação de propriedade intelectual.
        </p>
        <p>
          Estes Termos concedem ao Cliente apenas uma{" "}
          <strong>licença de uso não exclusiva, intransferível e revogável</strong>,
          limitada à vigência da assinatura e às finalidades aqui previstas.
          Nenhum direito de propriedade intelectual é transferido.
        </p>
        <p>
          É vedado copiar, modificar, descompilar, aplicar engenharia reversa,
          remover avisos de titularidade ou explorar comercialmente qualquer
          parte da Plataforma sem autorização prévia e expressa.
        </p>
        <p>
          <strong>Dados do Cliente.</strong> Os Dados do Cliente permanecem de
          titularidade do Cliente. O Cliente nos concede licença limitada para
          hospedá-los, processá-los e exibi-los, exclusivamente para prestar o
          serviço. Podemos utilizar dados{" "}
          <strong>agregados e anonimizados</strong>, sem identificação do
          Cliente ou de sua operação, para estatísticas, comparativos de mercado
          e melhoria do produto.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Confidencialidade">
        <p>
          Cada parte compromete-se a manter sigilo sobre informações
          confidenciais da outra a que tiver acesso, utilizando-as apenas para o
          cumprimento destes Termos. A obrigação subsiste por 2 (dois) anos após
          o encerramento da relação e não se aplica a informações públicas,
          já conhecidas licitamente ou cuja divulgação seja exigida por lei ou
          autoridade competente.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Disponibilidade, isenções e limitação de responsabilidade">
        <p>
          A Plataforma é fornecida <strong>&quot;no estado em que se
          encontra&quot;</strong> e conforme disponibilidade. Não garantimos
          operação ininterrupta, ausência de erros, compatibilidade com todo e
          qualquer dispositivo, nem que a Plataforma atenderá a expectativas
          específicas do Cliente.
        </p>
        <p>
          <strong>Não garantimos resultado.</strong> Não prometemos aumento de
          vendas, redução de custos, lucro ou qualquer desempenho decorrente do
          uso da Plataforma.
        </p>
        <p>Não nos responsabilizamos por:</p>
        <ul className="list-disc pl-5">
          <li>
            decisões tomadas pelo Cliente com base nas informações exibidas,
            inclusive as geradas por inteligência artificial;
          </li>
          <li>
            dados incorretos, incompletos ou desatualizados fornecidos pelo
            Cliente ou pelas Plataformas de Delivery;
          </li>
          <li>
            indisponibilidade, alteração de regras, bloqueio ou descontinuação
            das Plataformas de Delivery e de suas APIs;
          </li>
          <li>
            obrigações fiscais, tributárias, trabalhistas ou contábeis do
            Cliente;
          </li>
          <li>
            acesso indevido decorrente de compartilhamento ou má guarda de
            credenciais pelo Cliente ou seus Usuários;
          </li>
          <li>
            falhas de conexão, equipamentos ou software do Cliente, caso
            fortuito e força maior.
          </li>
        </ul>
        <p>
          Na máxima extensão permitida pela lei, não respondemos por danos
          indiretos, lucros cessantes, perda de chance ou perda de dados. Nossa
          responsabilidade total, por qualquer causa, fica{" "}
          <strong>limitada ao valor efetivamente pago pelo Cliente nos 12
          (doze) meses anteriores</strong> ao fato gerador.
        </p>
        <p>
          As limitações desta cláusula não se aplicam a dolo ou culpa grave, nem
          afastam direitos indisponíveis previstos em lei.
        </p>
      </LegalSection>

      <LegalSection n={13} title="Proteção de dados">
        <p>
          O tratamento de dados pessoais é regido pela{" "}
          <a href="/privacidade" className="underline">
            Política de Privacidade
          </a>
          , parte integrante destes Termos.
        </p>
        <p>
          Quanto aos dados pessoais de <strong>clientes finais do Cliente</strong>{" "}
          (por exemplo, consumidores que fizeram pedidos), o{" "}
          <strong>Cliente atua como Controlador</strong> e o Delivery OS como{" "}
          <strong>Operador</strong>, tratando tais dados conforme as instruções
          do Cliente e as finalidades da Plataforma. Cabe ao Cliente assegurar
          base legal adequada e informar seus titulares.
        </p>
      </LegalSection>

      <LegalSection n={14} title="Alterações destes Termos">
        <p>
          Podemos atualizar estes Termos a qualquer momento. Alterações
          relevantes serão comunicadas pela Plataforma ou por e-mail, com
          antecedência razoável. A versão vigente é sempre a publicada nesta
          página, com a data de atualização.
        </p>
        <p>
          O uso continuado após a entrada em vigor implica concordância. Se o
          Cliente não concordar, poderá cancelar a assinatura conforme a
          cláusula 9.
        </p>
      </LegalSection>

      <LegalSection n={15} title="Disposições gerais">
        <p>
          A tolerância quanto ao descumprimento de qualquer cláusula é mera
          liberalidade e não implica novação ou renúncia de direitos.
        </p>
        <p>
          Se qualquer cláusula for considerada nula ou inexequível, as demais
          permanecem válidas.
        </p>
        <p>
          O Cliente não pode ceder este contrato sem nossa anuência prévia.
          Podemos ceder ou transferir este contrato em caso de reorganização
          societária, fusão, aquisição ou venda de ativos, mediante comunicação.
        </p>
        <p>
          Estes Termos não estabelecem sociedade, associação, representação ou
          vínculo empregatício entre as partes.
        </p>
        <p>
          As comunicações serão feitas pelos canais oficiais e pelo e-mail
          cadastrado pelo Cliente, que deve mantê-lo atualizado.
        </p>
      </LegalSection>

      <LegalSection n={16} title="Lei aplicável e foro">
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil.
          Fica eleito o foro da comarca de <strong>São Paulo/SP</strong> para
          dirimir controvérsias oriundas destes Termos, com renúncia a qualquer
          outro, por mais privilegiado que seja, ressalvadas as hipóteses de
          competência legal diversa.
        </p>
      </LegalSection>

      <LegalSection n={17} title="Contato">
        <p>
          Dúvidas sobre estes Termos:{" "}
          <a href="mailto:contato@deliveryos.food" className="underline">
            contato@deliveryos.food
          </a>
          . Assuntos de privacidade e proteção de dados:{" "}
          <a href="mailto:privacidade@deliveryos.food" className="underline">
            privacidade@deliveryos.food
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  )
}
