# Integração ERP — Demanda → Produção

Converte o que as lojas **vendem no delivery** (iFood / 99 Food / Keeta) na
**demanda de insumos** do ERP industrial (códigos CNP), pra gerar previsibilidade
de produção e manter estoque na indústria.

## Arquitetura (quem faz o quê)

| Sistema | Papel |
|---|---|
| **Delivery OS** | Tem o que vendeu (item × loja × período) + a **ficha técnica** (de-para item→insumos). Expõe a **demanda já explodida** por API. |
| **ERP industrial** | Consome a demanda, compara com estoque/lead time e gera as **OPs / reposição**. |

```
venda (item, qtd)  →  de-para (item → prato)  →  ficha (prato → insumos×qtd)  →  demanda (loja × insumo × qtd)
        Delivery OS .................................................→  API  →  ERP
```

## Cadastro (no Delivery OS)

Tela **Ficha Técnica** (`/ficha-tecnica`, só admin):

1. **Catálogo de insumos** — cadastre os insumos do ERP (código CNP, nome,
   unidade) por campos, importando uma planilha `.xlsx`, ou colando texto.
2. **Itens vendidos → insumos** — abra cada item vendido e escolha, no seletor,
   os insumos que ele consome, com a quantidade por unidade vendida.

Itens sem ficha **não somem** — aparecem em `naoMapeados` na API, sinalizando o
que falta cadastrar.

## Endpoint

### `GET /api/v1/demanda-insumos`

Demanda de insumos por loja no mês. **Escopo `read`** (chave gerada em `/conexoes`).

**Query**
| Param | Default | Descrição |
|---|---|---|
| `year` | mês corrente | Ano (ex.: 2026) |
| `month` | mês corrente | Mês 1–12 |

**Auth**: header `Authorization: Bearer <chave>`

**Exemplo**
```bash
curl -H "Authorization: Bearer SUA_CHAVE" \
  "https://SEU_DOMINIO/api/v1/demanda-insumos?year=2026&month=5"
```

**Resposta**
```json
{
  "period": { "year": 2026, "month": 5 },
  "generatedAt": "2026-06-05T12:00:00.000Z",
  "demanda": [
    { "loja": "04", "lojaNome": "Jardins", "codigo": "CNP053", "insumo": "BRISKET 100G", "unidade": "UN", "qtd": 432 },
    { "loja": "04", "lojaNome": "Jardins", "codigo": "CNP061", "insumo": "PULLED PORK 100G", "unidade": "UN", "qtd": 526 }
  ],
  "naoMapeados": [
    { "plataforma": "ifood", "nomeItem": "Combo: ...", "qtd": 414 }
  ]
}
```

- `demanda` — uma linha por **loja × insumo**, com a quantidade total do insumo
  no mês (= soma de `vendas do item × qtd na ficha`). O ERP gera OP/reposição a
  partir disso. `loja` = `code` da unidade (estável pro ERP casar).
- `naoMapeados` — itens vendidos **sem ficha** (não entram na demanda). Quanto
  menor essa lista, mais completa a previsão.

## Outros endpoints úteis (já existentes)

| Endpoint | Pra quê |
|---|---|
| `GET /api/v1/units` | Casar o `code` da loja com o cadastro do ERP |
| `GET /api/v1/faturamento?year&month` | Faturamento/resultado por loja |
| `GET /api/v1/health` | Testar a conexão |

## Notas

- **Granularidade**: mensal (igual ao resto da plataforma). Keeta só fornece item
  por mês, então o endpoint é por `year`/`month`.
- **Unidade**: a `qtd` da ficha é na unidade do insumo (cada insumo define a sua —
  ex.: `UN` = 1 porção de 100g). 1 prato pode usar 2 UN, frações, etc.
- **Onde mora a ficha**: hoje no Delivery OS (MVP). As tabelas `producao_*` são
  portáveis — se um dia a ficha migrar pro ERP, é só exportá-las.
