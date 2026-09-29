"""Terminal demo: runs the graph and prints every node's PARTIAL state update.

    python cli.py "predict hospital readmission from patient records"
"""
from __future__ import annotations

import json
import sys
import uuid

from langchain_core.messages import HumanMessage
from langgraph.types import Command

from app.graph import graph

CFG = {"configurable": {"thread_id": str(uuid.uuid4())}, "recursion_limit": 100}


def show(update: dict) -> None:
    for node, delta in update.items():
        if node == "__interrupt__":
            continue
        print(f"\n\033[96m== node: {node} -> partial update keys: {list((delta or {}).keys())}\033[0m")
        for k, v in (delta or {}).items():
            if k == "messages":
                v = [m.content for m in v]
            elif isinstance(v, list) and len(v) > 3 and k not in ("log", "gaps"):
                v = f"<list of {len(v)}>"
            elif isinstance(v, dict) and len(v) > 3:
                v = f"<dict with {len(v)} keys>"
            elif hasattr(v, "model_dump"):
                v = v.model_dump()
            text = json.dumps(v, default=lambda o: o.model_dump() if hasattr(o, "model_dump") else str(o))
            print(f"   {k}: {text[:300]}")


def ask(payload: dict) -> dict:
    kind = payload["type"]
    if kind == "question":
        print(f"\n\033[93mInterviewer:\033[0m {payload['question']}")
        return {"answer": input("You: ")}
    if kind == "approve_brief":
        print("\nBRIEF:\n" + json.dumps(payload["brief"], indent=2))
        ok = input("Approve brief? [y/N] ").lower().startswith("y")
        return {"approved": ok, "feedback": "" if ok else input("What should change? ")}
    if kind == "approve_more_research":
        print(f"\nJudge: coverage={payload['coverage_score']}  gaps={payload['gaps']}")
        return {"approved": input("Run another research round? [y/N] ").lower().startswith("y")}
    if kind == "scope_review":
        print(f"\nAnalyst: topic is {payload['topic_assessment']} - {payload['reasoning']}")
        print(f"Refined scope: {payload['refined_scope']}")
        adopt = input("Adopt the refined scope and research it? [y/N] ").lower().startswith("y")
        return {"action": "adopt" if adopt else "keep"}
    if kind == "report_review":
        print("\n" + graph.get_state(CFG).values["report_markdown"])
        action = input("\n[e]dit / [r]esearch more / [f]inish? ").lower()[:1]
        if action == "e":
            return {"action": "edit", "instruction": input("Edit instruction: ")}
        if action == "r":
            return {"action": "research_more", "instruction": input("What to research: ")}
        return {"action": "finish"}
    raise ValueError(kind)


def main() -> None:
    idea = " ".join(sys.argv[1:]) or input("Project idea: ")
    inp = {"idea": idea, "messages": [HumanMessage(f"My project idea: {idea}")]}
    while True:
        for update in graph.stream(inp, CFG, stream_mode="updates"):
            show(update)
        snap = graph.get_state(CFG)
        pending = [i.value for t in snap.tasks for i in t.interrupts]
        if not pending:
            break
        inp = Command(resume=ask(pending[0]))
    print("\nDone. Final phase:", graph.get_state(CFG).values["phase"])


if __name__ == "__main__":
    main()
