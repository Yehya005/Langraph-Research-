"""LLM factory: switch between Gemini and Claude with LLM_PROVIDER in .env."""
from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower()


@lru_cache(maxsize=2)
def get_llm(thoughts: bool = False):
    """thoughts=True returns the model's reasoning summaries as 'thinking' content blocks,
    shown live in the UI's thinking panel (used for free-text / tool-calling steps)."""
    if PROVIDER == "claude":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=os.getenv("CLAUDE_MODEL", "claude-opus-5"),
            max_tokens=16000,
            max_retries=3,
            **({"thinking": {"type": "adaptive", "display": "summarized"}} if thoughts else {}),
        )

    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        temperature=0.3,
        max_output_tokens=16384,
        thinking_budget=1024,  # keep thinking short so long outputs (the report) are not cut off
        include_thoughts=thoughts,
        max_retries=3,
    )


def structured(schema):
    """Structured Output Mode: the LLM returns a validated instance of `schema`.

    Uses the provider's native JSON-schema mode (no forced tool call), which
    works with Claude's thinking models and with Gemini.
    """
    return get_llm().with_structured_output(schema, method="json_schema")


def _blocks(message) -> list:
    content = message.content
    return [content] if isinstance(content, str) else content


def text_of(message) -> str:
    """Plain text of an AIMessage (content may be a list of blocks, incl. thinking blocks)."""
    return "".join(
        b if isinstance(b, str) else b.get("text", "")
        for b in _blocks(message)
        if isinstance(b, str) or b.get("type") == "text"
    )


def thoughts_of(message) -> str:
    """The model's reasoning summary, if the provider returned one."""
    return "\n\n".join(
        b.get("thinking", "") for b in _blocks(message)
        if isinstance(b, dict) and b.get("type") == "thinking" and b.get("thinking")
    ).strip()
