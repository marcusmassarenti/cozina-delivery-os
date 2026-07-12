"use client"

import Link from "next/link"
import { ArrowLeft, BarChart3, Lock } from "lucide-react"

import { ExperimenteDemo } from "../deliveryos/_demo"

// CSS de marca mínimo (a demo usa --brand / --brand-soft / .btn-brand).
const STYLES = `
.dos-root{--brand:oklch(0.65 0.21 35);--brand-strong:oklch(0.57 0.2 33);--brand-soft:oklch(0.96 0.035 55);--cream:oklch(0.99 0.005 75);color:oklch(0.22 0.01 48);background-color:var(--cream);background-image:radial-gradient(oklch(0.65 0.21 35/.045) 1px,transparent 1px);background-size:24px 24px;min-height:100vh;}
.dos-root *{box-sizing:border-box;}
.btn-brand{background:var(--brand);color:#fff;box-shadow:0 12px 30px -12px oklch(0.65 0.21 35/.7);transition:transform .2s ease,background .2s ease,box-shadow .3s ease;}
.btn-brand:hover{background:var(--brand-strong);transform:translateY(-2px);}
.btn-brand:active{transform:translateY(0) scale(.98);}
`

export default function ExperimentePage() {
  return (
    <div className="dos-root">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2 font-medium">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--brand)] text-white shadow-[0_8px_20px_-8px_oklch(0.65_0.21_35/.8)]">
            <BarChart3 className="size-[18px]" strokeWidth={2.4} />
          </span>
          <span className="text-[17px] tracking-tight">Delivery OS</span>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[oklch(0.45_0.01_48)] transition-colors hover:text-[var(--brand)]"
        >
          <ArrowLeft className="size-4" strokeWidth={2.2} />
          Voltar
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-24 pt-4 sm:pt-10">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] px-3.5 py-1.5 text-xs font-medium text-[var(--brand-strong)]">
            Teste grátis · sem cadastro · sem senha
          </span>
          <h1 className="mt-4 text-balance text-3xl font-medium leading-[1.15] tracking-tight sm:text-4xl">
            Suba a sua planilha e veja seu{" "}
            <span className="text-[var(--brand)]">lucro real</span>
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-[oklch(0.45_0.01_48)]">
            Baixa o relatório do iFood, 99 Food ou Keeta e arrasta aqui. O
            resultado aparece na hora — tudo no seu navegador, sem instalar nada
            e sem fazer login.
          </p>
        </div>

        <div className="mt-8">
          <ExperimenteDemo sample />
        </div>

        <p className="mx-auto mt-8 flex max-w-md items-center justify-center gap-2 text-center text-xs text-[oklch(0.5_0.01_48)]">
          <Lock className="size-3.5 text-[var(--brand)]" strokeWidth={2.2} />
          Gostou? No sistema completo isso vira o painel de todas as suas lojas,
          mês a mês.
        </p>
      </main>
    </div>
  )
}
