# Auditoria de segurança — checklist

Roteiro mínimo antes de subir em produção. Não substitui pentest, mas
elimina os erros mais comuns.

## 1. Varredura de segredos (local, automatizado)

```bash
chmod +x scripts/security-audit/audit-secrets.sh
./scripts/security-audit/audit-secrets.sh
```

O script checa:
- `.env*` trackeados no git **agora**
- `.env*` que já existiram **no histórico** (mesmo se removidos depois)
- `.env*` na working dir não cobertos pelo `.gitignore`
- chaves conhecidas hardcoded (AWS, OpenAI, Stripe, Resend, JWT, PEM, etc.)
- `SUPABASE_SERVICE_ROLE_KEY` usada em arquivo que **não importa**
  `"server-only"` (risco de ir pro bundle do browser)
- `NEXT_PUBLIC_*` com cara de segredo (vão pro bundle do cliente)

Exit code != 0 se achou algo. Resolva tudo antes de prosseguir.

**Se um `.env` já existiu no histórico do git**: assuma que vazou. Não
basta remover do HEAD — quem clonou tem cópia eterna. Ações:
1. Rotacione todas as chaves que estavam dentro (Supabase, R2, Resend, etc.).
2. Considere reescrever o histórico (`git filter-repo`), mas só faz sentido
   pra repos privados; se já é público, o git history não vai apagar nada
   pra quem clonou.

## 2. Auditoria de RLS (Supabase SQL Editor)

Abra `scripts/security-audit/audit-rls.sql`, copie bloco por bloco e
rode no **Supabase Dashboard → SQL Editor**. Cada bloco está comentado.

Pontos críticos:
- **Bloco 1**: tabela em `public` com RLS `OFF` é leitura/escrita
  liberada pra qualquer chave anon → vazamento entre tenants.
- **Bloco 2**: tabela com RLS ligada mas zero policies = ninguém entra
  (intencional pra tabelas tipo `api_clients` que só o backend
  manipula). Confirme caso a caso.
- **Bloco 4**: policies que dão acesso a `anon` ou `public` precisam ser
  verificadas com lupa.

## 3. Teste manual de isolamento (multi-tenant)

Não tem auditoria automatizada que substitua. Faça:

1. Crie 2 unidades distintas (`A` e `B`).
2. Crie 1 user franqueado (`f1`) vinculado **apenas** à unidade A.
3. Abra o app em aba anônima, logue como `f1`.
4. Acesse via URL direta `https://seu-app.vercel.app/unidades/<codigo-B>/...`
5. **Esperado**: 404 ou "sem permissão". **Errado**: renderizou dados de B.

Faça pra cada tela que mostra dados por unidade:
- `/unidades` (lista — só deve mostrar A)
- `/unidades/<codigo>` (detalhe)
- `/unidades/<codigo>/lancamentos`
- Dashboard (`/`)
- Importação, cobertura, financeiro, pedidos

## 4. Outros itens (manuais, sem script)

| Item | Como verificar |
|---|---|
| Vercel env vars conferem com `.env.local`? | Vercel dashboard → projeto → Settings → Environment Variables |
| `service_role` está só em `Production`/`Preview`/`Development` server-side? | Mesma tela; nunca deve estar marcada como "exposed to client" |
| Logs da Vercel não printam secrets? | Vercel → Logs, busca por "SUPABASE_SERVICE_ROLE", "Bearer", etc. |
| Vercel branch protection ligada na `main`? | GitHub → Settings → Branches → Branch protection rules |
| 2FA obrigatório nos owners do repo, Vercel e Supabase? | Conta a conta |
| Senha do Supabase é forte e única? | Settings → Database → Reset se houver dúvida |

## 5. Rotação periódica (calendário)

| A cada | O quê |
|---|---|
| 90 dias | R2 API token, Resend key |
| 180 dias | Supabase DB password, Vercel deploy hook tokens (se houver) |
| Em qualquer suspeita de vazamento | Tudo, imediatamente |
