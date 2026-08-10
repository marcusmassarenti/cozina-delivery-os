import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // `set-state-in-effect` vira AVISO, não erro. Medido em 09/08/2026:
  // 86 dos 129 erros do projeto são essa regra, e a esmagadora maioria é o
  // padrão padrão de SSR — ler localStorage/matchMedia dentro do efeito e
  // guardar no estado, porque no servidor esses valores não existem. É a
  // forma recomendada de evitar erro de hidratação; a regra do compilador do
  // React reclama do custo (um render a mais), não de estar errado.
  //
  // Deixando como erro, a catraca do CI vira ruído: 86 acusações de um padrão
  // que a gente escreve de propósito escondem as ~43 que são problema real
  // (ref lida no render, função impura, `any`, `<a>` pra rota interna).
  // Continua aparecendo em `npm run lint` — só não derruba o CI.
  //
  // O plugin precisa ser declarado no MESMO objeto da regra: no flat config o
  // `eslint-config-next` registra o dele dentro dos objetos dele, e um objeto
  // solto com a regra dá "plugin is not defined".
  //
  // ⚠️ `eslint-plugin-react-hooks` entra aqui como dependência TRANSITIVA do
  // `eslint-config-next` (7.1.1, travado no package-lock). Se algum dia o lint
  // quebrar com "cannot find module", é isso: instalar explícito com
  // `npm i -D --save-exact eslint-plugin-react-hooks@7.1.1`.
  {
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // ⚠️ Sessões isoladas de agente deixam uma CÓPIA INTEIRA do projeto em
    // `.claude/worktrees/<nome>/`. Está no .gitignore, então `git status` fica
    // limpo — mas o ESLint não lê .gitignore, e passava a contar tudo duas
    // vezes. Foi assim que uma medição local deu 129 erros onde o CI (que faz
    // checkout limpo) via 64, e o diagnóstico saiu errado por causa disso.
    ".claude/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
