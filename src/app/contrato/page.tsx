import { LegalSection, LegalShell } from "@/components/legal/legal-shell"

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
      updatedAt="14 de agosto de 2026"
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
        <strong>Versão 1.0.</strong> Este documento não é assinado
        individualmente: o aceite da Proposta Comercial vincula o CLIENTE a
        estes termos.
      </p>

      <LegalSection n={1} title="Objeto">
        <p>
          <strong>1.1.</strong> Este contrato tem por objeto a licença de uso,
          não exclusiva e intransferível, de software na modalidade Serviço
          (SaaS) denominado Delivery OS, acessível pela internet em
          deliveryos.food, destinado à consolidação, análise e gestão de dados
          operacionais e financeiros de operações de delivery.
        </p>
        <p>
          <strong>1.2.</strong> A contratação não implica venda, cessão ou
          transferência do software, do código-fonte ou de qualquer direito de
          propriedade intelectual. O CLIENTE adquire exclusivamente o direito de
          uso, pelo prazo e nas condições aqui previstos.
        </p>
        <p>
          <strong>1.3.</strong> O escopo funcional efetivamente contratado —
          plano, número de lojas, integrações e serviços adicionais — é o
          descrito na Proposta Comercial.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Vigência e renovação">
        <p>
          <strong>2.1.</strong> Este contrato vigora pelo prazo mínimo de{" "}
          <strong>12 (doze) meses</strong>, contados da data de aceite da
          Proposta Comercial.
        </p>
        <p>
          <strong>2.2.</strong> Ao final do prazo, é renovado{" "}
          <strong>automaticamente por sucessivos períodos de 12 (doze) meses</strong>
          , nas mesmas condições, salvo se qualquer das partes manifestar por
          escrito a intenção de não renovar com antecedência mínima de{" "}
          <strong>30 (trinta) dias</strong> do término do período vigente.
        </p>
        <p>
          <strong>2.3.</strong> A renovação automática não dispensa a
          comunicação de reajuste prevista na cláusula 4.4.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Rescisão">
        <p>
          <strong>3.1.</strong> Qualquer das partes pode rescindir este contrato
          imotivadamente, mediante aviso escrito com 30 (trinta) dias de
          antecedência.
        </p>
        <p>
          <strong>3.2.</strong> Havendo prazo mínimo em curso, a rescisão pelo
          CLIENTE antes do término observa a condição de fidelidade prevista na
          Proposta Comercial, sem prejuízo dos valores já vencidos.
        </p>
        <p>
          <strong>3.3.</strong> O contrato pode ser rescindido de pleno direito,
          independentemente de aviso, em caso de: (a) inadimplemento não sanado
          em 30 (trinta) dias contados do vencimento; (b) uso do software para
          finalidade ilícita ou em violação às cláusulas 7 e 8; (c) falência,
          recuperação judicial ou insolvência de qualquer parte.
        </p>
        <p>
          <strong>3.4.</strong> A rescisão não desobriga o CLIENTE dos
          pagamentos vencidos e não elimina o direito à exportação de dados
          previsto na cláusula 12.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Preço, faturamento e reajuste">
        <p>
          <strong>4.1.</strong> A remuneração é mensal e calculada no modelo{" "}
          <strong>primeira loja + lojas adicionais</strong>, conforme o plano e
          os valores da Proposta Comercial.
        </p>
        <p>
          <strong>4.2.</strong> O número de lojas é apurado automaticamente pelo
          sistema, considerando as unidades ativas. A inclusão de lojas ao longo
          do mês gera cobrança proporcional a partir da ativação; a exclusão
          passa a valer no ciclo seguinte.
        </p>
        <p>
          <strong>4.3.</strong> O faturamento é realizado por meio da plataforma
          Asaas, com emissão automática de NFS-e, aceitos cartão de crédito,
          boleto bancário e PIX.
        </p>
        <p>
          <strong>4.4.</strong> Os valores são reajustados anualmente, na data
          de aniversário do contrato, pela variação positiva do IPCA/IBGE
          acumulado nos 12 meses anteriores, ou por índice que o substitua, com
          comunicação ao CLIENTE 30 (trinta) dias antes.
        </p>
        <p>
          <strong>4.5.</strong> O atraso sujeita o CLIENTE a multa de 2% sobre o
          valor devido, juros de mora de 1% ao mês pro rata die e correção
          monetária. Persistindo o atraso por mais de 10 (dez) dias, a DELIVERY
          OS poderá suspender o acesso mediante aviso prévio, sem que isso
          configure rescisão nem interrompa a contagem das mensalidades.
        </p>
        <p>
          <strong>4.6.</strong> Alterações de plano são processadas com
          proração no ciclo vigente.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Disponibilidade e suporte">
        <p>
          <strong>5.1.</strong> A DELIVERY OS empreenderá seus melhores esforços
          para manter o software disponível 24 horas por dia, 7 dias por semana,
          com meta de disponibilidade mensal de <strong>99%</strong>, excluídas
          do cálculo: (a) manutenções programadas, comunicadas com 24 horas de
          antecedência; (b) indisponibilidades causadas por terceiros (cláusula
          6); (c) casos fortuitos ou de força maior; (d) interrupções
          decorrentes de ato ou omissão do próprio CLIENTE.
        </p>
        <p>
          <strong>5.2.</strong> O suporte é prestado pelo chat dentro do sistema
          e por e-mail, em dias úteis das 9h às 18h (horário de Brasília), com
          prazo de primeira resposta de até 1 (um) dia útil.
        </p>
        <p>
          <strong>5.3.</strong> A DELIVERY OS realiza rotinas automáticas de
          backup dos dados do CLIENTE, com retenção mínima de 7 (sete) dias.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Integrações com plataformas de terceiros">
        <p>
          <strong>6.1.</strong> O software integra-se, quando disponível e
          autorizado, às plataformas iFood, 99 Food, Keeta, Cardápio Web e
          outras que venham a ser incorporadas.
        </p>
        <p>
          <strong>6.2.</strong> Tais plataformas são{" "}
          <strong>terceiros independentes</strong>. A DELIVERY OS não responde
          por indisponibilidade, lentidão, alteração, descontinuação ou
          limitação de suas APIs; recusa, atraso ou revogação de autorizações;
          incorreção dos dados por elas fornecidos; nem por mudanças em suas
          políticas comerciais ou técnicas.
        </p>
        <p>
          <strong>6.3.</strong> A ativação da integração depende de autorização
          expressa do CLIENTE (ou do proprietário da loja) nos portais das
          respectivas plataformas. A DELIVERY OS não tem meio de conceder,
          acelerar ou reverter essa autorização.
        </p>
        <p>
          <strong>6.4.</strong> Na indisponibilidade de qualquer integração, o
          software permanece plenamente utilizável por importação manual de
          relatórios (planilhas), o que não configura descumprimento contratual
          nem enseja abatimento de mensalidade.
        </p>
        <p>
          <strong>6.5.</strong> Os dados apresentados são reproduções do que a
          plataforma de origem fornece. Divergências em relação ao portal da
          plataforma devem ser tratadas junto à plataforma; a DELIVERY OS
          auxiliará na apuração, sem assumir responsabilidade pelo conteúdo de
          origem.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Obrigações do cliente">
        <ul className="list-disc pl-5">
          <li>
            Fornecer informações cadastrais verdadeiras, completas e
            atualizadas, respondendo por sua exatidão.
          </li>
          <li>
            Zelar pelo sigilo das credenciais, respondendo por todo uso
            realizado por meio delas. Recomenda-se ativar a verificação em duas
            etapas disponível no sistema.
          </li>
          <li>
            Não ceder, sublicenciar, revender ou compartilhar o acesso com
            terceiros não autorizados.
          </li>
          <li>
            Não realizar engenharia reversa, descompilação ou tentativa de
            extração do código-fonte.
          </li>
          <li>
            Não empregar meios automatizados de coleta massiva de dados
            (scraping) ou que comprometam a estabilidade do serviço.
          </li>
          <li>
            Manter as autorizações necessárias junto às plataformas de delivery
            e comunicar prontamente qualquer revogação.
          </li>
          <li>Efetuar os pagamentos nos prazos ajustados.</li>
        </ul>
      </LegalSection>

      <LegalSection n={8} title="Obrigações da Delivery OS">
        <ul className="list-disc pl-5">
          <li>Disponibilizar o software conforme o plano contratado.</li>
          <li>Prestar suporte técnico no escopo e horários da cláusula 5.2.</li>
          <li>
            Adotar medidas técnicas e administrativas de segurança compatíveis
            com o estado da técnica, incluindo criptografia em trânsito,
            controle de acesso por perfil e isolamento lógico entre clientes.
          </li>
          <li>
            Comunicar, com antecedência razoável, alterações relevantes de
            funcionalidade que impactem o uso.
          </li>
          <li>Manter sigilo sobre os dados do CLIENTE.</li>
        </ul>
      </LegalSection>

      <LegalSection n={9} title="Propriedade intelectual e titularidade dos dados">
        <p>
          <strong>9.1.</strong> O software Delivery OS, sua marca, código-fonte,
          arquitetura, telas e documentação são de titularidade exclusiva da
          DELIVERY OS, protegidos pela Lei nº 9.610/1998 e pela Lei nº
          9.609/1998.
        </p>
        <p>
          <strong>9.2.</strong>{" "}
          <strong>
            Os dados inseridos ou importados pelo CLIENTE são de sua exclusiva
            titularidade.
          </strong>{" "}
          A DELIVERY OS não adquire qualquer direito sobre eles, utilizando-os
          apenas para prestar o serviço contratado.
        </p>
        <p>
          <strong>9.3.</strong> A DELIVERY OS poderá utilizar dados agregados,
          estatísticos e anonimizados — que não permitam identificar o CLIENTE,
          suas lojas ou pessoas naturais — para melhoria do produto, benchmarking
          de mercado e comunicação institucional.
        </p>
        <p>
          <strong>9.4.</strong> Sugestões de melhoria enviadas pelo CLIENTE podem
          ser implementadas livremente, sem gerar direito a remuneração ou
          coautoria.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Proteção de dados pessoais (LGPD)">
        <p>
          <strong>10.1.</strong> As partes obrigam-se ao cumprimento da Lei nº
          13.709/2018 (LGPD).
        </p>
        <p>
          <strong>10.2.</strong> O <strong>CLIENTE atua como CONTROLADOR</strong>{" "}
          e a <strong>DELIVERY OS como OPERADORA</strong>, tratando os dados
          exclusivamente conforme as instruções do CLIENTE e para as finalidades
          do serviço.
        </p>
        <p>
          <strong>10.3.</strong> A DELIVERY OS poderá utilizar suboperadores
          (infraestrutura, armazenamento, comunicação e processamento), exigindo
          deles nível de proteção equivalente. A relação atualizada está na
          Política de Privacidade.
        </p>
        <p>
          <strong>10.4.</strong> Em caso de incidente de segurança com risco
          relevante aos titulares, a DELIVERY OS comunicará o CLIENTE em até{" "}
          <strong>48 (quarenta e oito) horas</strong> da ciência do fato.
        </p>
        <p>
          <strong>10.5.</strong> A DELIVERY OS auxiliará o CLIENTE, na medida do
          razoável, no atendimento a requisições de titulares e da ANPD.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Confidencialidade">
        <p>
          <strong>11.1.</strong> Cada parte manterá sigilo sobre informações
          confidenciais da outra, não as divulgando sem autorização escrita.
        </p>
        <p>
          <strong>11.2.</strong> A obrigação subsiste por 5 (cinco) anos após o
          término do contrato.
        </p>
        <p>
          <strong>11.3.</strong> Não se consideram confidenciais informações
          públicas, já conhecidas licitamente ou cuja divulgação seja exigida
          por lei ou ordem de autoridade competente.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Encerramento: exportação e eliminação dos dados">
        <p>
          <strong>12.1.</strong> Encerrado o contrato, o CLIENTE terá{" "}
          <strong>30 (trinta) dias corridos</strong> para exportar seus dados
          pelas funcionalidades disponíveis no sistema.
        </p>
        <p>
          <strong>12.2.</strong> Findo o prazo, a DELIVERY OS procederá à
          eliminação definitiva dos dados, ressalvada a conservação exigida por
          obrigação legal ou regulatória e aqueles já anonimizados na forma da
          cláusula 9.3.
        </p>
        <p>
          <strong>12.3.</strong> A exportação em formato ou volume não
          contemplado pelas funcionalidades padrão poderá ser prestada como
          serviço adicional, mediante orçamento.
        </p>
      </LegalSection>

      <LegalSection n={13} title="Limitação de responsabilidade">
        <p>
          <strong>13.1.</strong> O software é ferramenta de{" "}
          <strong>apoio à gestão</strong>. As decisões de negócio, fiscais,
          contábeis e financeiras tomadas a partir das informações apresentadas
          são de responsabilidade exclusiva do CLIENTE.
        </p>
        <p>
          <strong>13.2.</strong> As análises geradas por inteligência artificial
          (Nino AI, Diagnóstico e demais recursos de IA) são{" "}
          <strong>sugestões automatizadas</strong>, não constituem
          aconselhamento profissional e devem ser conferidas antes de qualquer
          decisão.
        </p>
        <p>
          <strong>13.3.</strong> A responsabilidade total da DELIVERY OS, por
          qualquer causa, fica limitada ao valor efetivamente pago pelo CLIENTE
          nos 12 (doze) meses anteriores ao evento que lhe deu origem.
        </p>
        <p>
          <strong>13.4.</strong> Nenhuma das partes responde por lucros
          cessantes, perda de oportunidade, dano indireto ou dano reflexo.
        </p>
        <p>
          <strong>13.5.</strong> As limitações não se aplicam a casos de dolo,
          fraude ou violação de dever legal imperativo.
        </p>
      </LegalSection>

      <LegalSection n={14} title="Disposições gerais">
        <p>
          <strong>14.1. Alterações.</strong> A DELIVERY OS poderá alterar este
          instrumento, publicando a nova versão nesta página e comunicando o
          CLIENTE com <strong>30 (trinta) dias</strong> de antecedência. Havendo
          alteração substancialmente desfavorável, o CLIENTE poderá rescindir sem
          multa dentro desse prazo.
        </p>
        <p>
          <strong>14.2. Cessão.</strong> O CLIENTE não pode ceder este contrato
          sem anuência escrita. A DELIVERY OS poderá cedê-lo em caso de
          reorganização societária, fusão, incorporação ou alienação de ativos,
          mantidas as condições contratadas.
        </p>
        <p>
          <strong>14.3. Assinatura eletrônica.</strong> As partes reconhecem a
          validade jurídica plena da assinatura eletrônica, nos termos da MP nº
          2.200-2/2001 e da Lei nº 14.063/2020, dispensadas testemunhas e via
          física.
        </p>
        <p>
          <strong>14.4. Força maior.</strong> Nenhuma parte responde por
          descumprimento decorrente de caso fortuito ou força maior, nos termos
          do art. 393 do Código Civil.
        </p>
        <p>
          <strong>14.5.</strong> A nulidade de uma cláusula não contamina as
          demais; a tolerância quanto ao descumprimento não implica novação nem
          renúncia; este contrato não gera vínculo empregatício, societário ou
          de exclusividade.
        </p>
        <p>
          <strong>14.6. Foro.</strong> Fica eleito o foro da comarca da sede da
          DELIVERY OS, com renúncia a qualquer outro, por mais privilegiado que
          seja.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
