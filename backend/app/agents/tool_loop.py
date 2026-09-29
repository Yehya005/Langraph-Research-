"""Minimal ReAct-style loop: the LLM picks tools from *its own* toolset, we execute them.
Every step is reported to the thinking panel: reasoning summaries, tool calls and results."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, ToolMessage

from ..activity import emit
from ..llm import get_llm, thoughts_of

SOURCES = {
    "search_kaggle_datasets": "Kaggle", "search_huggingface_datasets": "Hugging Face",
    "search_arxiv": "arXiv", "search_semantic_scholar": "Semantic Scholar",
    "inspect_kaggle_dataset": "Kaggle", "inspect_huggingface_dataset": "Hugging Face", "read_paper": "paper",
}


@dataclass
class ToolLoopResult:
    messages: List[BaseMessage]
    artifacts: List[Any] = field(default_factory=list)   # structured results returned by tools
    calls: List[dict] = field(default_factory=list)      # [{"tool": name, "args": {...}}]
    observations: List[str] = field(default_factory=list)  # tool outputs as text


def _report_call(agent: str, name: str, args: dict) -> None:
    source = SOURCES.get(name, name)
    if name.startswith("search_"):
        emit(agent, "search", f'Searching {source} for "{args.get("query", "")}"', tool=name, source=source)
    else:
        target = args.get("dataset_id") or args.get("paper_id") or ""
        emit(agent, "read", f"{'Reading' if name == 'read_paper' else 'Inspecting'} {target}", tool=name, source=source)


def _report_result(agent: str, name: str, tool_msg: ToolMessage) -> None:
    items = tool_msg.artifact if isinstance(tool_msg.artifact, list) else None
    if items is not None:
        links = [{"title": it["title"], "url": it["url"]} for it in items]
        text = f"{len(items)} result(s) from {SOURCES.get(name, name)}" if items else str(tool_msg.content)[:160]
        emit(agent, "result", text, links=links)
    else:
        content = str(tool_msg.content)
        emit(agent, "result", f"Got {len(content):,} characters", preview=content[:300])


def run_tool_loop(system: str, task: str, tools: list, max_steps: int = 3, agent: str = "agent") -> ToolLoopResult:
    llm = get_llm(thoughts=True).bind_tools(tools)
    by_name = {t.name: t for t in tools}
    messages: List[BaseMessage] = [SystemMessage(system), HumanMessage(task)]
    result = ToolLoopResult(messages=messages)

    for step in range(1, max_steps + 1):
        emit(agent, "status", f"Thinking (step {step}/{max_steps})…")
        ai = llm.invoke(messages)
        messages.append(ai)
        if thought := thoughts_of(ai):
            emit(agent, "thought", thought)
        if not ai.tool_calls:
            break
        for call in ai.tool_calls:
            tool = by_name.get(call["name"])
            if tool is None:
                messages.append(ToolMessage(f"Unknown tool {call['name']}", tool_call_id=call["id"]))
                continue
            _report_call(agent, call["name"], call["args"])
            tool_msg = tool.invoke(call)  # returns a ToolMessage (with .artifact when defined)
            _report_result(agent, call["name"], tool_msg)
            messages.append(tool_msg)
            result.calls.append({"tool": call["name"], "args": call["args"]})
            result.observations.append(f"[{call['name']}({call['args']})]\n{tool_msg.content}")
            if isinstance(tool_msg.artifact, list):
                result.artifacts.extend(tool_msg.artifact)
    return result
