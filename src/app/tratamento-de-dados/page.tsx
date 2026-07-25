import { LegalSection, LegalShell } from "@/components/legal/legal-shell"

export const metadata = {
  title: "Anexo de Tratamento de Dados Pessoais — Delivery OS",
}

/** Linha das tabelas dos anexos. */
function Linha({ a, b }: { a: string; b: string }) {
  return (
    <tr className="border-t align-top">
      <td className="w-1/3 py-2 pr-3 font-medium text-foreground">{a}</td>
      <td className="py-2">{b}</td>
    </tr>
  )
}

export default function TratamentoDeDadosPage() {
  return (
    <LegalShell
      title="Anexo de Tratamento de Dados Pessoais"
      updatedAt="25 de julho de 2026"
    >
      <p>
        Este Anexo (&quot;DPA&quot;) integra os{" "}
        <a href="/termos" className="underline">
          Termos de Uso
        </a>{" "}
        do <strong>Delivery OS</strong> e regula o tratamento de dados pessoais
        realizado pela <strong>LAB OF CHANGE LTDA</strong>, CNPJ{" "}
        <strong>38.613.971/0001-80</strong>{" "}
        (&quot;Operador&quot;), por conta e
        ordem da empresa contratante (&quot;Controlador&quot; ou
        &quot;Cliente&quot;), nos termos da Lei nº 13.709/2018
        (&quot;LGPD&quot;).
      </p>
      <p>
        Ao contratar ou continuar utilizando a Plataforma, o Cliente adere a
        este Anexo. Em caso de conflito com os Termos de Uso,{" "}
        <strong>prevalece este Anexo</strong> no que se refere a proteção de
        dados pessoais.
      </p>
      <p className="rounded-md border bg-muted/40 px-3 py-2">
        <strong>Quando este Anexo se aplica.</strong> Ele rege apenas os dados
        pessoais de <strong>terceiros</strong> que o Cliente traz para a
        Plataforma — principalmente consumidores das lojas. Os dados dos
        próprios usuários e representantes do Cliente são tratados por nós na
        qualidade de <em>controladores</em>, conforme a{" "}
        <a href="/privacidade" className="underline">
          Política de Privacidade
        </a>
        .
      </p>

      <LegalSection n={1} title="Definições">
        <p>
          Aplicam-se as definições da LGPD. Para clareza:{" "}
          <strong>Controlador</strong> é o Cliente, que decide as finalidades e
          os meios do tratamento; <strong>Operador</strong> é o Delivery OS, que
          trata os dados em nome do Cliente; <strong>Suboperador</strong> é o
          terceiro contratado pelo Operador para auxiliar na prestação do
          serviço; <strong>Titular</strong> é a pessoa natural a quem os dados
          se referem.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Objeto e papéis">
        <p>
          O Cliente, na qualidade de <strong>Controlador</strong>, contrata a
          Plataforma para consolidar e analisar sua operação de delivery. Para
          isso, dados pessoais de titulares — em especial consumidores que
          realizaram pedidos nas lojas do Cliente — são transmitidos à
          Plataforma pelas plataformas de delivery ou por importação de
          arquivos.
        </p>
        <p>
          O Delivery OS atua exclusivamente como <strong>Operador</strong>{" "}
          desses dados: trata-os apenas para executar o serviço contratado,
          segundo as instruções do Cliente, sem utilizá-los para finalidades
          próprias.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Instruções do Controlador">
        <p>
          O Operador tratará os dados pessoais somente conforme as instruções
          documentadas do Controlador, que são compostas por: (i) este Anexo;
          (ii) os Termos de Uso; e (iii) as configurações, integrações e
          comandos que o Cliente realiza na própria Plataforma — como conectar
          uma loja, importar um relatório, gerar um diagnóstico ou excluir um
          registro.
        </p>
        <p>
          O Operador informará o Controlador caso entenda que uma instrução
          viola a LGPD, podendo suspender a execução da instrução até o
          esclarecimento.
        </p>
        <p>
          O Operador <strong>não</strong> vende dados pessoais, não os utiliza
          para publicidade própria ou de terceiros e não os emprega para
          treinar modelos de inteligência artificial.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Obrigações do Controlador">
        <p>Cabe ao Cliente, como Controlador:</p>
        <ul className="list-disc pl-5">
          <li>
            possuir <strong>base legal adequada</strong> para o tratamento dos
            dados que insere ou conecta à Plataforma;
          </li>
          <li>
            prestar as informações devidas aos titulares, inclusive sobre o uso
            de operadores;
          </li>
          <li>
            responder às solicitações dos titulares, contando com o auxílio do
            Operador;
          </li>
          <li>
            fornecer instruções lícitas e manter atualizados os contatos para
            comunicações de privacidade;
          </li>
          <li>
            não inserir na Plataforma dados sensíveis ou de crianças e
            adolescentes, que não são necessários à finalidade do serviço.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={5} title="Confidencialidade">
        <p>
          O Operador assegura que as pessoas autorizadas a tratar os dados
          pessoais estão submetidas a dever de confidencialidade, contratual ou
          legal, e que o acesso é concedido apenas na medida necessária às suas
          funções.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Segurança da informação">
        <p>
          O Operador adota e mantém medidas técnicas e administrativas aptas a
          proteger os dados pessoais de acessos não autorizados e de situações
          acidentais ou ilícitas de destruição, perda, alteração, comunicação ou
          difusão, conforme o <strong>Anexo II</strong> deste documento.
        </p>
        <p>
          As medidas podem ser atualizadas ao longo do tempo, desde que o nível
          de proteção não seja reduzido.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Suboperadores">
        <p>
          O Controlador autoriza, de forma geral, a contratação dos
          suboperadores listados no <strong>Anexo III</strong>, necessários à
          prestação do serviço (infraestrutura, hospedagem, cobrança e
          inteligência artificial).
        </p>
        <p>
          O Operador impõe a esses terceiros obrigações de proteção de dados
          compatíveis com as deste Anexo e{" "}
          <strong>responde perante o Controlador</strong> pelos atos dos
          suboperadores.
        </p>
        <p>
          Alterações na lista serão comunicadas com antecedência mínima de{" "}
          <strong>30 (trinta) dias</strong>. O Controlador poderá se opor
          fundamentadamente; não havendo solução, poderá rescindir a assinatura
          sem ônus, com devolução proporcional dos valores pagos e não
          usufruídos.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Transferência internacional">
        <p>
          Parte dos suboperadores processa dados fora do Brasil, principalmente
          nos <strong>Estados Unidos</strong>. O Operador adota salvaguardas
          contratuais e técnicas para assegurar nível de proteção compatível com
          a LGPD, nos termos dos arts. 33 a 36.
        </p>
        <p>
          O Controlador declara ciência e autoriza tais transferências, na
          medida necessária à execução do serviço.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Direitos dos titulares">
        <p>
          Considerando a natureza do tratamento, o Operador auxiliará o
          Controlador no atendimento às solicitações dos titulares, fornecendo
          as informações e os recursos técnicos ao seu alcance — incluindo
          funcionalidades de consulta, correção, exportação e exclusão
          disponíveis na Plataforma.
        </p>
        <p>
          Caso um titular procure diretamente o Operador, este{" "}
          <strong>não responderá em nome do Controlador</strong>: encaminhará a
          solicitação ao Cliente responsável e informará o titular sobre o
          encaminhamento, salvo se orientado de outra forma.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Incidentes de segurança">
        <p>
          Ao tomar conhecimento de incidente de segurança que possa acarretar
          risco ou dano relevante aos titulares, o Operador comunicará o
          Controlador <strong>sem demora injustificada</strong> e, sempre que
          possível, em até <strong>48 (quarenta e oito) horas</strong>.
        </p>
        <p>A comunicação conterá, na medida do disponível:</p>
        <ul className="list-disc pl-5">
          <li>a descrição da natureza do incidente e dos dados afetados;</li>
          <li>as categorias e o número aproximado de titulares envolvidos;</li>
          <li>os riscos prováveis e as medidas adotadas ou propostas;</li>
          <li>o contato para obtenção de mais informações.</li>
        </ul>
        <p>
          A comunicação à ANPD e aos titulares, quando cabível, é{" "}
          <strong>dever do Controlador</strong>, com o apoio do Operador. O
          Operador poderá comunicar diretamente a autoridade quando obrigado por
          lei ou quando também figurar como controlador dos dados envolvidos.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Registro, auditoria e demonstração de conformidade">
        <p>
          O Operador mantém registro das operações de tratamento realizadas por
          conta do Controlador e disponibilizará, mediante solicitação razoável,
          as informações necessárias para demonstrar o cumprimento deste Anexo.
        </p>
        <p>
          O Controlador poderá realizar auditoria, por si ou por terceiro
          independente sujeito a confidencialidade, <strong>uma vez por ano</strong>{" "}
          (ou sempre que houver incidente relevante), mediante aviso prévio de
          30 (trinta) dias, em horário comercial, sem comprometer a segurança e
          a continuidade do serviço nem o sigilo de dados de outros clientes.
          Custos da auditoria correm por conta do Controlador, salvo se
          constatado descumprimento relevante.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Término: devolução e eliminação">
        <p>
          Encerrada a relação contratual, o Cliente terá{" "}
          <strong>30 (trinta) dias corridos</strong> para exportar os dados pela
          Plataforma ou solicitar a exportação.
        </p>
        <p>
          Findo esse prazo, o Operador eliminará ou anonimizará os dados
          pessoais tratados por conta do Controlador, ressalvada a manutenção
          exigida por obrigação legal ou regulatória e a necessária ao exercício
          regular de direitos em processo judicial, administrativo ou arbitral.
        </p>
        <p>
          Cópias em backups são eliminadas conforme o ciclo natural de rotação
          das cópias de segurança, permanecendo protegidas até lá.
        </p>
      </LegalSection>

      <LegalSection n={13} title="Responsabilidade">
        <p>
          Cada parte responde pelos danos que causar em razão do descumprimento
          das obrigações que lhe cabem sob a LGPD e este Anexo.
        </p>
        <p>
          Os limites de responsabilidade previstos nos Termos de Uso aplicam-se
          também a este Anexo, ressalvadas as hipóteses de dolo, culpa grave e
          os direitos indisponíveis previstos em lei.
        </p>
        <p>
          O Controlador responde perante o Operador por instruções ilícitas, por
          ausência de base legal e pela inserção na Plataforma de dados que não
          poderia tratar.
        </p>
      </LegalSection>

      <LegalSection n={14} title="Vigência">
        <p>
          Este Anexo vigora enquanto durar a prestação do serviço e, quanto às
          obrigações de confidencialidade, eliminação e responsabilidade,
          permanece em vigor pelo tempo necessário ao seu cumprimento.
        </p>
      </LegalSection>

      <LegalSection n={15} title="Anexo I — Detalhes do tratamento">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-left text-xs">
            <tbody>
              <Linha
                a="Objeto"
                b="Consolidação e análise da operação de delivery do Cliente na Plataforma Delivery OS."
              />
              <Linha
                a="Natureza e finalidade"
                b="Coleta, armazenamento, organização, consulta, exibição e eliminação de dados, para gerar painéis, relatórios, demonstrativos e análises da operação do Cliente."
              />
              <Linha
                a="Duração"
                b="Enquanto vigente a assinatura, mais o prazo de exportação e as retenções legais previstas na cláusula 12."
              />
              <Linha
                a="Categorias de titulares"
                b="Consumidores finais que realizaram pedidos nas lojas do Cliente."
              />
              <Linha
                a="Tipos de dados pessoais"
                b="Identificação e contato (nome, e-mail, telefone); endereço de entrega; identificadores de pedido; conteúdo de avaliações e comentários escritos pelo consumidor."
              />
              <Linha
                a="Dados sensíveis"
                b="Não são tratados. A Plataforma não solicita e não requer dados sensíveis."
              />
              <Linha
                a="Origem dos dados"
                b="Plataformas de delivery conectadas pelo Cliente (iFood, 99 Food, Keeta, Cardápio Web) e arquivos importados pelo Cliente."
              />
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection n={16} title="Anexo II — Medidas de segurança">
        <ul className="list-disc pl-5">
          <li>criptografia em trânsito (TLS/HTTPS) e no armazenamento;</li>
          <li>
            isolamento lógico entre empresas, com regras de acesso aplicadas no
            banco de dados;
          </li>
          <li>
            autenticação individual, controle de acesso por perfil e princípio
            do menor privilégio;
          </li>
          <li>
            proteção do login contra acessos automatizados e limitação de
            tentativas por origem;
          </li>
          <li>
            segredos e credenciais mantidos fora do código-fonte, em cofre de
            variáveis de ambiente;
          </li>
          <li>
            registros de auditoria de acesso e de operações relevantes;
          </li>
          <li>
            backups periódicos com política de retenção e procedimento de
            recuperação documentado;
          </li>
          <li>
            verificações de segurança no processo de desenvolvimento, com
            revisão de dependências e de configuração;
          </li>
          <li>
            avaliação de segurança e privacidade na contratação de
            suboperadores.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={17} title="Anexo III — Suboperadores autorizados">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-left text-xs">
            <tbody>
              <Linha
                a="Supabase"
                b="Banco de dados, autenticação e armazenamento de arquivos. Processamento no Brasil e/ou exterior."
              />
              <Linha
                a="Vercel"
                b="Hospedagem e execução da aplicação. Processamento no Brasil e/ou exterior."
              />
              <Linha
                a="Asaas"
                b="Cobrança da assinatura e emissão de nota fiscal. Processamento no Brasil."
              />
              <Linha
                a="Anthropic"
                b="Modelo de inteligência artificial que gera diagnósticos e respostas do assistente. Processamento no exterior. Não utiliza os dados para treinar modelos."
              />
              <Linha
                a="Cloudflare"
                b="Proteção da tela de login contra acessos automatizados. Processamento no exterior."
              />
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          Lista atualizada em 25 de julho de 2026. Alterações seguem o
          procedimento da cláusula 7.
        </p>
      </LegalSection>

      <LegalSection n={18} title="Contato">
        <p>
          Assuntos relativos a este Anexo e à proteção de dados devem ser
          dirigidos ao Encarregado:{" "}
          <a href="mailto:privacidade@deliveryos.food" className="underline">
            privacidade@deliveryos.food
          </a>
          .
        </p>
        <p>
          Clientes que necessitem de via assinada deste Anexo podem solicitá-la
          pelo mesmo endereço.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
