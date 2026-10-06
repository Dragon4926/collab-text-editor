# 14 · Git workflow

The history of this repository is meant to be read. Run

```bash
git log --reverse --oneline
```

and you'll see the app assembled step by step, roughly in the order you'd
build it yourself: design tokens → data model → window shell → sidebar →
editor → ink engine → notebook → camera → spatial space → whiteboard →
document blocks → onboarding → export → performance → docs.

## Principles

### One idea per commit

Each commit does one thing you can describe in a short sentence:

```
feat(ink): add stroke geometry and hit testing
feat(ink): render strokes as memoised SVG paths
feat(ink): capture pen input with erase and lasso gestures
```

Small commits are easier to review, to revert, and to learn from. If you want
to understand the lasso, `git show` the commit that introduced it — you'll see
only the lasso.

### Every commit builds

Each commit passes `tsc` type-checking. That makes `git bisect` useful: you
can binary-search the history for the commit that introduced a bug, because
every point in history is a working app.

### Conventional Commits

Subjects follow the [Conventional Commits](https://www.conventionalcommits.org) format:

```
<type>(<scope>): <imperative summary>

<body: why, and anything non-obvious about how>
```

| Type | Meaning |
|---|---|
| `feat` | a user-visible feature |
| `fix` | a bug fix |
| `perf` | a performance improvement |
| `docs` | documentation only |
| `build` | tooling, dependencies |
| `chore` | maintenance that doesn't change behaviour |

The **scope** names the feature folder (`ink`, `space`, `editor`, `store`…).
The **subject** is imperative ("add", not "added") and says *what* changed;
the **body** says *why*. For example:

```
fix(board): …

Pointer capture retargets click events to the viewport, so double-click
hit-tests geometrically instead of reading event.target.
```

A future reader (often you) learns the pitfall without digging through code.

### Fixes are commits too

When manual testing uncovered bugs — the home screen keeping focus during its
exit animation, black swatches vanishing in dark mode, double-click failing
under pointer capture — each fix got its own `fix:` commit with the root cause
in the body, rather than being silently folded into a larger change.

## Useful commands while studying

```bash
git log --reverse --oneline            # the story, oldest first
git log --oneline -- src/features/ink  # history of one feature
git show <sha>                         # one change in full
git log -p --follow src/features/ink/shapes.ts   # how a file evolved
git blame src/features/canvas/camera.ts          # who/why for each line
```
