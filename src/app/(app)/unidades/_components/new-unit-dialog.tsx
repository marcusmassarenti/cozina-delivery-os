"use client"

import { DadosDaUnidade, OperacaoDaUnidade } from "@/components/unidades/dados-da-unidade"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CampoCnpj } from "@/components/unidades/campo-cnpj"
import { TIPOS_COZINHA, TIPOS_OPERACAO } from "@/lib/unidade-perfil"
import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import {
  PlatformLogo,
  type CanalId,
  type PlatformId,
} from "@/components/platform-logo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { validacaoPtBr } from "@/components/shared/form-validacao-ptbr"
import Link from "next/link"
import { createUnit, type CreateUnitState } from "../_actions"

const UFs = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]

const PLATFORMS: { id: CanalId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
  { id: "cardapioweb", label: "Cardápio Web" },
]

const initial: CreateUnitState = { ok: false }

function maskCnpj(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
}

export function NewUnitDialog({
  cadastroExigente,
}: {
  /** Cliente SaaS: CNPJ + inauguração + plataforma obrigatórios. */
  cadastroExigente?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  /** "cadastro" = formulário; "conectar" = o que fazer com o que foi salvo. */
  const [etapa, setEtapa] = React.useState<"cadastro" | "conectar">("cadastro")
  const [state, formAction] = useActionState(createUnit, initial)
  const [cnpj, setCnpj] = React.useState("")
  const [uf, setUf] = React.useState("SP")
  // Preenchida pela Receita quando o CNPJ é consultado; editável sempre.
  const [cidade, setCidade] = React.useState("")
  const router = useRouter()

  /**
   * Salvou → NÃO fecha. Emenda no passo de conectar as plataformas.
   *
   * ── O FLUXO QUE ISSO CONSERTA (Marcus, 18/08/26) ────────────────────────
   * O diálogo fechava no sucesso e o assunto morria ali. Pra conectar de fato,
   * a pessoa tinha que descobrir sozinha que precisava reabrir o cadastro e
   * caçar a integração — e marcar a plataforma no cadastro NÃO conecta nada,
   * só declara "esta loja vende aqui". Quem acabou de dizer onde vende é
   * exatamente quem está pronto pra conectar; mandar embora nessa hora é
   * perder a única pessoa com o contexto na cabeça.
   */
  React.useEffect(() => {
    if (state.ok && state.criada) {
      setEtapa("conectar")
      router.refresh()
    }
  }, [state, router])

  function fechar() {
    setOpen(false)
    setEtapa("cadastro")
    setCnpj("")
    setUf("SP")
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : fechar())}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-3.5" />
            Nova Unidade
          </button>
        }
      />
      <DialogContent className="max-h-[calc(100dvh-6rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {etapa === "cadastro" ? "Nova unidade" : "Loja criada · conecte as plataformas"}
          </DialogTitle>
          <DialogDescription>
            {etapa === "cadastro"
              ? "Cadastre uma loja da sua operação. O código é gerado automaticamente."
              : "Marcar a plataforma no cadastro diz onde a loja vende. Conectar é o que faz o dado entrar sozinho."}
          </DialogDescription>
        </DialogHeader>

        {etapa === "conectar" && state.criada ? (
          <PassoConectar criada={state.criada} onFechar={fechar} />
        ) : (
        <form
          action={formAction}
          {...validacaoPtBr}
          className="flex flex-col gap-3"
        >
          {/* Duas abas: o cadastro que quase não muda de um lado, o que muda
              toda semana do outro. Juntos, o CNPJ ficava soterrado embaixo de
              campo técnico de plataforma — e foi assim que 18 unidades
              chegaram sem CNPJ nenhum. */}
          <Tabs defaultValue="dados">
            <TabsList>
              <TabsTrigger value="dados">Dados da unidade</TabsTrigger>
              <TabsTrigger value="operacao">Operação</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="pt-3">
              <DadosDaUnidade
                erroCnpj={state.fieldErrors?.cnpj}
                cidade={cidade}
                onCidade={setCidade}
                // Mesma ligação do Editar: sem ela a UF fica no padrão mesmo
                // com a Receita tendo respondido o estado certo.
                onUf={setUf}
              />
              <input type="hidden" name="state" value={uf} />
              <div className="mt-3 w-32">
                <label className="text-xs font-medium">UF</label>
                <Select value={uf} onValueChange={(v) => setUf(v ?? "SP")}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UFs.map((u: string) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="operacao" className="pt-3">
              <OperacaoDaUnidade>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium">
                      Inauguração{cadastroExigente ? " *" : ""}
                    </label>
                    <Input
                      className="mt-1"
                      name="data_inauguracao"
                      type="date"
                      required={cadastroExigente}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">
                      Encerramento (se fechou)
                    </label>
                    <Input className="mt-1" name="data_encerramento" type="date" />
                  </div>
                </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium">
              {cadastroExigente ? "Plataformas ativas *" : "Plataformas ativas"}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map((p) => (
                <PlatformCheckbox key={p.id} platform={p} />
              ))}
            </div>
            {state.fieldErrors?.platforms && (
              <p className="text-[11px] text-rose-600">
                {state.fieldErrors.platforms}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Marque as plataformas onde essa loja opera. Pode mudar depois.
            </p>
          </div>


          <div className="flex items-center gap-2">
            <input
              id="active"
              name="active"
              type="checkbox"
              defaultChecked
              className="size-4 rounded border-border"
            />
            <Label
              htmlFor="active"
              className="cursor-pointer text-sm font-normal"
            >
              Unidade ativa (recebendo pedidos)
            </Label>
          </div>

          {state.message && !state.ok && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
              {state.message}
            </div>
          )}


              </OperacaoDaUnidade>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={fechar}
            >
              Cancelar
            </Button>
            <SubmitButton />
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PlatformCheckbox({
  platform,
}: {
  platform: { id: CanalId; label: string }
}) {
  const [checked, setChecked] = React.useState(true)
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors ${
        checked
          ? "border-primary bg-primary/5"
          : "border-border bg-card opacity-60 hover:opacity-100"
      }`}
    >
      <input
        type="checkbox"
        name="platforms"
        value={platform.id}
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="size-3.5 rounded border-border"
      />
      <PlatformLogo platform={platform.id} size="sm" />
      <span>{platform.label}</span>
    </label>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && (
        <span className="text-[11px] text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando..." : "Criar unidade"}
    </Button>
  )
}


/**
 * Passo 2: o que fazer com a loja que acabou de ser criada.
 *
 * Cada plataforma escolhida vira uma linha com o caminho REAL da conexão —
 * nada de "vá em Integrações e procure". A loja sem CNPJ ganha o aviso, porque
 * é ele que o iFood e o 99 usam pra achar o merchant, e descobrir isso só na
 * tela de conexão é voltar duas telas.
 *
 * Keeta fica de fora de propósito: não tem API de conexão — entra por
 * planilha, e prometer um botão que não existe é pior que não falar nada.
 */
function PassoConectar({
  criada,
  onFechar,
}: {
  criada: NonNullable<CreateUnitState["criada"]>
  onFechar: () => void
}) {
  /**
   * Salvar deixou de ser o fim do fluxo.
   *
   * ── O QUE ISTO SUBSTITUI (Marcus, 18/08/26) ────────────────────────────
   * Aqui havia um MENU de links, um por plataforma, cada um levando pra uma
   * tela de integração diferente. Parecia resolver, mas empurrava o problema:
   * quem clicava saía do cadastro e caía numa tela genérica, sem saber o que
   * já tinha feito nem o que faltava — e quem não clicava fechava o diálogo e
   * nunca mais voltava. "O cliente cadastra, escolhe as plataformas, aperta
   * salvar e sai da tela."
   *
   * Agora existe uma esteira só, com estado por plataforma e um "já fiz" que
   * avisa o nosso time. O diálogo apenas entrega o cliente nela.
   */
  const comConexao = criada.plataformas.filter((p) => p !== "keeta")
  const soKeeta = criada.plataformas.length > 0 && comConexao.length === 0

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
        <b>{criada.nome}</b> foi cadastrada.
      </p>

      {!criada.cnpj && comConexao.length > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Esta loja ficou <b>sem CNPJ</b>. É por ele que o iFood acha a loja —
          vale preencher antes de pedir a conexão.
        </p>
      )}

      {criada.plataformas.length > 0 ? (
        <>
          <div className="rounded-lg border p-3">
            <p className="text-[13px] font-semibold">
              Falta conectar {criada.plataformas.length}{" "}
              {criada.plataformas.length === 1 ? "plataforma" : "plataformas"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {criada.plataformas.map((p) => (
                <PlatformLogo key={p} platform={p} />
              ))}
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
              {soKeeta
                ? "A Keeta entra por planilha — a próxima tela mostra como."
                : "Cada uma conecta de um jeito. A próxima tela leva você por elas, uma de cada vez, e guarda o que já foi feito."}
            </p>
          </div>

          <Link
            href={`/conectar-loja/${encodeURIComponent(criada.codigo)}`}
            onClick={onFechar}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-bold text-primary-foreground"
          >
            Conectar agora
          </Link>
          <button
            type="button"
            onClick={onFechar}
            className="text-center text-[12px] text-muted-foreground hover:text-foreground"
          >
            Deixar pra depois
          </button>
        </>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">
            Nenhuma plataforma foi marcada nesta loja. Dá pra escolher depois,
            no cadastro dela.
          </p>
          <button
            type="button"
            onClick={onFechar}
            className="w-full rounded-lg border px-4 py-2 text-sm font-semibold"
          >
            Fechar
          </button>
        </>
      )}
    </div>
  )
}

