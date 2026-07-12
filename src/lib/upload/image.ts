import "server-only"

/**
 * Validação de upload de imagem por MAGIC BYTES (o conteúdo real do arquivo),
 * não pelo file.type (que o cliente forja) nem pela extensão do nome.
 * Aceita só PNG, JPEG e WEBP. SVG é REJEITADO de propósito: pode conter
 * <script> e, aberto direto pela URL do Storage, executa (XSS armazenado).
 */

export type ImageCheck =
  | { ok: true; ext: "png" | "jpg" | "webp"; contentType: string; bytes: Uint8Array }
  | { ok: false; message: string }

const DEFAULT_MAX = 2 * 1024 * 1024 // 2 MB

export async function validateImageUpload(
  file: unknown,
  maxBytes: number = DEFAULT_MAX,
): Promise<ImageCheck> {
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, message: "Selecione um arquivo de imagem." }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / 1024 / 1024)
    return { ok: false, message: `Imagem muito grande (máx. ${mb} MB).` }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  // PNG: 89 50 4E 47
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { ok: true, ext: "png", contentType: "image/png", bytes }
  }
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ok: true, ext: "jpg", contentType: "image/jpeg", bytes }
  }
  // WEBP: "RIFF"...."WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ok: true, ext: "webp", contentType: "image/webp", bytes }
  }

  return { ok: false, message: "Formato inválido. Use PNG, JPG ou WEBP." }
}
