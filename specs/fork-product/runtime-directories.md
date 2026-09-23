# Runtime directories

## Owner

`packages/shared/src/product-data-dir.ts` owns the on-disk directory name (`PRODUCT_DATA_DIR_NAME`). Desktop, services, CLI, server, and the installer read that constant. They do not invent a second directory name.

## Behavior

New files this product creates go under `.mgcode`, not `.zcode`.

- Home data root is `{dataBaseDir}/.mgcode`. Config stays at `{dataBaseDir}/.mgcode/v2`. Sessions stay at `{home}/.mgcode/sessions`. Server state stays at `{dataBaseDir}/.mgcode/server`.
- A project workspace stores its own config, skills, commands, workflows, and workflow drafts under `{workspace}/.mgcode/`. The workspace file-search ignore file is `{workspace}/.mgcodeignore`. The default scratch workspace directory is `MgcodeProject`.
- The distribution install directory defaults to `$HOME/.mgcode/runtime`. The unpacked package directory is `mgcode`. The launcher command is `mgcode`.
- The isolated dev data base is `$HOME/.mgcode-dev-home`.

## What stays

Existing `~/.zcode` trees are not renamed, moved, or deleted. Source tree names, package names, protocol fields, channel names, and log scopes are not part of this directory split.

## Failure

If a path helper is called, the returned path contains `.mgcode` as the product directory segment and does not contain `.zcode`. A custom data base dir still appends `.mgcode`, not `.zcode`.
