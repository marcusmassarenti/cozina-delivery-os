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
export type LogoCliente = { nome: string; src: string }

export const LOGOS_CLIENTES: LogoCliente[] = [
  { nome: "Pizzaria Juliana Favorita", src: "/clientes/pizzaria-juliana-favorita.png" },
  { nome: "Ponto do Burguer & Sushi Kaito", src: "/clientes/ponto-do-burguer-sushi-kaito.png" },
  { nome: "Pizzaria Forno a Lenha 4 - Tropical", src: "/clientes/pizzaria-forno-a-lenha-4---tropical.png" },
  { nome: "Serenata Sorveteria e Pesticaria", src: "/clientes/serenata-sorveteria-e-pesticaria.png" },
  { nome: "Pizzaria Brasil Novo", src: "/clientes/pizzaria-brasil-novo.png" },
  { nome: "Nagay Delivery - Comida Japonesa", src: "/clientes/nagay-delivery---comida-japonesa.png" },
  { nome: "Pizzaria Carvalho", src: "/clientes/pizzaria-carvalho.png" },
  { nome: "Churrasco no Pote", src: "/clientes/jk.png" },
  { nome: "Espeto do Chefe - Churrasco e Marmitex", src: "/clientes/espeto-do-chefe---churrasco-e-marmitex.png" },
  { nome: "Kawaii Poke - Comida Japonesa", src: "/clientes/kawaii-poke---comida-japonesa.png" },
  { nome: "Banana Food - Uberaba", src: "/clientes/banana-food---uberaba.png" },
  { nome: "Yaki Poke", src: "/clientes/yaki-poke.png" },
  { nome: "Sansão Lanches", src: "/clientes/sansão-lanches.png" },
  { nome: "Pizzaria Fiorentina", src: "/clientes/pizzaria-fiorentina.png" },
  { nome: "Fogão Brasil", src: "/clientes/fogão-brasil.png" },
  { nome: "Suki Temakeria - Comida Japonesa (Tupã)", src: "/clientes/suki-temakeria---comida-japonesa-tupã.png" },
  { nome: "Yakisushi", src: "/clientes/yakisushi.png" },
  { nome: "Restaurante Colher de Pau - Marmitas e Marmitex", src: "/clientes/restaurante-colher-de-pau---marmitas-e-marmitex.png" },
  { nome: "American Submarine", src: "/clientes/american-submarine.png" },
  { nome: "BotuSalgados", src: "/clientes/botusalgados.png" },
  { nome: "Sapo Burguer", src: "/clientes/sapo-burguer.png" },
  { nome: "Duéle Hamburgueria", src: "/clientes/duéle-hamburgueria.png" },
  { nome: "Prudentão Lanches Mary", src: "/clientes/prudentão-lanches-mary.png" },
  { nome: "Donna Marmita", src: "/clientes/donna-marmita.png" },
  { nome: "Hulk Burguer", src: "/clientes/hulk-burguer.png" },
  { nome: "Nosso Brownie", src: "/clientes/nosso-brownie.png" },
  { nome: "Ki Delicia - Hamburgueria & Espetaria", src: "/clientes/ki-delicia---hamburgueria-espetaria.png" },
  { nome: "Suki Temakeria - Comida Japonesa", src: "/clientes/suki-temakeria---comida-japonesa.png" },
  { nome: "Sushi Bar - Comida Japonesa", src: "/clientes/sushi-bar---comida-japonesa.png" },
  { nome: "Santo Peixe - Comida Japonesa", src: "/clientes/santo-peixe---comida-japonesa.png" },
]
