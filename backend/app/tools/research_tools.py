"""Researcher toolset: dataset + paper *search*.

Each tool returns (text for the LLM, list of Dataset/Paper dicts as artifact),
so the node can collect structured results without re-parsing text.
"""
from __future__ import annotations

import arxiv
from huggingface_hub import HfApi
from langchain_core.tools import tool

from .common import get_json, kaggle_auth, s2_headers, short

MAX_RESULTS = 5


def _render(items: list[dict]) -> str:
    if not items:
        return "No results."
    return "\n".join(f"- [{it['id']}] {it['title']} :: {short(it.get('description') or it.get('abstract'), 200)}" for it in items)


@tool(response_format="content_and_artifact")
def search_kaggle_datasets(query: str):
    """Search Kaggle for datasets matching a short query (2-5 words)."""
    auth = kaggle_auth()
    if not auth:
        return "Kaggle is not configured (no KAGGLE_USERNAME/KAGGLE_KEY). Use another source.", []
    try:
        rows = get_json(
            "https://www.kaggle.com/api/v1/datasets/list",
            params={"search": query, "sortBy": "hottest", "page": 1},
            **auth,
        )[:MAX_RESULTS]
    except Exception as e:  # network / auth errors are reported to the agent, not raised
        return f"Kaggle search failed: {e}", []
    items = [
        {
            "id": f"kaggle:{r['ref']}",
            "source": "kaggle",
            "title": r.get("title", r["ref"]),
            "url": f"https://www.kaggle.com/datasets/{r['ref']}",
            "description": f"{r.get('subtitle', '')} (license: {r.get('licenseName')}, usability: {r.get('usabilityRating')})",
            "size_bytes": r.get("totalBytes"),
            "downloads": r.get("downloadCount"),
            "likes": r.get("voteCount"),
            "tags": [t.get("name", "") for t in r.get("tags", [])],
            "found_by_query": query,
        }
        for r in rows
    ]
    return _render(items), items


@tool(response_format="content_and_artifact")
def search_huggingface_datasets(query: str):
    """Search the Hugging Face Hub for datasets matching a short query (2-5 words)."""
    try:
        rows = list(HfApi().list_datasets(search=query, sort="downloads", limit=MAX_RESULTS, full=True))
    except Exception as e:
        return f"Hugging Face search failed: {e}", []
    items = []
    for r in rows:
        card = getattr(r, "card_data", None) or {}
        desc = getattr(r, "description", None) or (card.get("pretty_name") if isinstance(card, dict) else None) or ""
        items.append({
            "id": f"hf:{r.id}",
            "source": "huggingface",
            "title": r.id,
            "url": f"https://huggingface.co/datasets/{r.id}",
            "description": short(desc, 400),
            "downloads": getattr(r, "downloads", None),
            "likes": getattr(r, "likes", None),
            "tags": [t for t in (getattr(r, "tags", None) or []) if not t.startswith("region:")][:12],
            "found_by_query": query,
        })
    return _render(items), items


@tool(response_format="content_and_artifact")
def search_arxiv(query: str):
    """Search arXiv for research papers matching a query."""
    try:
        search = arxiv.Search(query=query, max_results=MAX_RESULTS, sort_by=arxiv.SortCriterion.Relevance)
        rows = list(arxiv.Client(num_retries=2).results(search))
    except Exception as e:
        return f"arXiv search failed: {e}", []
    items = [
        {
            "id": f"arxiv:{r.get_short_id().split('v')[0]}",
            "source": "arxiv",
            "title": r.title,
            "url": r.entry_id,
            "authors": [a.name for a in r.authors][:8],
            "year": r.published.year if r.published else None,
            "abstract": short(r.summary, 1500),
            "pdf_url": r.pdf_url,
            "found_by_query": query,
        }
        for r in rows
    ]
    return _render(items), items


@tool(response_format="content_and_artifact")
def search_semantic_scholar(query: str):
    """Search Semantic Scholar for research papers (includes citation counts)."""
    try:
        data = get_json(
            "https://api.semanticscholar.org/graph/v1/paper/search",
            params={
                "query": query,
                "limit": MAX_RESULTS,
                "fields": "title,abstract,year,citationCount,url,authors,externalIds,openAccessPdf",
            },
            headers=s2_headers(),
        )
    except Exception as e:
        return f"Semantic Scholar search failed (it is often rate-limited without an API key): {e}", []
    items = []
    for r in data.get("data", []):
        arxiv_id = (r.get("externalIds") or {}).get("ArXiv")
        items.append({
            # prefer the arXiv id so the same paper found on both engines is de-duplicated
            "id": f"arxiv:{arxiv_id}" if arxiv_id else f"s2:{r['paperId']}",
            "source": "semantic_scholar",
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "authors": [a["name"] for a in r.get("authors", [])][:8],
            "year": r.get("year"),
            "abstract": short(r.get("abstract"), 1500),
            "citation_count": r.get("citationCount"),
            "pdf_url": (r.get("openAccessPdf") or {}).get("url"),
            "found_by_query": query,
        })
    return _render(items), items


RESEARCHER_TOOLS = [search_kaggle_datasets, search_huggingface_datasets, search_arxiv, search_semantic_scholar]
