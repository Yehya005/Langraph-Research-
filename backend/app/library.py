"""Paper access for the in-app reader: PDF retrieval, text extraction, uploads, summaries, comparisons.

PDFs are fetched only from the paper's own recorded link (arXiv, or the open-access URL Semantic
Scholar returned) or from an uploaded file - never from an arbitrary URL. If no legal copy is
available, the reader shows the abstract and the original link instead."""
from __future__ import annotations

import hashlib
import io
import json
import logging
import re
import uuid
from pathlib import Path
from typing import Optional

import requests
from langchain_core.messages import HumanMessage, SystemMessage
from pypdf import PdfReader

from .llm import structured
from .state import Paper, PaperComparison, PaperMeta, PaperSummary, ResearchState

logging.getLogger("pypdf").setLevel(logging.ERROR)

DATA = Path(__file__).resolve().parents[1] / "data"
UPLOADS = DATA / "uploads"
CACHE = DATA / "cache"
HEADERS = {"User-Agent": "research-assistant-coe749/1.0"}
MAX_PDF_BYTES = 30 * 1024 * 1024
MAX_PAGES = 60


class PaperUnavailable(Exception):
    """No legally accessible full text (only metadata / abstract)."""


def pdf_source(paper: Paper) -> Optional[str]:
    if paper.local_pdf:
        return f"upload:{paper.local_pdf}"
    if paper.id.startswith("arxiv:"):
        return f"https://arxiv.org/pdf/{paper.id.removeprefix('arxiv:')}"
    return paper.pdf_url or None


def pdf_bytes(paper: Paper) -> bytes:
    src = pdf_source(paper)
    if not src:
        raise PaperUnavailable("No open-access PDF is known for this paper.")
    if src.startswith("upload:"):
        name = src.removeprefix("upload:")
        if not re.fullmatch(r"[0-9a-f]{32}\.pdf", name):
            raise PaperUnavailable("Invalid upload reference.")
        return (UPLOADS / name).read_bytes()
    key = hashlib.sha1(src.encode()).hexdigest()
    cached = CACHE / f"{key}.pdf"
    if cached.exists():
        return cached.read_bytes()
    try:
        resp = requests.get(src, headers=HEADERS, timeout=40)
        resp.raise_for_status()
    except requests.RequestException as e:
        raise PaperUnavailable(f"The original source could not be reached ({e.__class__.__name__}).") from e
    data = resp.content
    if not data.startswith(b"%PDF") or len(data) > MAX_PDF_BYTES:
        raise PaperUnavailable("The source did not return a readable PDF (it may require a login or subscription).")
    CACHE.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(data)
    return data


def extract_pages(data: bytes) -> list[str]:
    reader = PdfReader(io.BytesIO(data))
    pages = []
    for page in reader.pages[:MAX_PAGES]:
        text = page.extract_text() or ""
        pages.append(re.sub(r"[ \t]+", " ", text).strip())
    return pages


def paper_text(paper: Paper) -> dict:
    """{"pages": [...], "full_text": bool} - falls back to the abstract when no PDF is accessible."""
    key = hashlib.sha1((pdf_source(paper) or paper.id).encode()).hexdigest()
    cached = CACHE / f"{key}.json"
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))
    try:
        pages = extract_pages(pdf_bytes(paper))
        out = {"pages": pages, "full_text": any(pages), "note": None}
    except PaperUnavailable as e:
        out = {"pages": [paper.abstract] if paper.abstract else [], "full_text": False, "note": str(e)}
    if out["full_text"]:
        CACHE.mkdir(parents=True, exist_ok=True)
        cached.write_text(json.dumps(out), encoding="utf-8")
    return out


def text_for_llm(paper: Paper, limit: int = 40000) -> tuple[str, bool]:
    t = paper_text(paper)
    body = "\n\n".join(f"[page {i + 1}]\n{p}" for i, p in enumerate(t["pages"]))
    header = (f"TITLE: {paper.title}\nAUTHORS: {', '.join(paper.authors)}\nYEAR: {paper.year}\n"
              f"ABSTRACT: {paper.abstract}\n"
              + ("FULL TEXT:\n" if t["full_text"] else "ONLY THE ABSTRACT IS AVAILABLE - the full text could not be accessed.\n"))
    return (header + body)[:limit], t["full_text"]


# ---- uploads ------------------------------------------------------------------------

def save_upload(data: bytes) -> str:
    if not data.startswith(b"%PDF"):
        raise ValueError("This file is not a PDF.")
    if len(data) > MAX_PDF_BYTES:
        raise ValueError("The PDF is larger than 30 MB.")
    UPLOADS.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.pdf"
    (UPLOADS / name).write_bytes(data)
    return name


def paper_from_upload(name: str, filename: str) -> Paper:
    pages = extract_pages((UPLOADS / name).read_bytes())
    if not any(pages):
        raise ValueError("No text could be extracted (the PDF may be scanned images).")
    meta: PaperMeta = structured(PaperMeta).invoke([
        SystemMessage("Extract the paper's metadata from the first pages of its text. Use only what is written."),
        HumanMessage("\n\n".join(pages[:2])[:12000]),
    ])
    return Paper(id=f"upload:{name[:12]}", source="upload", title=meta.title or filename, url="",
                 authors=meta.authors, year=meta.year, abstract=meta.abstract, local_pdf=name,
                 found_by_query="uploaded by you")


# ---- structured summaries / comparisons (SOM) -----------------------------------------

def summarize(state: ResearchState, paper: Paper) -> dict:
    text, full = text_for_llm(paper)
    brief = state.brief.model_dump_json() if state.brief else state.idea
    summary: PaperSummary = structured(PaperSummary).invoke([
        SystemMessage("Summarize this research paper for a student's project. Use ONLY the paper text; write "
                      "'Not reported' for anything it does not state. Keep each item short."),
        HumanMessage(f"STUDENT PROJECT: {brief}\n\nPAPER\n{text}"),
    ])
    return {**summary.model_dump(), "basis": "full text" if full else "abstract only"}


def compare(state: ResearchState, papers: list[Paper]) -> dict:
    blocks, basis = [], {}
    for p in papers:
        text, full = text_for_llm(p, limit=14000)
        blocks.append(f"=== PAPER id={p.id} ===\n{text}")
        basis[p.id] = "full text" if full else "abstract only"
    brief = state.brief.model_dump_json() if state.brief else state.idea
    result: PaperComparison = structured(PaperComparison).invoke([
        SystemMessage("Compare these papers for a student's project. One row per paper (paper_id exactly as given). "
                      "Use ONLY what each paper states; write 'Not reported' when a paper does not state something. "
                      "Never guess numbers. Keep each cell under 40 words. In common_ground and differences refer to papers by a short "
                      "version of their title, never by id."),
        HumanMessage(f"STUDENT PROJECT: {brief}\n\n" + "\n\n".join(blocks)),
    ])
    return {**result.model_dump(), "basis": basis}
