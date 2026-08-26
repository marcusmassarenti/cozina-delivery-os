/**
 * Estilo do projeto, para o Prettier parar de inventar o dele.
 *
 * ── POR QUE EXISTE (26/08/26) ────────────────────────────────────────────
 * O repo não tinha config. Rodei `npx prettier --write` em três arquivos que
 * eu tinha acabado de editar e o Prettier usou os PADRÕES DELE: encheu tudo de
 * ponto e vírgula e mexeu em 1.303 linhas onde a mudança real eram 60. O diff
 * do commit ficou ilegível e o arquivo saiu fora do estilo do resto do `src`.
 *
 * Os valores abaixo foram MEDIDOS no código, não escolhidos:
 *   • aspas duplas: 3.065 imports contra 0 com aspas simples
 *   • sem ponto e vírgula: 150 linhas terminadas em `;` em ~2.000 arquivos,
 *     quase todas dentro de string ou SQL
 *   • `(x) =>` com parênteses: 1.072 contra 42 sem
 *   • printWidth 80: das quatro larguras testadas (80/90/100/110), é a que
 *     menos mexe no código existente
 *
 * ⚠️ ISTO NÃO TORNA O REPO "FORMATADO". Medido no mesmo dia: mesmo com esta
 * config, 17 de 25 arquivos de amostra ainda mudariam sob `--write`. O código
 * é formatado à mão, PERTO do Prettier mas não igual a ele.
 *
 * Ou seja: a config diminui o estrago, não o elimina. A regra de convivência
 * continua sendo **nunca rodar `prettier --write` em arquivo que você não
 * editou** — e, no que editou, conferir o `git diff --stat` antes de commitar.
 * Diff muito maior que a mudança é o sintoma.
 */
export default {
  semi: false,
  singleQuote: false,
  printWidth: 80,
  trailingComma: "all",
  arrowParens: "always",
  tabWidth: 2,
}
