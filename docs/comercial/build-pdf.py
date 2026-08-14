#!/usr/bin/env python3
"""Gera os PDFs dos documentos comerciais a partir dos HTMLs.

POR QUE ASSIM: "PDF editável" não existe para texto corrido — o que existe é
uma FONTE editável que vira PDF quando se quer. Aqui a fonte é o HTML: abre no
Word e no Google Docs como documento editável, os campos <span class="campo">
são preenchíveis direto no navegador, e este script regera o PDF.

O CSS mora em _estilo.css (fonte única dos dois documentos) e é EMBUTIDO no
HTML final: o Chrome headless não carrega <link rel=stylesheet> por file://
de forma confiável, e um PDF sem estilo sai sem ninguém perceber até abrir.

Uso:  python3 build-pdf.py
"""
import pathlib
import re
import shutil
import subprocess
import sys

AQUI = pathlib.Path(__file__).parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DOCS = ["contrato-prestacao-servicos", "proposta-comercial"]


def main() -> int:
    if not pathlib.Path(CHROME).exists():
        print(f"Chrome não encontrado em {CHROME}", file=sys.stderr)
        return 1

    css = (AQUI / "_estilo.css").read_text(encoding="utf-8")
    tmp = AQUI / ".build"
    tmp.mkdir(exist_ok=True)

    for nome in DOCS:
        origem = AQUI / f"{nome}.html"
        if not origem.exists():
            print(f"pulando {nome}: html ausente")
            continue

        html = origem.read_text(encoding="utf-8")
        # Troca o <link> pelo CSS embutido. Se o link não estiver lá, injeta
        # antes de </head> — melhor um <style> a mais que um PDF sem estilo.
        embutido = f"<style>\n{css}\n</style>"
        novo, n = re.subn(
            r'<link[^>]+_estilo\.css[^>]*>', embutido, html, count=1
        )
        if n == 0:
            novo = html.replace("</head>", f"{embutido}\n</head>", 1)

        alvo = tmp / f"{nome}.html"
        alvo.write_text(novo, encoding="utf-8")

        saida = AQUI / f"{nome}.pdf"
        r = subprocess.run(
            [
                CHROME,
                "--headless=new",
                "--disable-gpu",
                "--no-pdf-header-footer",
                "--run-all-compositor-stages-before-draw",
                "--virtual-time-budget=4000",
                f"--print-to-pdf={saida}",
                alvo.as_uri(),
            ],
            capture_output=True,
            text=True,
        )
        if saida.exists() and saida.stat().st_size > 5_000:
            print(f"ok  {saida.name}  ({saida.stat().st_size // 1024} KB)")
        else:
            print(f"FALHOU  {nome}\n{r.stderr[-800:]}", file=sys.stderr)
            return 1

    shutil.rmtree(tmp, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
