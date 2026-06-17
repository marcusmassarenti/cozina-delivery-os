/**
 * Expande arquivos .zip em File[] virtuais com os .xlsx/.csv internos.
 *
 * O 99 Food (e o iFood, em alguns endpoints) exporta tudo zipado quando
 * o operador baixa vários relatórios de uma vez. Esse helper roda ANTES
 * do loop de `processFile` pra que cada arquivo dentro do zip apareça
 * como se tivesse sido subido individualmente.
 *
 * Comportamento:
 *  - Arquivos que não são .zip passam direto.
 *  - .zip vira N arquivos virtuais com nome original (do path dentro do zip).
 *  - Ignora entradas que não sejam .xlsx, .xls ou .csv (ex.: README,
 *    pastas vazias, arquivos macOS de metadado tipo __MACOSX/).
 *  - Em caso de erro descompactando, devolve o .zip original na lista
 *    pra o processador retornar mensagem de erro amigável.
 */
import "server-only"

import JSZip from "jszip"

const SUPPORTED_INNER_EXTS = [".xlsx", ".xls", ".csv"] as const

/** Detecta zip pelo nome (extensão) ou pela magic number "PK\x03\x04". */
function isZip(file: File): boolean {
  if (file.name.toLowerCase().endsWith(".zip")) return true
  // Tipo MIME pode vir vazio em alguns browsers/uploads — confiamos no nome.
  return file.type === "application/zip"
}

function isMacOsxJunk(path: string): boolean {
  return (
    path.startsWith("__MACOSX/") ||
    path.endsWith("/.DS_Store") ||
    path.includes("/._")
  )
}

function isSupportedInner(name: string): boolean {
  const lower = name.toLowerCase()
  return SUPPORTED_INNER_EXTS.some((ext) => lower.endsWith(ext))
}

export type ExpandResult = {
  files: File[]
  expansions: Array<{ zip: string; extracted: number; skipped: number }>
}

export async function expandZips(input: File[]): Promise<ExpandResult> {
  const out: File[] = []
  const expansions: ExpandResult["expansions"] = []

  for (const file of input) {
    if (!isZip(file)) {
      out.push(file)
      continue
    }
    try {
      const buf = await file.arrayBuffer()
      const zip = await JSZip.loadAsync(buf)
      let extracted = 0
      let skipped = 0
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue
        if (isMacOsxJunk(path)) continue
        if (!isSupportedInner(path)) {
          skipped++
          continue
        }
        const inner = await entry.async("arraybuffer")
        // Usa o nome do arquivo (sem diretório) pra ficar mais legível
        // nos resultados.
        const baseName = path.split("/").pop() ?? path
        out.push(
          new File([inner], baseName, {
            type:
              baseName.toLowerCase().endsWith(".csv")
                ? "text/csv"
                : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            lastModified: entry.date?.getTime() ?? Date.now(),
          }),
        )
        extracted++
      }
      expansions.push({ zip: file.name, extracted, skipped })
    } catch {
      // Mantém o .zip na lista pra o processFile devolver erro com
      // mensagem clara ("não consegui abrir o arquivo").
      out.push(file)
    }
  }

  return { files: out, expansions }
}
