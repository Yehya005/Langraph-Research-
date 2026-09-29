"""Convert the Markdown report to PDF and Word (.docx)."""
from __future__ import annotations

import io
import re
from pathlib import Path

import markdown
from docx import Document
from docx.shared import Pt
from htmldocx import HtmlToDocx
from xhtml2pdf import pisa
from xhtml2pdf.config.resources import ResourceAccessPolicy

# A Unicode TTF so accented names (e.g. 'Ćirić') render in the PDF; first one found is used.
FONT_CANDIDATES = [
    "C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf",
    "/Library/Fonts/Arial Unicode.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
FONT = next((f for f in FONT_CANDIDATES if Path(f).exists()), None)
FONT_BOLD = next((f.replace(".ttf", b) for f in [FONT or ""] for b in ("bd.ttf", "b.ttf", "-Bold.ttf")
                  if FONT and Path(f.replace(".ttf", b)).exists()), None)

PDF_CSS = """
@page { size: A4; margin: 2cm; }
body { font-family: Body, Helvetica; font-size: 10.5pt; line-height: 1.4; color: #1d2330; }
h1 { font-size: 20pt; color: #2f5bea; border-bottom: 1px solid #2f5bea; padding-bottom: 4pt; }
h2 { font-size: 14pt; color: #2f5bea; margin-top: 14pt; }
h3 { font-size: 12pt; margin-top: 10pt; }
table { border: 0.5pt solid #9aa3af; margin: 6pt 0; }
th { background-color: #e8eefe; font-weight: bold; padding: 3pt; border: 0.5pt solid #9aa3af; }
td { padding: 3pt; border: 0.5pt solid #9aa3af; vertical-align: top; }
blockquote { background-color: #fff8d6; border-left: 3pt solid #d69e2e; padding: 4pt 8pt; margin: 6pt 0; }
code { font-size: 9pt; }
a { color: #2f5bea; }
"""


def clean_markdown(md_text: str) -> str:
    """Remove a ```markdown ... ``` fence the LLM sometimes wraps the whole report in."""
    text = md_text.strip()
    m = re.fullmatch(r"```[a-zA-Z]*\s*\n(.*?)\n?```", text, flags=re.S)
    return m.group(1).strip() if m else text


def to_html(md_text: str) -> str:
    return markdown.markdown(clean_markdown(md_text), extensions=["tables", "sane_lists", "fenced_code"])


def _font_css() -> str:
    if not FONT:
        return ""
    css = f"@font-face {{ font-family: Body; src: url('{FONT}'); }}\n"
    if FONT_BOLD:
        css += f"@font-face {{ font-family: Body; src: url('{FONT_BOLD}'); font-weight: bold; }}\n"
    return css


def to_pdf(md_text: str) -> bytes:
    html = (f"<html><head><meta charset='utf-8'><style>{_font_css()}{PDF_CSS}</style></head>"
            f"<body>{to_html(md_text)}</body></html>")
    # the report text comes from an LLM: never fetch remote URLs, only read the font directory
    policy = ResourceAccessPolicy(allow_remote=False, extra_roots=(Path(FONT).parent,) if FONT else ())
    out = io.BytesIO()
    if pisa.CreatePDF(html, dest=out, encoding="utf-8", resource_policy=policy).err:
        raise RuntimeError("PDF conversion failed")
    return out.getvalue()


def to_docx(md_text: str) -> bytes:
    doc = Document()
    doc.styles["Normal"].font.name = "Calibri"
    doc.styles["Normal"].font.size = Pt(11)
    parser = HtmlToDocx()
    parser.table_style = "Table Grid"
    parser.add_html_to_document(to_html(md_text), doc)
    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()
