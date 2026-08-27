# iFood — app distribuído x centralizado

Réplica escrita em 27/08/26, depois da resposta do iFood explicando que o app
distribuído é uma aplicação NOVA, exige revincular loja a loja, e passa por
homologação apenas do fluxo de autorização (os módulos já homologados são
reaproveitados).

**Nosso retrato quando a réplica foi escrita:** modelo centralizado
(`client_credentials`), dois apps — *financial* (conciliação + merchant) e
*review* (avaliações) —, **108 lojas ativas em 9 clientes**.

O custo da migração está todo na revinculação. As perguntas abaixo existem
porque a resposta deles explica COMO migrar e não POR QUE — e porque o esforço
muda conforme o formato da autorização.

⚠️ A pergunta do prazo de descontinuação entrou por último, solta no fim: é a que
mais muda a decisão (se o centralizado for aposentado, migrar deixa de ser
escolha) mas não merece o peso de um bloco numerado.

⚠️ VERSÃO CURTA DE PROPÓSITO. A primeira que escrevi tinha parágrafo de
confirmação, apresentação da empresa e as perguntas explicadas — o Marcus cortou:
"muito complexo e demonstra ia na mensagem". Mensagem de suporte é conversa, não
documento. O contexto que sobrou (as 108 lojas, a assessoria x proprietário)
ficou porque é o que faz o outro lado entender a pergunta, não porque enfeita.

---

**Assunto:** App distribuído — duas dúvidas

Boa tarde! Obrigado pelo retorno.

Antes de começar a migração, duas dúvidas:

**1.** No distribuído, como o lojista autoriza? É um link que a gente gera e
manda pra ele, ou ele precisa fazer algo dentro do Portal do Parceiro? Pergunto
porque na maioria dos nossos clientes quem mexe no painel é a assessoria e o
perfil de Proprietário é do dono da loja — são pessoas diferentes. Temos 108
lojas pra revincular, então isso muda bastante o planejamento.

**2.** O distribuído libera algum módulo que o centralizado não libera — a API
de Analytics, por exemplo? Em agosto nos disseram que o app que temos não
migraria pra ela. Se for por aí, migramos de uma vez e pedimos a autorização ao
lojista uma vez só.

E tem prazo pro centralizado ser descontinuado?

Obrigado!

---

## Para quem ler a resposta deles

- **Se a autorização for por link self-service:** já temos o caminho pronto. O
  `/conectar/<plataforma>/<token>` construído em 26/08 pro Cardápio Web carrega
  empresa e loja no token, vale 7 dias e não exige conta no Delivery OS —
  adaptar pro iFood é trocar o que vai dentro do link e o callback.
- **Se não houver ganho de módulo e nem prazo:** não migrar agora. São 108
  autorizações pedidas ao lojista sem nada visível em troca, e o desgaste é com
  o cliente, não com o iFood.
- **Se o distribuído destravar a Analytics API:** aí vale, e o certo é fazer as
  duas coisas na mesma revinculação — ver [[project_ifood_analytics_api]].
