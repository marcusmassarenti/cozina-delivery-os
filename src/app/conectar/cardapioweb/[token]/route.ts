/**
 * O link que o DONO DA LOJA abre — sem conta no Delivery OS.
 *
 * ── POR QUE (Marcus, 27/08/26) ───────────────────────────────────────────
 * "ele não tem acesso ao deliveryOS. quem tem é o usuário adenilton e o dono da
 * loja é outra pessoa que não usa nosso sistema."
 *
 * A rota irmã (`/conectar/cardapioweb`, sem token) manda pro nosso login quando
 * não há sessão — e foi ali que um cliente ficou preso a manhã inteira,
 * digitando a senha do Cardápio Web na nossa tela. Ela continua servindo pra
 * quem TEM conta e clicou "Instalar" na App Store do Cardápio Web.
 *
 * Esta é pra quem não tem: o token carrega a empresa e a loja, então não há nada
 * pra perguntar.
 *
 * É `route.ts` e não `page.tsx` de propósito: a validade do convite se checa com
 * o relógio, e chamar `Date.now()` dentro de um componente quebra a regra de
 * pureza do React (o lint pega). Handler não é componente.
 *
 * ⚠️ SEGURANÇA: o token só amarra uma instalação a ESTA empresa e ESTA loja. Não
 * loga ninguém, não dá acesso a dado e não serve pra outra loja. Quem abrir sem
 * ser Proprietário da loja no Cardápio Web recebe `access_denied` de lá — a
 * autorização de verdade acontece do lado deles, com a senha deles.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import {
  gerarCodeChallenge,
  gerarCodeVerifier,
  gerarState,
  montarUrlAutorizacao,
  STATE_TTL_MS,
  type CwAmbiente,
} from "@/lib/cardapioweb/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const pagina = (corpo: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Conectar ao Cardápio Web</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#fafafa;color:#18181b">
<div style="max-width:420px;padding:24px;text-align:center">${corpo}</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  )

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  const admin = createAdminClient()

  const { data } = await admin
    .from("cardapioweb_convites")
    .select("token, holding_id, unit_id, ambiente, expira_em")
    .eq("token", token)
    .maybeSingle()

  const c = data as {
    holding_id: string
    unit_id: string | null
    ambiente: string
    expira_em: string
  } | null

  // Token inexistente e token vencido dão a MESMA resposta: distinguir os dois
  // conta, pra quem estiver testando links, que aquele token já existiu.
  if (!c || new Date(c.expira_em).getTime() < Date.now()) {
    return pagina(
      `<p style="font-size:18px;font-weight:600;margin:0 0 8px">Este link não vale mais</p>
       <p style="font-size:14px;line-height:1.6;color:#52525b;margin:0">
         Peça um novo a quem cuida do seu Delivery OS. Os links de conexão valem 7 dias.
       </p>`,
      410,
    )
  }

  const ambiente: CwAmbiente = c.ambiente === "sandbox" ? "sandbox" : "producao"
  const state = gerarState()
  const codeVerifier = gerarCodeVerifier()

  const { error } = await admin.from("cardapioweb_oauth_states").insert({
    state,
    holding_id: c.holding_id,
    unit_id: c.unit_id,
    ambiente,
    code_verifier: codeVerifier,
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  })
  if (error) {
    return pagina(
      `<p style="font-size:18px;font-weight:600;margin:0 0 8px">Não consegui iniciar a conexão</p>
       <p style="font-size:14px;color:#52525b;margin:0">Tente de novo em alguns minutos.</p>`,
      500,
    )
  }

  // "O dono abriu o link" — é a pergunta que o admin faz enquanto espera. NÃO
  // invalida o convite: errar a senha e tentar de novo é normal.
  //
  // ⚠️ COM `await`, e não `void`. Em route handler o processo segue assim que a
  // resposta sai, e o update disparado sem espera simplesmente não acontecia —
  // testado em 27/08, o carimbo ficava nulo. É uma consulta pequena e ninguém
  // está cronometrando esta página.
  await admin
    .from("cardapioweb_convites")
    .update({ ultimo_uso_em: new Date().toISOString() })
    .eq("token", token)

  const destino = montarUrlAutorizacao({
    ambiente,
    state,
    codeChallenge: gerarCodeChallenge(codeVerifier),
  })

  /**
   * Página com botão em vez de redirect 3xx: cliente de WhatsApp e de e-mail
   * PRÉ-CARREGA link pra montar a prévia, e um redirect seria seguido ali —
   * queimando o `state` de 10 minutos antes de a pessoa clicar. Com o botão, o
   * pré-carregador busca o HTML e vai embora.
   */
  return pagina(
    `<p style="font-size:18px;font-weight:600;margin:0 0 8px">Conectar sua loja</p>
     <p style="font-size:14px;line-height:1.6;color:#52525b;margin:0 0 20px">
       Você vai entrar com o seu login <b>do Cardápio Web</b> e autorizar o acesso.
       É preciso ser o <b>Proprietário</b> da loja para autorizar.
     </p>
     <a href="${destino}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#ff4d1c;color:#fff;text-decoration:none;font-weight:700;font-size:15px">Continuar para o Cardápio Web</a>`,
  )
}
