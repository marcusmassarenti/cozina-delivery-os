/**
 * "Ver como o cliente" — o suporte enxerga as telas de um cliente sem entrar
 * na conta dele.
 *
 * POR QUE EXISTE
 * Quando um cliente reclama de um número, não havia como olhar junto: as telas
 * operacionais são presas à empresa de quem está logado, e isso é o isolamento
 * multi-tenant funcionando. Faltava um jeito CONTROLADO de furar isso pro
 * suporte, em vez do jeito antigo — uma variável de ambiente que ligava a
 * visão de outro cliente pra qualquer um, removida num achado de segurança.
 *
 * COMO É SEGURO
 * O cookie sozinho NÃO VALE NADA. Ele carrega só o id da empresa; quem decide
 * se aquilo tem efeito é `getVerComoHoldingId` (em permissions.ts), que
 * confere `isSuperadmin()` no servidor a cada leitura. Um usuário comum que
 * forje o cookie não vê nada de ninguém.
 *
 * E É SÓ LEITURA: o middleware recusa qualquer POST/PUT/PATCH/DELETE enquanto
 * o cookie existir. A trava é pelo MÉTODO, num ponto só, e vale até pra quem
 * forjou o cookie — nesse caso ele apenas bloqueia a si mesmo. Fail-closed:
 * uma tela nova com um botão de salvar já nasce protegida, sem ninguém
 * precisar lembrar de proteger.
 *
 * A saída é um GET (/api/ver-como/sair) justamente pra não esbarrar na trava.
 * Sair é desescalar privilégio: mesmo que alguém force o link, o pior que
 * acontece é o suporte voltar a ser ele mesmo.
 */

/** Nome do cookie. Curto e sem dado sensível: guarda só o id da empresa. */
export const COOKIE_VER_COMO = "dos_ver_como"

/**
 * Quanto tempo a visão dura, em segundos.
 *
 * Meia hora de propósito: sessão de suporte é curta, e o risco real aqui não é
 * invasão — é esquecer que está vendo como outra pessoa e tirar conclusão
 * sobre o cliente errado. Expirando sozinha, o pior caso se resolve com o
 * tempo em vez de depender de alguém lembrar de sair.
 */
export const VER_COMO_DURACAO_S = 30 * 60
