# Graph Report - Roleplay-Engine  (2026-05-16)

## Corpus Check
- 4 files · ~2,874 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 140 nodes · 136 edges · 30 communities (12 shown, 18 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `086f2f2f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

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
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]

## God Nodes (most connected - your core abstractions)
1. `AGENTS.md - Engineering Orchestration System` - 23 edges
2. `Project Context` - 10 edges
3. `TodoWrite Integration` - 6 edges
4. `ADR-NNN: [Title]` - 6 edges
5. `Risk Tiers` - 5 edges
6. `Recommended Workflows` - 4 edges
7. `Design Principles` - 4 edges
8. `Recommended Job Types` - 4 edges
9. `Example` - 3 edges
10. `Large Refactor` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (30 total, 18 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (24): Agent Definitions, AGENTS.md - Engineering Orchestration System, code:block1 (1. graph analysis), code:bash (@orchestrator [task description]), code:bash (@architect [architecture task]), code:block9 (Confidence:), Confidence Scoring, Core Workflow (+16 more)

### Community 1 - "Community 1"
Cohesion: 0.15
Nodes (12): code:bash (# Add commands here), code:bash (# Add test commands here), Description, Domain Knowledge, Important Conventions, Key Constraints, Links, Project Context (+4 more)

### Community 2 - "Community 2"
Cohesion: 0.2
Nodes (10): Authentication Migration, code:block10 (@orchestrator refactor [system]), code:block11 (1. Graph analysis), code:block12 (@orchestrator [bug description]), code:block13 (1. Debugger), code:block14 (@orchestrator redesign auth for [requirement]), code:block15 (1. Architect), Large Refactor (+2 more)

### Community 3 - "Community 3"
Cohesion: 0.2
Nodes (9): 5. Narrative Memory, Async Processing Philosophy, Canon-Aware Roleplay, Core Narrative Layers, Core Stack, Core System Goal, Idle-Time Narrative Enrichment, Important Constraint (+1 more)

### Community 4 - "Community 4"
Cohesion: 0.22
Nodes (9): code:json ({), code:block3 (@orchestrator refactor auth system), code:json ({), Example, Integration with Plans System, TodoWrite Integration, Todowrite Structure, Usage Rules (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.22
Nodes (9): code:block5 (implementation → lightweight review), code:block6 (planning → implementation → reviewer → test impact), code:block7 (orchestrator → architect → blast-radius → implementation → r), code:block8 (orchestrator → architect → security → blast-radius → phased ), CRITICAL, HIGH, LOW, MEDIUM (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.29
Nodes (6): ADR-NNN: [Title], Consequences, Context, Decision, Status, Tradeoffs

### Community 7 - "Community 7"
Cohesion: 0.33
Nodes (6): 1. Localized Context, 2. Incremental Expansion, 3. Persistent Narrative Consequence, code:yaml (location:), code:yaml (location:), Design Principles

### Community 8 - "Community 8"
Cohesion: 0.4
Nodes (5): Chat Memory Structure, code:yaml (message_summary:), code:yaml (message:), Message Summaries, Raw Messages

### Community 9 - "Community 9"
Cohesion: 0.5
Nodes (4): High Priority, Idle-Time Only, Medium Priority, Recommended Job Types

### Community 10 - "Community 10"
Cohesion: 0.67
Nodes (3): System Scope, The System Is, The System Is NOT

### Community 11 - "Community 11"
Cohesion: 0.67
Nodes (3): code:yaml (state: generated_unverified), code:yaml (state: validated), Contradiction Prevention

## Knowledge Gaps
- **90 isolated node(s):** `Purpose`, `code:block1 (1. graph analysis)`, `When to Use Todowrite`, `code:json ({)`, `Usage Rules` (+85 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AGENTS.md - Engineering Orchestration System` connect `Community 0` to `Community 2`, `Community 4`, `Community 5`?**
  _High betweenness centrality (0.126) - this node is a cross-community bridge._
- **Why does `Recommended Workflows` connect `Community 2` to `Community 0`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `TodoWrite Integration` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `Purpose`, `code:block1 (1. graph analysis)`, `When to Use Todowrite` to the rest of the system?**
  _90 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._