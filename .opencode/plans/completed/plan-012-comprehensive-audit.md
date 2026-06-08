# Plan 012: Comprehensive Project Audit

## Goal
Perform a full 8-category health audit on the Roleplay-Engine project: code quality, dependencies, architecture, security, test coverage, wiki data, performance, and a consolidated findings report. All Layer 1 tasks run in parallel since they are independent. Layer 2 aggregates results and produces the report.

## Tasks

### Layer 1 (parallel, no deps)

- [ ] **1a: Code Quality Audit** (assigned: @explorer)
  - Categorize all 79 lint errors and 67 warnings by type and severity
  - Flag dead code: unused exports, parameters, imports, variables
  - Check for deprecated patterns (Next.js 16 API changes, React 19 patterns)
  - Identify files with the most issues for prioritization
  - Output: `.opencode/audit/01-code-quality.md`

- [ ] **1b: Dependency Audit** (assigned: @explorer)
  - List all outdated packages and their changelogs (next, react, eslint, typescript)
  - Check npm audit results and determine if `postcss` vuln is exploitable
  - Check for unused dependencies (depcheck)
  - Verify all peer dependency compatibility
  - Output: `.opencode/audit/02-dependencies.md`

- [ ] **1c: Architecture Audit** (assigned: @architect)
  - Verify adherence to all anti-patterns listed in AGENTS.md (no barrel exports, no ORM, no middleware auth, etc.)
  - Check module boundary violations (e.g., lib/ importing from app/)
  - Review file naming conventions, directory structure, component organization
  - Check for co-location violations
  - Confirm the `relationship/` vs `relationships/` split is still valid
  - Check for any other architectural drift
  - Output: `.opencode/audit/03-architecture.md`

- [ ] **1d: Security Audit** (assigned: @security)
  - Review auth patterns: JWT creation, cookie handling, token verification in all routes
  - Check for SQL injection vectors (parameterized queries everywhere?)
  - Review XSS vectors in wiki rendering, markdown, user input display
  - Check CSRF protection on state-changing endpoints
  - Review file path traversal in wiki file-io
  - Review the `require()` calls in ollama.ts
  - Check for hardcoded secrets, exposed env vars
  - Output: `.opencode/audit/04-security.md`

- [ ] **1e: Test Coverage Audit** (assigned: @explorer)
  - Map every module in `src/lib/` to whether it has tests
  - Map every component directory to whether it has tests
  - Map every API route to whether it has tests
  - Identify high-risk untested modules (auth, wiki file-io, retrieval, prompt-builder, ollama)
  - Count test coverage by file count, not just test file count
  - Output: `.opencode/audit/05-test-coverage.md`

- [ ] **1f: Wiki Data Audit** (assigned: @explorer)
  - Run `scripts/audit-wiki.ts` and capture full output
  - Summarize the 116 issues found across 76 pages
  - Categorize issues by type (TYPE_MISMATCH, MISSING_SUBTYPE, orphan, etc.)
  - Highlight critical vs cosmetic issues
  - Output: `.opencode/audit/06-wiki-data.md`

### Layer 2 (depends on Layer 1)

- [ ] **2a: Performance Audit** (assigned: @perf)
  - Run `npm run analyze` for bundle analysis (if ANALYZE=true works)
  - Check DB query patterns in hot paths (sessions, generation)
  - Review rendering patterns (client vs server split, hydration)
  - Check for N+1 queries in API routes
  - Review the 6 `set-state-in-effect` lint errors for perf impact
  - Output: `.opencode/audit/07-performance.md`

- [ ] **2b: Compile Comprehensive Report** (assigned: @docs)
  - Merge all 7 audit outputs into `docs/audit-report.md`
  - Add executive summary with severity ratings
  - Prioritize findings into: Critical, High, Medium, Low, Info
  - Include estimated effort per fix
  - Reference ADRs where relevant
  - Output: `docs/audit-report.md`

## Verification
- [ ] 1a: `.opencode/audit/01-code-quality.md` exists with categorized lint issues
- [ ] 1b: `.opencode/audit/02-dependencies.md` exists with outdated/vuln/unused dep analysis
- [ ] 1c: `.opencode/audit/03-architecture.md` exists with boundary/convention checks
- [ ] 1d: `.opencode/audit/04-security.md` exists with auth/injection/XSS review
- [ ] 1e: `.opencode/audit/05-test-coverage.md` exists with module-to-test mapping
- [ ] 1f: `.opencode/audit/06-wiki-data.md` exists with audit-wiki.ts output summary
- [ ] 2a: `.opencode/audit/07-performance.md` exists with bundle/query/render analysis
- [ ] 2b: `docs/audit-report.md` exists with consolidated findings and prioritized recommendations
