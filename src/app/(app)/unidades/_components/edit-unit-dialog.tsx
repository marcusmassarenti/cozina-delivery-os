"use client"

import { DadosDaUnidade, OperacaoDaUnidade } from "@/components/unidades/dados-da-unidade"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import {
  Cable,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  Pencil,
  Plug,
  Power,
  Store,
} from "lucide-react"

import { CoachTour, type CoachStep } from "@/components/onboarding/coach-tour"
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
import { updateUnit, type CreateUnitState } from "../_actions"
import { solicitarAtivacaoIfood } from "../_actions-ifood-ativacao"
import {
  solicitarAtivacaoNinefood,
  confirmarAutorizacaoNinefood,
} from "../_actions-99-ativacao"
import { LINK_AUTORIZACAO_99 } from "@/lib/ninefood/autorizacao"
import { UnitLogoUploader } from "./unit-logo-uploader"

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

/** Passos do "Como funciona" do cadastro/edição da unidade. */
const EDIT_STEPS: CoachStep[] = [
  {
    selector: '[data-tour="u-nome"]',
    icon: <Store className="size-4" />,
    title: "Identificação da loja",
    body: "Nome da loja (como aparece no sistema), cidade e UF. O CNPJ identifica a loja nas plataformas — é ele que usamos pra conectar o iFood via API.",
  },
  {
    selector: '[data-tour="u-inauguracao"]',
    icon: <Calendar className="size-4" />,
    title: "Inauguração da unidade",
    body: "É a DATA DE ABERTURA da loja. O sistema ignora os meses antes dela existir — assim a Cobertura não cobra relatório de um período em que a loja nem operava.",
  },
  {
    selector: '[data-tour="u-plataformas"]',
    icon: <Cable className="size-4" />,
    title: "Plataformas e IDs das lojas",
    body: "Marque onde a loja opera e cole o ID dela em cada plataforma (iFood, 99, Keeta). É pelo ID que a importação reconhece a loja automaticamente — sem ele, ela aparece como 'loja desconhecida' na hora de importar.",
  },
  {
    selector: '[data-tour="u-ativa"]',
    icon: <Power className="size-4" />,
    title: "Unidade ativa",
    body: "Marcada = recebendo pedidos e contando nos relatórios. Desmarque se a loja fechou ou pausou.",
  },
]

function maskCnpj(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
}

export type EditUnitInitial = {
  unitId: string
  code: string
  name: string
  city: string | null
  state: string | null
  cnpj: string | null
  active: boolean
  dataInauguracao: string | null
  dataEncerramento: string | null
  platforms: CanalId[]
  /** Mapeamento PlatformId → ID da loja na plataforma (iFood: 260777, etc.) */
  externalStoreIds?: Partial<Record<PlatformId, string | null>>
  /** Inauguração por plataforma (override da data da unidade). */
  platformInauguracoes?: Partial<Record<PlatformId, string | null>>
  /** Logo da loja (white-label por unidade). */
  logoUrl?: string | null
  /** Cadastro rico. Opcionais: as unidades antigas ainda não têm. */
  razaoSocial?: string | null
  tipoCozinha?: string | null
  tipoOperacao?: string | null
  tipoEntrega?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cep?: string | null
  telefone?: string | null
  responsavelNome?: string | null
  responsavelEmail?: string | null
  cnaeDescricao?: string | null
  situacaoCadastral?: string | null
}

/** Situação da conexão iFood-via-API, resumida pro cadastro. */
export type IfoodApiCadastro = "conectada" | "andamento" | "disponivel"

export function EditUnitDialog({
  unit,
  inline,
  ifoodApi,
  nineApi,
  cadastroExigente,
}: {
  unit: EditUnitInitial
  inline?: boolean
  /** Omitido = loja sem iFood ativo (bloco não aparece). */
  ifoodApi?: IfoodApiCadastro
  /** true = a loja sincroniza financeiro+cardápio pela API do 99. */
  /** Mesma régua do iFood: conectada · andamento · disponivel. */
  nineApi?: IfoodApiCadastro
  /** Cliente SaaS: CNPJ + inauguração + plataforma obrigatórios (o
   *  superadmin fica isento — casos legados da Cozina). */
  cadastroExigente?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [tourOpen, setTourOpen] = React.useState(false)
  const [state, formAction] = useActionState(updateUnit, initial)
  const [solicitacaoState, solicitarAction] = useActionState(
    solicitarAtivacaoIfood,
    { ok: false },
  )
const [solicitacao99State, solicitar99Action] = useActionState(
    solicitarAtivacaoNinefood,
    { ok: false },
  )
  const [confirmou99State, confirmar99Action] = useActionState(
    confirmarAutorizacaoNinefood,
    { ok: false },
  )
  const [cnpj, setCnpj] = React.useState(unit.cnpj ? maskCnpj(unit.cnpj) : "")
  const [uf, setUf] = React.useState(unit.state ?? "SP")
  const [cidade, setCidade] = React.useState(unit.city ?? "")
  const router = useRouter()

  React.useEffect(() => {
    if (solicitacaoState.ok) router.refresh()
  }, [solicitacaoState.ok, router])

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  const trigger = inline ? (
    <button
      type="button"
      aria-label="Editar unidade"
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Pencil className="size-3.5" />
    </button>
  ) : (
    <button
      type="button"
      className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
    >
      <Pencil className="size-3.5" />
      Editar
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100dvh-6rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-7">
            <div className="flex items-center gap-2.5">
              <UnitLogoUploader
                compact
                unitId={unit.unitId}
                unitName={unit.name}
                currentLogo={unit.logoUrl ?? null}
              />
              <DialogTitle>Editar unidade</DialogTitle>
            </div>
            <button
              type="button"
              onClick={() => setTourOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Compass className="size-3.5" />
              Como funciona
            </button>
          </div>
          <DialogDescription>
            Código <span className="font-mono font-semibold">#{unit.code}</span>
            {" "}— não pode ser alterado.
          </DialogDescription>
        </DialogHeader>

        <form
          action={formAction}
          {...validacaoPtBr}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="unitId" value={unit.unitId} />

          {/* Mesmas duas abas do "Nova unidade": o cadastro que quase não
              muda de um lado, o que muda toda semana do outro. */}
          <Tabs defaultValue="dados">
            <TabsList>
              <TabsTrigger value="dados">Dados da unidade</TabsTrigger>
              <TabsTrigger value="operacao">Operação</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="pt-3">
              <DadosDaUnidade
                nome={unit.name}
                erroCnpj={state.fieldErrors?.cnpj}
                cidade={cidade}
                onCidade={setCidade}
                // Sem isto a consulta trazia a cidade e deixava o estado no
                // padrão — "GOIANIA / SP" na Le Petit Pastéis.
                onUf={setUf}
                perfil={{
                  cnpj: unit.cnpj ? maskCnpj(unit.cnpj) : "",
                  razaoSocial: unit.razaoSocial,
                  tipoCozinha: unit.tipoCozinha,
                  tipoOperacao: unit.tipoOperacao,
                  tipoEntrega: unit.tipoEntrega,
                  logradouro: unit.logradouro,
                  numero: unit.numero,
                  complemento: unit.complemento,
                  bairro: unit.bairro,
                  cep: unit.cep,
                  telefone: unit.telefone,
                  responsavelNome: unit.responsavelNome,
                  responsavelEmail: unit.responsavelEmail,
                  cnaeDescricao: unit.cnaeDescricao,
                  situacaoCadastral: unit.situacaoCadastral,
                }}
              />
              <input type="hidden" name="state" value={uf} />
              <div className="mt-3 w-32">
                <Field label="UF" error={state.fieldErrors?.state}>
                  <Select value={uf} onValueChange={(v) => setUf(v ?? "SP")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UFs.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="operacao" className="flex flex-col gap-3 pt-3">
              <OperacaoDaUnidade
                perfil={{
                  tipoOperacao: unit.tipoOperacao,
                  tipoEntrega: unit.tipoEntrega,
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div data-tour="u-inauguracao">
                    <Field
                      label={cadastroExigente ? "Inauguração *" : "Inauguração"}
                      error={state.fieldErrors?.data_inauguracao}
                    >
                      <Input
                        name="data_inauguracao"
                        type="date"
                        defaultValue={unit.dataInauguracao ?? ""}
                        required={cadastroExigente}
                      />
                    </Field>
                  </div>
                  <Field label="Encerramento (se fechou)">
                    <Input
                      name="data_encerramento"
                      type="date"
                      defaultValue={unit.dataEncerramento ?? ""}
                    />
                  </Field>
                </div>
              </OperacaoDaUnidade>

          <p className="-mt-2 text-[11px] text-muted-foreground">
            A inauguração faz a Cobertura ignorar meses antes da loja existir
            (não cobra dado que não tinha como ter).
          </p>

          <div data-tour="u-plataformas" className="flex flex-col gap-2">
            <Label className="text-xs font-medium">
              {cadastroExigente ? "Plataformas ativas *" : "Plataformas ativas"}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map((p) => (
                <PlatformCheckbox
                  key={p.id}
                  platform={p}
                  defaultChecked={unit.platforms.includes(p.id)}
                />
              ))}
            </div>
            {state.fieldErrors?.platforms && (
              <p className="text-[11px] text-rose-600">
                {state.fieldErrors.platforms}
              </p>
            )}
            <PlatformIdsBlock
              externalStoreIds={unit.externalStoreIds ?? {}}
              platformInauguracoes={unit.platformInauguracoes ?? {}}
            />
          </div>

          {/* Conexão iFood via API — status mora AQUI no cadastro (pedido do
              Marcus: banner permanente na página poluía). O botão usa
              formAction pra disparar a action de solicitação SEM form
              aninhado (inválido em HTML) — os campos do cadastro vão juntos,
              e a action lê o cnpj_api. */}
          {(ifoodApi === "conectada" || nineApi === "conectada") && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5 shrink-0" />
              <span>
                <b>
                  {[
                    ifoodApi === "conectada" ? "iFood" : null,
                    nineApi === "conectada" ? "99 Food" : null,
                  ]
                    .filter(Boolean)
                    .join(" e ")}{" "}
                  conectado via API
                </b>{" "}
                — financeiro entra sozinho, sem importação manual.
              </span>
            </div>
          )}
          {ifoodApi === "andamento" && (
            <div className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400">
              <Clock className="size-3.5 shrink-0" />
              <span>
                <b>Conexão iFood via API em andamento</b> — acompanhe o status
                na página da loja.
              </span>
            </div>
          )}
          {ifoodApi === "disponivel" && (
            <div className="flex flex-col gap-2 rounded-md border bg-muted/30 px-3 py-2.5">
              <p className="text-xs">
                <b>Conectar iFood via API</b>{" "}
                <span className="text-muted-foreground">
                  — o financeiro passa a entrar sozinho, sem importação manual.
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="unit_id" value={unit.unitId} />
                {/* Cliente SaaS: o CNPJ já é obrigatório no cadastro acima —
                    o formAction envia o form inteiro, então a action lê o
                    campo "cnpj" direto. Sem pedir duas vezes. */}
                {!cadastroExigente && (
                  <input
                    name="cnpj_api"
                    inputMode="numeric"
                    defaultValue={unit.cnpj ? maskCnpj(unit.cnpj) : ""}
                    placeholder="CNPJ da loja no iFood"
                    className="h-8 w-44 rounded-md border bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  formAction={solicitarAction}
                  formNoValidate
                >
                  <Plug className="size-3.5" />
                  Solicitar conexão
                </Button>
                {cadastroExigente && (
                  <span className="text-[10px] text-muted-foreground">
                    usa o CNPJ do cadastro acima
                  </span>
                )}
              </div>
              {solicitacaoState.message && (
                <p
                  className={`text-[11px] ${
                    solicitacaoState.ok
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {solicitacaoState.message}
                </p>
              )}

          {/* 99 Food — mesma anatomia do bloco do iFood acima. A conexão do 99
              também não é self-service: o `app_shop_id` é definido no portal
              deles, então a loja precisa ser autorizada ao nosso app antes de
              qualquer sincronização. Até esta tela existir, as 7 lojas ligadas
              tinham entrado por INSERT escrito à mão numa migration. */}
          {nineApi === "andamento" && (
            /* A autorização do 99 é FEITA PELO LOJISTA, no portal deles — não
               por nós. Descoberto em 06/ago/26; antes esta faixa dizia
               "estamos pedindo a autorização ao 99", o que deixava o cliente
               esperando por uma etapa que era dele. */
            <div className="flex flex-col gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400">
              <span className="flex items-start gap-2">
                <Clock className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  <b>Falta você autorizar no portal do 99.</b> Abra o link,
                  escolha esta loja, confirme e marque o estabelecimento. Você
                  precisa estar logado no 99 com a conta dona da loja.
                </span>
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={LINK_AUTORIZACAO_99}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sky-600 px-3 text-[11px] font-medium text-white hover:bg-sky-700"
                >
                  Autorizar no portal do 99
                </a>
                <input type="hidden" name="unit_id" value={unit.unitId} />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  formAction={confirmar99Action}
                  formNoValidate
                >
                  Já autorizei
                </Button>
              </div>
              {confirmou99State.message && (
                <p
                  className={`text-[11px] ${
                    confirmou99State.ok
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {confirmou99State.message}
                </p>
              )}
            </div>
          )}
          {nineApi === "disponivel" && (
            <div className="flex flex-col gap-2 rounded-md border bg-muted/30 px-3 py-2.5">
              <p className="text-xs">
                <b>Conectar 99 Food via API</b>{" "}
                <span className="text-muted-foreground">
                  — o financeiro e o cardápio passam a entrar sozinhos, sem
                  importação manual.
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="unit_id" value={unit.unitId} />
                {!cadastroExigente && (
                  <input
                    name="cnpj_api_99"
                    inputMode="numeric"
                    defaultValue={unit.cnpj ? maskCnpj(unit.cnpj) : ""}
                    placeholder="CNPJ da loja no 99"
                    className="h-8 w-44 rounded-md border bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
                {/* OBRIGATÓRIO desde 06/ago/26. Era opcional quando eu achava
                    que o CNPJ bastava — mas o payload do pedido do 99 NÃO traz
                    CNPJ, e é pelo nome que o vínculo automático casa a loja
                    quando o 1º webhook chega. Vazio aqui = conexão que nunca
                    fecha sozinha. */}
                <input
                  name="loja_99"
                  required
                  placeholder="Nome da loja no 99 (igual ao painel)"
                  className="h-8 w-52 rounded-md border bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  formAction={solicitar99Action}
                  formNoValidate
                >
                  <Plug className="size-3.5" />
                  Solicitar conexão
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Uma loja só pode estar ligada a um aplicativo no 99. Se ela já
                usa outro integrador, avisamos antes de mexer.
              </p>
              {solicitacao99State.message && (
                <p
                  className={`text-[11px] ${
                    solicitacao99State.ok
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {solicitacao99State.message}
                </p>
              )}
            </div>
          )}
            </div>
          )}

          <div data-tour="u-ativa" className="flex items-center gap-2">
            <input
              id="active"
              name="active"
              type="checkbox"
              defaultChecked={unit.active}
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

            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>

      <CoachTour
        steps={EDIT_STEPS}
        open={tourOpen}
        onClose={() => setTourOpen(false)}
      />
    </Dialog>
  )
}

function PlatformIdsBlock({
  externalStoreIds,
  platformInauguracoes,
}: {
  externalStoreIds: Partial<Record<PlatformId, string | null>>
  platformInauguracoes: Partial<Record<PlatformId, string | null>>
}) {
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border bg-muted/30 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        IDs das lojas nas plataformas
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <PlatformIdInput
          name="ifoodStoreId"
          label="iFood"
          placeholder="ex.: 260777"
          defaultValue={externalStoreIds.ifood ?? ""}
        />
        <PlatformIdInput
          name="_99foodStoreId"
          label="99 Food"
          placeholder="ID da loja"
          defaultValue={externalStoreIds["99food"] ?? ""}
        />
        <PlatformIdInput
          name="keetaStoreId"
          label="Keeta"
          placeholder="ID da loja"
          defaultValue={externalStoreIds.keeta ?? ""}
        />
      </div>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Inauguração por plataforma (se diferente da loja)
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <PlatformDateInput
          name="ifoodInauguracao"
          label="iFood"
          defaultValue={platformInauguracoes.ifood ?? ""}
        />
        <PlatformDateInput
          name="_99foodInauguracao"
          label="99 Food"
          defaultValue={platformInauguracoes["99food"] ?? ""}
        />
        <PlatformDateInput
          name="keetaInauguracao"
          label="Keeta"
          defaultValue={platformInauguracoes.keeta ?? ""}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        ID = importação automática reconhecer a loja. Inauguração = a Cobertura
        ignora meses antes da loja entrar naquela plataforma.
      </p>
    </div>
  )
}

function PlatformDateInput({
  name,
  label,
  defaultValue,
}: {
  name: string
  label: string
  defaultValue: string
}) {
  const [value, setValue] = React.useState(defaultValue)
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] font-medium text-muted-foreground">
        {label}
      </Label>
      <Input
        name={name}
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 text-xs"
      />
    </div>
  )
}

function PlatformIdInput({
  name,
  label,
  placeholder,
  defaultValue,
}: {
  name: string
  label: string
  placeholder: string
  defaultValue: string
}) {
  // Controlled pra evitar warning do Base UI quando o defaultValue chega
  // depois da 1ª render (vem do server). Inicializa com o valor já recebido.
  const [value, setValue] = React.useState(defaultValue)
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] font-medium text-muted-foreground">
        {label}
      </Label>
      <Input
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-xs"
      />
    </div>
  )
}

function PlatformCheckbox({
  platform,
  defaultChecked,
}: {
  platform: { id: CanalId; label: string }
  defaultChecked: boolean
}) {
  const [checked, setChecked] = React.useState(defaultChecked)
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
      {pending ? "Salvando..." : "Salvar alterações"}
    </Button>
  )
}
