# Graph Report - Roleplay-Engine  (2026-05-16)

## Corpus Check
- 3 files · ~1,534 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 71 nodes · 68 edges · 9 communities (7 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]

## God Nodes (most connected - your core abstractions)
1. `AGENTS.md - Engineering Orchestration System` - 23 edges
2. `Project Context` - 9 edges
3. `ADR-[NUMBER]: [Title]` - 7 edges
4. `TodoWrite Integration` - 6 edges
5. `Risk Tiers` - 5 edges
6. `Recommended Workflows` - 4 edges
7. `Example` - 3 edges
8. `Large Refactor` - 3 edges
9. `Production Bug` - 3 edges
10. `Authentication Migration` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (9 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (17): Agent Definitions, AGENTS.md - Engineering Orchestration System, Decisions System, Dynamic Escalation, Engineering Constraints, Execution Logs, Final Goal, Graph Workflow (+9 more)

### Community 1 - "Community 1"
Cohesion: 0.2
Nodes (10): Authentication Migration, code:block10 (@orchestrator refactor [system]), code:block11 (1. Graph analysis), code:block12 (@orchestrator [bug description]), code:block13 (1. Debugger), code:block14 (@orchestrator redesign auth for [requirement]), code:block15 (1. Architect), Large Refactor (+2 more)

### Community 2 - "Community 2"
Cohesion: 0.2
Nodes (9): Agents & Skills, Architecture, Development Workflow, Directory Structure, Graph Analysis, Key Systems, Overview, Project Context (+1 more)

### Community 3 - "Community 3"
Cohesion: 0.22
Nodes (9): code:json ({), code:block3 (@orchestrator refactor auth system), code:json ({), Example, Integration with Plans System, TodoWrite Integration, Todowrite Structure, Usage Rules (+1 more)

### Community 4 - "Community 4"
Cohesion: 0.22
Nodes (9): code:block5 (implementation → lightweight review), code:block6 (planning → implementation → reviewer → test impact), code:block7 (orchestrator → architect → blast-radius → implementation → r), code:block8 (orchestrator → architect → security → blast-radius → phased ), CRITICAL, HIGH, LOW, MEDIUM (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.25
Nodes (7): ADR-[NUMBER]: [Title], Context, Decision, Rationale, Rollback Strategy, Status, Tradeoffs

### Community 6 - "Community 6"
Cohesion: 0.67
Nodes (3): code:bash (@orchestrator [task description]), code:bash (@architect [architecture task]), Usage

## Knowledge Gaps
- **50 isolated node(s):** `Purpose`, `code:block1 (1. graph analysis)`, `When to Use Todowrite`, `code:json ({)`, `Usage Rules` (+45 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AGENTS.md - Engineering Orchestration System` connect `Community 0` to `Community 1`, `Community 3`, `Community 4`, `Community 6`, `Community 7`, `Community 8`?**
  _High betweenness centrality (0.499) - this node is a cross-community bridge._
- **Why does `Recommended Workflows` connect `Community 1` to `Community 0`?**
  _High betweenness centrality (0.171) - this node is a cross-community bridge._
- **Why does `TodoWrite Integration` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **What connects `Purpose`, `code:block1 (1. graph analysis)`, `When to Use Todowrite` to the rest of the system?**
  _50 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._