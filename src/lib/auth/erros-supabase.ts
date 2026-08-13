/**
 * Traduz erro do Supabase Auth pra português.
 *
 * O Supabase responde SEMPRE em inglês, e a mensagem ia crua pra tela: o
 * Marcus tentou trocar a senha da conta demo e recebeu "Password is known to be
 * weak and easy to guess, please choose a different one." no meio de um
 * formulário em português. Fora o idioma, a frase não diz o que fazer — a
 * pessoa não tem como saber que o Supabase compara a senha com bases de
 * vazamento públicas (HaveIBeenPwned), e não com uma regra de complexidade.
 *
 * Regra deste arquivo: cada tradução explica o QUE FAZER, não só o que houve.
 * "Senha fraca" sem dizer o motivo faz a pessoa tentar a mesma senha com um
 * número no fim — e tomar o mesmo erro.
 *
 * Casa por trecho (`includes`) e não por igualdade: o Supabase muda a
 * pontuação e o final da frase entre versões, e um `===` quebraria calado,
 * voltando a vazar inglês sem ninguém perceber.
 */

const TRADUCOES: { contem: string; texto: string }[] = [
  {
    contem: "known to be weak and easy to guess",
    texto:
      "Essa senha aparece em vazamentos públicos e não pode ser usada. Não é questão de tamanho — escolha uma senha que você nunca usou em outro site.",
  },
  {
    contem: "Password should be at least",
    texto: "A senha precisa ter pelo menos 6 caracteres.",
  },
  {
    contem: "New password should be different from the old password",
    texto: "A nova senha precisa ser diferente da atual.",
  },
  {
    contem: "already been registered",
    texto: "Já existe um usuário com esse e-mail.",
  },
  { contem: "already registered", texto: "Já existe um usuário com esse e-mail." },
  {
    contem: "Unable to validate email address",
    texto: "E-mail inválido. Confira se não faltou o @ ou o domínio.",
  },
  {
    contem: "email rate limit exceeded",
    texto:
      "Muitos e-mails enviados em pouco tempo. Espere alguns minutos e tente de novo.",
  },
  {
    contem: "For security purposes, you can only request this after",
    texto: "Aguarde alguns segundos antes de tentar de novo.",
  },
  {
    contem: "Invalid login credentials",
    texto: "E-mail ou senha incorretos.",
  },
  { contem: "Email not confirmed", texto: "Confirme seu e-mail antes de entrar." },
  {
    contem: "User not found",
    texto: "Usuário não encontrado.",
  },
  {
    contem: "Token has expired or is invalid",
    texto: "Este link não vale mais. Peça um novo.",
  },
]

export function mensagemDeErroAuth(original: string | null | undefined): string {
  const msg = (original ?? "").trim()
  if (!msg) return "Não foi possível concluir. Tente de novo."
  const baixo = msg.toLowerCase()
  for (const t of TRADUCOES) {
    if (baixo.includes(t.contem.toLowerCase())) return t.texto
  }
  // Sem tradução conhecida, devolve o original: melhor inglês do que uma
  // mensagem genérica que esconde a causa de quem poderia resolver.
  return msg
}
