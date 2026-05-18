# Conductor Workflow

## Development Methodology

### Test-Driven Development (TDD)
- Write tests BEFORE implementation for every feature
- Red-Green-Refactor cycle:
  1. **Red**: Write a failing test
  2. **Green**: Write minimal code to pass the test
  3. **Refactor**: Clean up code while keeping tests green

### Test Coverage Requirements
- **Minimum coverage: 80%** for all new code
- Unit tests for all utility functions (`src/lib/`)
- Integration tests for API routes (`src/app/api/`)
- Component tests for complex UI components

### Commit Strategy
- **Per-task commits**: Each completed task gets its own commit
- Commit message format: `type(scope): description`
  - Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`
  - Scope: The module or feature area affected
- Atomic commits: One logical change per commit

### Task Execution Protocol
1. Read the task from `plan.md`
2. Understand the acceptance criteria
3. Write tests that verify the criteria (should fail initially)
4. Implement the feature
5. Run tests — all must pass
6. Run linting — must be clean
7. Commit with descriptive message
8. Mark task as complete in `plan.md`

### Phase Completion Verification and Checkpointing Protocol
At the end of each phase:
1. Run full test suite — all tests must pass
2. Run linting — zero errors
3. Run build — must succeed
4. Verify all tasks in the phase are marked complete
5. Create a checkpoint commit: `chore(phase): Complete <Phase Name> checkpoint`
6. Update `plan.md` phase status to `[x]`

### Quality Gates
- **Linting**: `npm run lint` must pass with zero errors
- **Type checking**: TypeScript compilation must succeed
- **Build**: `npm run build` must succeed
- **Tests**: All tests must pass before committing
