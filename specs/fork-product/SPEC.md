# Fork product behavior

## Owners

- Model prompt profiles: `apps/zcode-cli` context builder. The catalog is data on the runtime config. The builder resolves one profile per request and does not rewrite session history.
- Session directory and agent lookup: `packages/shared` product runtime identity. Desktop and CLI both call that resolver.
- Edit dialect, Bash credential deny, large-output projection, skill/memory injection: `apps/zcode-cli` tool and context modules.
- Goal stop and subagent budget: core runtime functions called by the continuation loop and the turn loop.
- New session writes: Protocol v4 command envelopes. Legacy `session/create` is not the new-session write protocol.
- Themes: `packages/ui` theme document compiler and applicator. The document is the only theme state. Built-in System / Light / Dark remain separate preferences.

## Prompt profiles

Match order is exact `providerId + modelId`, then provider-only, then family, then `id: "default"`. The user catalog is stored by config merge and returned by `getAll`, then loaded onto the runtime the builder reads. A resolved profile replaces the hardcoded ZCode identity and communication essays. Generated facts (tool names, permission denial, desktop `::code-comment` when on the desktop surface, env, date, reply language) stay outside the editable body. Workspace instruction text is a constraint attachment and must not say it overrides the system prompt. Subagents and workflow actors use the same resolved profile; extra text is only a role addendum.

Settings edits that same user catalog. The owner of the accepted list is `promptProfiles` in the environment's `~/.zcode/cli/config.json`. The settings page does not keep a second accepted copy and does not ask the user to write JSON. A save validates the whole list, replaces that file field, and publishes the same list to agent processes already running in that environment. The next request in those processes resolves the published list. A process started after the save loads the file through the existing config merge. An in-flight subagent or workflow child keeps the list it was spawned with. Project `.zcode/config.json` can still replace the catalog on the next process start; this editor does not write that file.

## Runtime identity

Default product endpoints, official plugin marketplace, skill asset URLs, and the builtin catalog must not target `z.ai`, `bigmodel.cn`, `resources/glm`, or `GLM_BINARY_PATH`. Local plugin seeds remain the skill and MCP source. Agent lookup uses `ZCODE_AGENT_BINARY` and the `agent` resource directory. Desktop packs that directory to `resources/agent`. The CLI package install copies a Node binary to `runtime/node` (Windows: `runtime/node.exe`). The shipped launcher executes that bundled binary, not `node` on `PATH`. Desktop and CLI session databases live under the same shared session directory.

## Execution stop

Each model family exposes exactly one of `Edit` or `ApplyPatch`. Bash denies credential-directory reads before spawn, including `~/.ssh`, `$HOME/.ssh`, and `${HOME}/.aws`, even when confirmation is skipped. Matching folds case, so `~/.SSH` is the same deny as `~/.ssh`. Large tool results in model messages are a summary plus a path, not a 2000-character preview. A failed goal verification returns a visible stop when the previous turn result is still null; the task-notification path does not swallow that stop. Skill listings and memory indexes are off unless explicitly enabled. Desktop and CLI memory defaults are off. A failed goal verification returns a visible stop and does not continue. A subagent stops when its step budget is exhausted. Explore stays on the free loop. Computer Use is not a default model tool. Browser control is absent unless a permission gate is set.

## Themes

A theme document sets color, typography scale, spacing density, corner radius, and motion (duration, easing, reduced motion). Invalid documents are rejected and the previous theme stays applied. Save, switch, and remove round-trip in local storage. Shared store boot reapplies the saved document after the built-in theme and font-size preference, so the preference does not replace the theme's typography token.
