"""Judge toolset: *inspect* datasets and *read* papers (different from the Researcher's search tools)."""
from __future__ import annotations

import io
import logging

import requests
from langchain_core.tools import tool
from pypdf import PdfReader

from .common import HEADERS, TIMEOUT, get_json, kaggle_auth, s2_headers, short

PAPER_CHARS = 7000
logging.getLogger("pypdf").setLevel(logging.ERROR)  # PDFs often trigger harmless font warnings


@tool
def inspect_kaggle_dataset(dataset_id: str) -> str:
    """Inspect a Kaggle dataset: description, license and files/columns. dataset_id like 'kaggle:owner/slug'."""
    ref = dataset_id.removeprefix("kaggle:")
    auth = kaggle_auth()
    if not auth:
        return "Kaggle is not configured; judge from the search metadata only."
    out = []
    try:
        meta = get_json(f"https://www.kaggle.com/api/v1/datasets/metadata/{ref}", **auth)
        info = meta.get("info", meta)
        out.append(f"Title: {info.get('title')}\nSubtitle: {info.get('subtitle')}")
        out.append(f"Licenses: {[l.get('name') for l in info.get('licenses', [])]}")
        out.append(f"Keywords: {info.get('keywords')}")
        out.append(f"Description: {short(info.get('description'), 1500)}")
    except Exception as e:
        out.append(f"(metadata unavailable: {e})")
    try:
        files = get_json(f"https://www.kaggle.com/api/v1/datasets/list/{ref}", **auth)
        for f in (files.get("datasetFiles") or [])[:10]:
            cols = [c.get("name") for c in f.get("columns", [])][:30]
            out.append(f"File {f.get('name')} ({f.get('totalBytes')} bytes) columns={cols}")
    except Exception as e:
        out.append(f"(file list unavailable: {e})")
    return "\n".join(out)


@tool
def inspect_huggingface_dataset(dataset_id: str) -> str:
    """Inspect a Hugging Face dataset: README card, splits, columns and sample rows. dataset_id like 'hf:owner/name'."""
    name = dataset_id.removeprefix("hf:")
    out = []
    try:
        readme = requests.get(f"https://huggingface.co/datasets/{name}/raw/main/README.md", headers=HEADERS, timeout=TIMEOUT)
        out.append(f"README: {short(readme.text, 1500)}" if readme.ok else "README: (none)")
    except Exception as e:
        out.append(f"(README unavailable: {e})")
    try:
        splits = get_json("https://datasets-server.huggingface.co/splits", params={"dataset": name}).get("splits", [])
        out.append(f"Splits: {[(s['config'], s['split']) for s in splits[:6]]}")
        if splits:
            s = splits[0]
            rows = get_json(
                "https://datasets-server.huggingface.co/first-rows",
                params={"dataset": name, "config": s["config"], "split": s["split"]},
            )
            out.append(f"Columns: {[(f['name'], f['type'].get('dtype', f['type'].get('_type'))) for f in rows.get('features', [])][:30]}")
            for r in rows.get("rows", [])[:3]:
                out.append(f"Sample row: {short(str(r['row']), 300)}")
    except Exception as e:
        out.append(f"(dataset viewer unavailable: {e})")
    return "\n".join(out)


def _pdf_text(url: str) -> str:
    resp = requests.get(url, headers=HEADERS, timeout=40)
    resp.raise_for_status()
    reader = PdfReader(io.BytesIO(resp.content))
    text = ""
    for page in reader.pages[:6]:
        text += (page.extract_text() or "") + "\n"
        if len(text) > PAPER_CHARS:
            break
    return short(text, PAPER_CHARS)


@tool
def read_paper(paper_id: str) -> str:
    """Read a paper's text (first pages of the PDF when open access, else abstract + TLDR).
    paper_id like 'arxiv:2401.01234' or 's2:<id>'. Use this to extract verbatim highlights."""
    try:
        if paper_id.startswith("arxiv:"):
            aid = paper_id.removeprefix("arxiv:")
            return f"Full text (first pages) of {paper_id}:\n" + _pdf_text(f"https://arxiv.org/pdf/{aid}")
        pid = paper_id.removeprefix("s2:")
        d = get_json(
            f"https://api.semanticscholar.org/graph/v1/paper/{pid}",
            params={"fields": "title,abstract,tldr,citationCount,openAccessPdf,venue,year"},
            headers=s2_headers(),
        )
        pdf = (d.get("openAccessPdf") or {}).get("url")
        if pdf:
            try:
                return f"Full text (first pages) of {paper_id}:\n" + _pdf_text(pdf)
            except Exception:
                pass
        return (f"Title: {d.get('title')} ({d.get('venue')}, {d.get('year')}, {d.get('citationCount')} citations)\n"
                f"TLDR: {(d.get('tldr') or {}).get('text')}\nAbstract: {d.get('abstract')}")
    except Exception as e:
        return f"Could not read {paper_id}: {e}. Judge from the abstract only."


JUDGE_TOOLS = [inspect_kaggle_dataset, inspect_huggingface_dataset, read_paper]
