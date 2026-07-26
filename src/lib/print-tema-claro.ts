/**
 * Tira o tema escuro só durante a impressão e devolve a função que restaura.
 *
 * Motivo: o variant `dark` do Tailwind aqui é por classe
 * (`@custom-variant dark (&:is(.dark *))`), então quem está no tema escuro
 * carrega pro papel os pares `dark:bg-emerald-950/40 dark:text-emerald-400`.
 * O CSS de impressão força fundo branco — resultado: texto verde-claro sobre
 * branco, ilegível justamente nos selos e destaques. Tirando a classe, a folha
 * inteira volta pras cores claras sem precisar de override por componente.
 */
export function forcarTemaClaroNoPrint(): () => void {
  const raiz = document.documentElement
  if (!raiz.classList.contains("dark")) return () => {}
  raiz.classList.remove("dark")
  return () => raiz.classList.add("dark")
}
