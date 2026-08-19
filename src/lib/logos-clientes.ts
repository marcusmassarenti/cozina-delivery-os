/**
 * Logos dos clientes que rodam no Delivery OS, para a esteira da landing.
 *
 * ⚠️ SÃO MARCAS DE TERCEIROS. A maioria são clientes da DG FOODS (rede que usa
 * o sistema), não clientes diretos nossos. O uso foi autorizado pelo Diego
 * (DG Foods) em 06/ago/2026, em nome da rede. Se essa autorização cair, ou se
 * uma loja pedir para sair, o certo é REMOVER a entrada daqui — não deixar no
 * ar "porque já estava".
 *
 * Os arquivos vêm de `units.logo_url` (Supabase Storage), redimensionados para
 * 240px de altura: 15 MB de originais viravam peso morto no carregamento da
 * página; assim o conjunto todo dá 1,6 MB.
 */
export type LogoCliente = {
  nome: string
  src: string
  /** Dimensões reais do arquivo. `next/image` precisa delas pra reservar o
      espaço e escolher o tamanho do srcset — sem elas o Lighthouse acusa
      "elementos de imagem não têm width e height explícitas". */
  w: number
  h: number
}

export const LOGOS_CLIENTES: LogoCliente[] = [
  { nome: "Pizzaria Juliana Favorita", src: "/clientes/pizzaria-juliana-favorita.png", w: 240, h: 240 },
  { nome: "Ponto do Burguer & Sushi Kaito", src: "/clientes/ponto-do-burguer-sushi-kaito.png", w: 240, h: 240 },
  { nome: "Pizzaria Forno a Lenha 4 - Tropical", src: "/clientes/pizzaria-forno-a-lenha-4---tropical.png", w: 240, h: 232 },
  { nome: "Serenata Sorveteria e Pesticaria", src: "/clientes/serenata-sorveteria-e-pesticaria.png", w: 236, h: 240 },
  { nome: "Pizzaria Brasil Novo", src: "/clientes/pizzaria-brasil-novo.png", w: 232, h: 240 },
  { nome: "Nagay Delivery - Comida Japonesa", src: "/clientes/nagay-delivery---comida-japonesa.png", w: 236, h: 240 },
  { nome: "Pizzaria Carvalho", src: "/clientes/pizzaria-carvalho.png", w: 237, h: 240 },
  { nome: "Churrasco no Pote", src: "/clientes/jk.png", w: 240, h: 240 },
  { nome: "Espeto do Chefe - Churrasco e Marmitex", src: "/clientes/espeto-do-chefe---churrasco-e-marmitex.png", w: 237, h: 240 },
  { nome: "Kawaii Poke - Comida Japonesa", src: "/clientes/kawaii-poke---comida-japonesa.png", w: 224, h: 240 },
  { nome: "Banana Food - Uberaba", src: "/clientes/banana-food---uberaba.png", w: 240, h: 240 },
  { nome: "Yaki Poke", src: "/clientes/yaki-poke.png", w: 234, h: 240 },
  { nome: "Sansão Lanches", src: "/clientes/sansão-lanches.png", w: 240, h: 240 },
  { nome: "Pizzaria Fiorentina", src: "/clientes/pizzaria-fiorentina.png", w: 240, h: 234 },
  { nome: "Fogão Brasil", src: "/clientes/fogão-brasil.png", w: 236, h: 240 },
  { nome: "Suki Temakeria - Comida Japonesa (Tupã)", src: "/clientes/suki-temakeria---comida-japonesa-tupã.png", w: 240, h: 240 },
  { nome: "Yakisushi", src: "/clientes/yakisushi.png", w: 228, h: 240 },
  { nome: "Restaurante Colher de Pau - Marmitas e Marmitex", src: "/clientes/restaurante-colher-de-pau---marmitas-e-marmitex.png", w: 240, h: 240 },
  { nome: "American Submarine", src: "/clientes/american-submarine.png", w: 237, h: 240 },
  { nome: "BotuSalgados", src: "/clientes/botusalgados.png", w: 240, h: 240 },
  { nome: "Sapo Burguer", src: "/clientes/sapo-burguer.png", w: 240, h: 240 },
  { nome: "Duéle Hamburgueria", src: "/clientes/duéle-hamburgueria.png", w: 240, h: 235 },
  { nome: "Prudentão Lanches Mary", src: "/clientes/prudentão-lanches-mary.png", w: 240, h: 240 },
  { nome: "Donna Marmita", src: "/clientes/donna-marmita.png", w: 240, h: 240 },
  { nome: "Hulk Burguer", src: "/clientes/hulk-burguer.png", w: 240, h: 240 },
  { nome: "Nosso Brownie", src: "/clientes/nosso-brownie.png", w: 240, h: 240 },
  { nome: "Ki Delicia - Hamburgueria & Espetaria", src: "/clientes/ki-delicia---hamburgueria-espetaria.png", w: 240, h: 227 },
  { nome: "Suki Temakeria - Comida Japonesa", src: "/clientes/suki-temakeria---comida-japonesa.png", w: 240, h: 240 },
  { nome: "Sushi Bar - Comida Japonesa", src: "/clientes/sushi-bar---comida-japonesa.png", w: 229, h: 240 },
  { nome: "Santo Peixe - Comida Japonesa", src: "/clientes/santo-peixe---comida-japonesa.png", w: 240, h: 240 },
]
