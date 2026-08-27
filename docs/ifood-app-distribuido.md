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

## A RESPOSTA (28/08/26) — e a decisão

**1. Como o lojista autoriza.** Geramos um código e um link, mandamos pro
lojista; ele abre, cai na área de integrações do Portal do Parceiro e autoriza.
**Aí o portal gera um NOVO código, que ele precisa mandar de volta pra gente** —
e só então fechamos o vínculo.

Ou seja: não é self-service. Tem uma volta manual no meio, com um código
passando pela mão do lojista. Nosso `/conectar/<plataforma>/<token>` não resolve
isso, porque lá o retorno vem por redirect do OAuth, sozinho.

**2. Módulo extra: NÃO.** *"Os aplicativos centralizado e distribuído possuem os
mesmos módulos e funcionalidades. O que muda é apenas o modelo de autenticação."*
Centralizado = um token pra todas as lojas; distribuído = um token por loja.

⚠️ Isso derruba a justificativa da Analytics — mas mostra onde ela estava
errada. O impedimento de 03/ago nunca foi "precisa ser distribuído", foi
"**o app que você já tem** não migra, precisa de um app NOVO". Um app novo pode
ser CENTRALIZADO. Se um dia a Analytics valer a pena, o caminho é criar outro
app centralizado — e não revincular 108 lojas.

**3. Prazo de descontinuação do centralizado: NÃO RESPONDIDO.** A pergunta saiu
solta no fim da mensagem e voltou sem resposta. É a única que mudaria a decisão.

### Decisão: não migrar as 108 agora

Aplicando a régua que este documento escreveu ANTES de saber a resposta: sem
ganho de módulo e sem prazo, migrar é pedir 108 autorizações ao lojista sem
nada visível em troca — e o desgaste é com o cliente, não com o iFood.

### O que ainda pode valer: usar o distribuído em loja NOVA

`src/lib/ifood/auth-distribuido.ts` já está construído (migration 0194,
credenciais no ambiente) e nunca foi ligado a tela nenhuma — zero linha em
`ifood_conexoes_distribuidas`. A resposta do iFood confirma que o fluxo que
implementamos é exatamente o deles.

O que o distribuído resolve, e não é pouco: hoje cada loja nova exige alguém
entrar no Portal do DESENVOLVEDOR e pedir autorização por CNPJ, e o resultado
não é determinístico — em 13/ago o lojista aprovou e a API seguiu com 403 por
40 minutos; a Tech Assessoria ficou 10 lojas travadas por dias e voltou sem
o iFood explicar o quê. No distribuído o passo que falta é uma ação do lojista,
que a gente vê acontecer.

A troca é: perde-se a autorização automática, ganha-se previsibilidade. Vale
testar em UMA loja nova antes de decidir.

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
