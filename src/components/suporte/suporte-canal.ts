/**
 * O fio entre o menu lateral e o painel de suporte.
 *
 * O balão flutuava no canto e tapava conteúdo — na DRE da loja ficava por
 * cima do rodapé do card. Arrastar resolvia pela metade: tirava da frente de
 * uma tela e entrava na frente de outra, e ainda pedia que a pessoa
 * descobrisse sozinha que dava pra arrastar. A entrada virou item fixo do
 * menu (Marcus, 28/08/26), que é onde se procura ajuda.
 *
 * Um evento de janela em vez de contexto: o botão está no rodapé do menu e o
 * painel é irmão dele lá no layout. Um provider só pra ligar os dois
 * atravessaria a árvore inteira pra transmitir um booleano.
 */

const ABRIR = "suporte:abrir"
const NOVA = "suporte:nova"

export function abrirSuporte() {
  window.dispatchEvent(new CustomEvent(ABRIR))
}

export function ouvirAbrir(cb: () => void): () => void {
  window.addEventListener(ABRIR, cb)
  return () => window.removeEventListener(ABRIR, cb)
}

/** O painel avisa; o menu acende o ponto. */
export function anunciarNova(tem: boolean) {
  window.dispatchEvent(new CustomEvent(NOVA, { detail: tem }))
}

export function ouvirNova(cb: (tem: boolean) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<boolean>).detail)
  window.addEventListener(NOVA, h)
  return () => window.removeEventListener(NOVA, h)
}
