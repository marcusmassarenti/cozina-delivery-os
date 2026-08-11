/**
 * Limites de tamanho da resposta a uma avaliação do iFood.
 *
 * Moram FORA do `_actions.ts` porque um arquivo `"use server"` só pode exportar
 * função async — exportar uma constante de lá quebra o build (e o `tsc` não
 * avisa, só o Next na hora de compilar).
 *
 * Os números são do iFood: fora de 10–300 a API devolve 400 sem explicar.
 */
export const RESPOSTA_MIN = 10
export const RESPOSTA_MAX = 300
