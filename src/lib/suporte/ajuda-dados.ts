import "server-only"

/**
 * O pedaço da resposta pronta que vem do BANCO, não do texto.
 *
 * É o que separa esta central de ajuda de um FAQ estático: "minhas lojas estão
 * conectadas?" não devolve "veja em Conexões", devolve os nomes das lojas e
 * desde quando. Sem modelo no meio — o dado já é a resposta, formatar é tudo
 * o que falta.
 *
 * Nenhuma função aqui inventa estado. Quando não há o que dizer (nenhuma loja
 * aguardando, nenhuma revogada), o texto DIZ isso — "nada pendente" é uma
 * resposta útil, e silêncio nesse lugar lê como falha do sistema.
 */
import type { DadoDaConta } from "@/lib/suporte/ajuda"
import type { RaioX } from "@/lib/data/suporte-raio-x"

const PLATAFORMA: Record<string, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}

function dataBr(iso: string | null): string {
  if (!iso) return "—"
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

function comoConecta(l: RaioX["detalhe"][number]): string {
  const api: string[] = []
  if (l.ifoodApi) api.push("iFood")
  if (l.noveApi) api.push("99 Food")
  if (l.cwApi) api.push("Cardápio Web")
  if (api.length > 0) return `conectada por API no ${api.join(", ")}`
  const p = l.plataformas.map((x) => PLATAFORMA[x] ?? x)
  return p.length > 0 ? `por planilha (${p.join(", ")})` : "sem plataforma cadastrada"
}

export function resolverDado(dado: DadoDaConta, raioX: RaioX | null): string {
  if (!raioX) {
    return "Não consegui ler o estado da sua conta agora. Use o botão abaixo que alguém da equipe verifica."
  }

  switch (dado) {
    case "lojas-conectadas": {
      const ativas = raioX.detalhe.filter((l) => l.ativa)
      if (ativas.length === 0) return "Você ainda não tem loja ativa cadastrada."
      const linhas = ativas.map((l) => `• ${l.nome} — ${comoConecta(l)}`)
      // Contado da MESMA lista que foi listada acima. Usar o total da conta
      // (`raioX.lojas.conectadasIfood`) aqui produzia "14 de 13 estão no iFood
      // por API" — o contador incluía loja inativa e a lista não. Número que
      // se contradiz na mesma frase destrói a confiança na resposta inteira.
      const porApi = ativas.filter((l) => l.ifoodApi).length
      const rodape =
        porApi === ativas.length
          ? "\nTodas no iFood por API — nenhuma depende de planilha."
          : `\n${porApi} de ${ativas.length} estão no iFood por API; o resto ainda depende de planilha.`
      return linhas.join("\n") + rodape
    }

    case "ate-quando-entrou": {
      const ativas = raioX.detalhe.filter((l) => l.ativa)
      if (ativas.length === 0) return "Você ainda não tem loja ativa cadastrada."
      return ativas
        .map(
          (l) =>
            `• ${l.nome} — ${l.ifoodAte ? `até ${dataBr(l.ifoodAte)}` : "nada entrou ainda"}`,
        )
        .join("\n")
    }

    case "aguardando-ifood": {
      const esperando = raioX.detalhe.filter((l) => l.aguardandoIfood)
      if (esperando.length === 0) {
        return "Nenhuma loja sua está esperando aprovação do iFood neste momento. Se você aprovou agora há pouco, a conexão entra em até 15 minutos."
      }
      return (
        `${esperando.length === 1 ? "Uma loja está" : `${esperando.length} lojas estão`} esperando o iFood liberar:\n` +
        esperando.map((l) => `• ${l.nome}`).join("\n") +
        "\n\nA bola está com o iFood. Assim que eles aprovarem, conecta sozinho."
      )
    }

    case "revogadas": {
      if (raioX.revogadas.length === 0) {
        return "Nenhuma loja sua aparece como revogada. Se uma parou de trazer dado mesmo assim, use o botão abaixo — esse caso a gente precisa olhar."
      }
      return (
        "Estas conexões deixaram de ser devolvidas pelo iFood:\n" +
        raioX.revogadas
          .map((r) => `• ${r.loja ?? "loja sem nome"} — desde ${dataBr(r.desde)}`)
          .join("\n") +
        "\n\nÉ reaprovar no Portal do Parceiro, igual à primeira conexão."
      )
    }

    case "plano-e-cobranca": {
      const partes = [`Plano ${raioX.plano ?? "em teste"}`, `cobrança ${raioX.cobranca.status}`]
      if (raioX.cobranca.vencimento) {
        partes.push(`vencimento ${dataBr(raioX.cobranca.vencimento)}`)
      }
      const linha = partes.join(" · ")
      const lojas = `\n${raioX.lojas.ativas} de ${raioX.lojas.total} lojas ativas.`
      return linha + lojas
    }
  }
}
