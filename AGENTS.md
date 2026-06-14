# Agent Instructions

This repository is a TypeScript template repository. Changes here should usually improve the template that future projects are generated from, not customize this checkout as if it were a normal application/library repo.

Unless the user explicitly states otherwise, assume requests are about updating the template setup flow in `scripts/prepare.ts`.

Keep changes narrowly scoped and preserve the template's self-initializing behavior.

When test-running `scripts/prepare.ts`, copy the repository to a temporary directory with `rsync -av --exclude node_modules --exclude .git ./ "$tmpdir/"` and run it there with `CI=1` so the script uses default answers instead of showing interactive prompts.
