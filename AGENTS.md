# AGENTS.md - Engineering Orchestration System

## Purpose
Define repository rules, orchestration workflow, architectural constraints, graph reasoning requirements.

---

## Core Workflow

All major work must follow:

```
1. graph analysis
2. planning
3. implementation
4. review
5. verification
```

---

## TodoWrite Integration

All agents MUST use OpenCode's `todowrite` tool for task tracking during execution.

### When to Use Todowrite

**Always use `todowrite` when:**
- Starting any multi-step task (3+ steps)
- Executing HIGH or CRITICAL risk workflows
- Coordinating multiple agents
- Managing phased execution
- Tracking progress across sessions

### Todowrite Structure

```json
{
  "todos": [
    {
      "content": "Clear description of task",
      "status": "pending|in_progress|completed|cancelled",
      "priority": "high|medium|low"
    }
  ]
}
```

### Usage Rules

1. **Create todo list** at start of multi-step work
2. **Update status** as tasks progress (pending → in_progress → completed)
3. **Only one task** should be `in_progress` at a time
4. **Mark complete** immediately when done (don't batch completions)
5. **Use priorities** to indicate importance
6. **Keep content concise** but descriptive (3-10 words)

### Example

```
@orchestrator refactor auth system
```

Agent creates:
```json
{
  "todos": [
    {"content": "Graph analysis of auth dependencies", "status": "in_progress", "priority": "high"},
    {"content": "Blast-radius analysis", "status": "pending", "priority": "high"},
    {"content": "Create migration plan", "status": "pending", "priority": "high"},
    {"content": "Phased implementation", "status": "pending", "priority": "medium"},
    {"content": "Review changes", "status": "pending", "priority": "medium"},
    {"content": "Test impact analysis", "status": "pending", "priority": "medium"}
  ]
}
```

### Integration with Plans System

- `todowrite` tracks **session-level** tasks
- `plans/` tracks **persistent** execution memory
- Use both: create plan in `plans/active/`, track with `todowrite`

---

## Graph Workflow

Before high-risk changes:

1. Inspect graphify outputs
2. Identify affected systems
3. Inspect dependency chains
4. Estimate blast radius
5. Identify graph-central modules

**Never rely solely on grep-based reasoning.**

---

## Engineering Constraints

Prefer:
- Small diffs
- Isolated changes
- Phased migrations
- Explicit boundaries
- Incremental refactors

Avoid:
- Speculative rewrites
- Large cross-system edits
- Simultaneous subsystem migrations
- Recursive autonomous loops

---

## Persistent Memory Rules

All HIGH or CRITICAL risk work must:
- Create a plan
- Update execution logs
- Preserve architectural decisions
- Document rollback strategy

---

## Verification Rules

**HIGH risk** work requires:
- Reviewer validation
- Blast-radius analysis
- Test-impact analysis

**Security-sensitive** changes require:
- Security review

---

## Model Routing

Use capability-based routing. Do NOT use a single model for all tasks.

| Model                 | Primary Role                                                   |
| --------------------- | -------------------------------------------------------------- |
| MiniMax M2.5 Free     | All agents (orchestration, architecture, debugging, review, security, verification, etc.) |
| Hy3 preview Free      | (Available as fallback)                                        |
| Nemotron 3 Super Free | (Available as fallback)                                        |
| Big Pickle            | (Available as fallback)                                        |

---

## Model Fallback Rankings

When an agent's primary model is unavailable, use this ordered fallback chain. Ranked by task-appropriateness (not raw capability — prefer specialized fit over overkill).

| Agent | Primary | 1st Fallback | 2nd Fallback | 3rd Fallback |
|-------|---------|-------------|-------------|-------------|
| orchestrator | `minimax-m2.5-free` | `hy3-preview-free` | `nemotron-3-super-free` | `big-pickle` |
| architect | `minimax-m2.5-free` | `hy3-preview-free` | `nemotron-3-super-free` | `big-pickle` |
| reviewer | `minimax-m2.5-free` | `hy3-preview-free` | `nemotron-3-super-free` | `big-pickle` |
| debugger | `minimax-m2.5-free` | `hy3-preview-free` | `nemotron-3-super-free` | `big-pickle` |
| refactor | `minimax-m2.5-free` | `hy3-preview-free` | `nemotron-3-super-free` | `big-pickle` |
| blast-radius | `minimax-m2.5-free` | `hy3-preview-free` | `nemotron-3-super-free` | `big-pickle` |
| dependency-auditor | `minimax-m2.5-free` | `hy3-preview-free` | `nemotron-3-super-free` | `big-pickle` |
| security | `minimax-m2.5-free` | `hy3-preview-free` | `nemotron-3-super-free` | `big-pickle` |
| test-impact | `minimax-m2.5-free` | `hy3-preview-free` | `nemotron-3-super-free` | `big-pickle` |
| onboarding | `minimax-m2.5-free` | `hy3-preview-free` | `nemotron-3-super-free` | `big-pickle` |
| verifier | `minimax-m2.5-free` | `hy3-preview-free` | `nemotron-3-super-free` | `big-pickle` |

---

## Dynamic Escalation

Escalate to **Big Pickle** when:
- More than 8 files change
- Auth systems are touched
- Migrations are involved
- Graph centrality is high
- Dependency fan-out is large
- Rollback complexity is high

---

## Risk Tiers

### LOW
Examples: isolated component fixes, documentation, tests

Workflow:
```
implementation → lightweight review
```

### MEDIUM
Examples: feature work, localized refactors, API updates

Workflow:
```
planning → implementation → reviewer → test impact
```

### HIGH
Examples: shared services, dependency restructuring, infrastructure changes

Workflow:
```
orchestrator → architect → blast-radius → implementation → reviewer → test impact
```

### CRITICAL
Examples: auth redesigns, schema migrations, core runtime changes, multi-tenant changes

Workflow:
```
orchestrator → architect → security → blast-radius → phased implementation → reviewer → verifier → rollback strategy → staged validation
```

---

## Agent Definitions

Agents are stored in `.opencode/agents/`:
- `orchestrator.md` - Central coordination (primary agent, mode: primary)
- `architect.md` - Architecture planning (subagent)
- `reviewer.md` - Code review (subagent)
- `debugger.md` - Root cause analysis (subagent)
- `refactor.md` - Safe refactoring (subagent)
- `blast-radius.md` - Impact analysis (subagent, hidden)
- `dependency-auditor.md` - Dependency topology (subagent)
- `security.md` - Trust boundary validation (subagent)
- `test-impact.md` - Validation scope (subagent, hidden)
- `verifier.md` - Independent verification (subagent, hidden)
- `onboarding.md` - Architecture explanation (subagent)

---

## Skills

Skills are stored in `.opencode/skills/`:
- `graph-analysis/SKILL.md` - Graph inspection
- `phased-execution/SKILL.md` - Incremental execution
- `safe-refactor/SKILL.md` - Compatibility-preserving refactors
- `feature-development/SKILL.md` - Standardized feature workflow

---

## Plans System

Plans are persistent execution memory stored in `plans/`.

Categories:
- `active/` - Current work
- `completed/` - Finished plans
- `archived/` - Old plans
- `incidents/` - Incident response
- `migrations/` - Migration plans
- `refactors/` - Refactoring plans

All HIGH/CRITICAL risk tasks require plans.

---

## Decisions System

Architectural decisions stored in `decisions/`.

Use ADR format. Purpose:
- Preserve rationale
- Explain tradeoffs
- Prevent architecture drift
- Preserve migration history

---

## Execution Logs

Logs stored in `logs/executions/`.

Every major workflow should log:
- Actions taken
- Assumptions
- Confidence level
- Affected systems
- Blockers
- Unresolved uncertainty

---

## Confidence Scoring

All agents must emit:

```
Confidence:
- LOW
- MEDIUM
- HIGH

Uncertainty Sources:
- Inferred dependency edge
- Incomplete graph visibility
- Runtime assumptions
- Missing ownership knowledge
```

**Low confidence** requires:
- Reviewer validation
- Narrower execution scope
- Additional graph inspection

---

## Recommended Workflows

### Large Refactor
```
@orchestrator refactor [system]
```
Execution:
```
1. Graph analysis
2. Blast-radius
3. Architect
4. Plan creation
5. Phased refactor
6. Reviewer
7. Test impact
```

### Production Bug
```
@orchestrator [bug description]
```
Execution:
```
1. Debugger
2. Dependency-auditor
3. Blast-radius
4. Reviewer
5. Execution log
```

### Authentication Migration
```
@orchestrator redesign auth for [requirement]
```
Execution:
```
1. Architect
2. Security
3. Blast-radius
4. Phased migration plan
5. Implementation
6. Reviewer
7. Rollback validation
```

---

## Important Constraints

**Never allow:**
- Recursive autonomous loops
- Uncontrolled agent spawning
- Speculative large rewrites
- Cross-system edits without planning
- Architecture changes without graph inspection

**Prefer:**
- Explicit workflows
- Constrained agents
- Small diffs
- Persistent memory
- Phased execution
- Verification chains

---

## Final Goal

The completed system should behave like:
- A disciplined engineering coordination layer
- A graph-aware planning system
- A persistent architecture memory system
- A constrained autonomous engineering workflow

The system should prioritize:
- Correctness
- Architectural stability
- Maintainability
- Explainability
- Incremental evolution

over:
- Maximal autonomy
- Speculative rewrites
- Uncontrolled execution

---

## Usage

To invoke the orchestrator:
```bash
@orchestrator [task description]
```

To invoke specific agents:
```bash
@architect [architecture task]
@debugger [issue to diagnose]
@reviewer [files to review]
```

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
