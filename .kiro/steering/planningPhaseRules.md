---
inclusion: always
---
# PLANNING RULES

- Limit the plan to 6–10 tasks max.
- No sub-task nesting deeper than 1 level.
- Each task must change at least one line of code.
- Do not create tasks for tests, logging, or refactors unless explicitly requested.
- If a task does not directly fix the stated problem, exclude it.

# PLANNING CONSTRAINT

## When generating tasks:
- Every task must end with a green build.
- Tasks that require breaking changes must include temporary adapters.
- Tasks must be orderable and executable one-by-one.

# TASKS

## TASK DEFINITION OF DONE

A task is only complete when:

1. The project builds successfully.
   - Every task must end in a compilable state.
2. All existing tests pass (unless explicitly waived).
3. No new errors or warnings are introduced.
4. The codebase is in a shippable state.
5. The diff is minimal and reviewable.
6. The change is logically isolated and reversible.

If a task cannot satisfy all of the above, it must be split into smaller tasks.

## TASK ATOMICITY

- Each task must be independently compilable.
- No task may leave the project in a broken or transitional state.
- If a change requires multiple steps, create intermediate compatibility layers.

## BUDGET RULE

- Prefer 3 atomic tasks over 1 large task that requires test loops.
- Do not run the full test suite unless required.

## TRANSITION TASK (rare)

- May break build
- Must be immediately followed by a repair task
- Must not be committed
