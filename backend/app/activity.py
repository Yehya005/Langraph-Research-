"""Live activity events ("thinking panel") via LangGraph's custom stream mode.

Nodes call emit(...); when the graph runs with stream_mode including "custom", each event is
delivered to the caller immediately (the server stores them for the UI). Outside a graph run
(e.g. unit tests) emit() is a no-op."""
from __future__ import annotations

import time

from langgraph.config import get_stream_writer

# kinds: status (what the agent is doing), thought (model reasoning summary), search (a query to
# a source), read (inspecting a dataset / paper), result (what came back), score (a verdict),
# decision (a conclusion that changes the flow)


def emit(agent: str, kind: str, text: str, **extra) -> None:
    try:
        writer = get_stream_writer()
    except Exception:  # not inside a graph run
        return
    writer({"agent": agent, "kind": kind, "text": text, "ts": time.time(), **extra})
