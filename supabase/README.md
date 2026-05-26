# Supabase — migrations

Cada arquivo SQL em `migrations/` representa uma mudança incremental no banco.
Aplicar em ordem numérica.

## Como aplicar uma migration

1. Abre o Supabase Dashboard → **SQL Editor** → **New query**
2. Cola o conteúdo do arquivo `.sql`
3. Clica em **Run** (ou `⌘+Enter`)
4. Confere em **Table Editor** que as tabelas/colunas/policies esperadas existem

## Convenção de nomes

`NNNN_descrição_curta.sql` — onde NNNN é sequencial e zero-padded.
Não renomeie ou edite arquivos já aplicados; crie um novo para mudanças.

## Por que SQL Editor e não Supabase CLI?

No v0.1 priorizamos simplicidade. Quando o time crescer ou as migrations ficarem
frequentes, vale migrar para [Supabase CLI](https://supabase.com/docs/guides/cli)
que aplica e versiona migrations automaticamente.
