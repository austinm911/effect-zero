# ztunes Browser Test Orchestrator

Use this prompt when you want an agent to verify the runnable `examples/ztunes` app in a real browser with [$chrome-cdp](/Users/am/Coding/loadout/vendor/chrome-cdp-skill/skills/chrome-cdp/SKILL.md).

## Prompt

```md
Use [$chrome-cdp](/Users/am/Coding/loadout/vendor/chrome-cdp-skill/skills/chrome-cdp/SKILL.md) to verify the `examples/ztunes` app in Chrome.

Constraints:
- Work against the Portless frontend URL at `http://effect-zero-ztunes.localhost:1355`.
- Work against the Portless package harness URL at `http://effect-zero-api.localhost:1355`.
- Do not use `localhost:3000` or assume an internal Vite or Node port. The only stable URLs are the Portless hostnames.
- Browser smoke covers only these browser-visible targets:
  - `control` (`Promise`)
  - `v3-drizzle` (`Effect v3 (Drizzle)`)
  - `v4-drizzle` (`Effect v4 (Drizzle)`)
- The full adapter matrix lives in the package harness, not in the browser UI.
- If the local database stack is not running, start it with `pnpm dev:db` from the repo root in a background terminal and leave it running.
- If Zero Cache is not running on `http://localhost:4848`, start it with `pnpm dev:zero` from the repo root in a background terminal and leave it running.
- If the example API harness is not running, start it with `pnpm dev:api` from the repo root in a background terminal and leave it running.
- If the ztunes dev server is not running, start it with `pnpm dev` from the repo root in a background terminal and leave it running.
- If Chrome remote debugging is not available, stop and report that blocker.
- Reuse the existing Chrome tab if one already points at the ztunes URL; otherwise open a new tab manually or report that user action is needed.
- Use the local CDP CLI at `/Users/am/.pi/agent/skills/chrome-cdp/scripts/cdp.mjs`. If that path is missing, fall back to `/Users/am/Coding/loadout/vendor/chrome-cdp-skill/skills/chrome-cdp/scripts/cdp.mjs`.
- Prefer `eval` for the search input. The CDP `type` command is not consistently reliable on this page.
- Treat `Portishead` as a substring match. The result row renders as `Portishead65`, not a clean exact-text link.
- Summarize pass/fail for each target prompt you run.

Workflow:
1. Check whether the frontend and package harness are live:
   - `portless list`
   - `curl -I http://effect-zero-ztunes.localhost:1355`
   - `curl -I http://effect-zero-api.localhost:1355`
   - Record the upstream targets from `portless list` so it is obvious which internal Vite and Node ports are active.
2. If the database or app processes are not live, start:
   - `pnpm dev:db`
   - `pnpm dev:api`
   - `pnpm dev`
   - `pnpm dev:zero`
3. If the fixture catalog is empty, seed it:
   - `pnpm seed:ztunes`
4. Find the Chrome target:
   - `node /Users/am/.pi/agent/skills/chrome-cdp/scripts/cdp.mjs list`
5. Navigate the chosen tab to the route under test:
   - `node /Users/am/.pi/agent/skills/chrome-cdp/scripts/cdp.mjs nav <target> http://effect-zero-ztunes.localhost:1355`
6. Use each browser-target prompt from `examples/ztunes/testing/`:
   - `control-target.md`
   - `v3-drizzle-target.md`
   - `v4-drizzle-target.md`
7. Report:
   - the Portless upstream targets that served the frontend and package harness
   - whether the frontend Portless route was already live
   - whether the package harness Portless route was already live
   - whether the database stack had to be started
   - whether Zero Cache had to be started
   - whether the package harness had to be started
   - whether the ztunes dev server had to be started
   - whether the fixture seed had to be applied
   - which assertions passed for each browser-visible target
   - which assertions failed for each browser-visible target
```
