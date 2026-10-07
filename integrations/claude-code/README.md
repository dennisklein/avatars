# Claude Code plugin

This repository is a Claude Code plugin marketplace named `avatars`
(`.claude-plugin/marketplace.json`) with one plugin, also named `avatars`
(`.claude-plugin/plugin.json`). The plugin ships the skills in `skills/`
(`avatars-episode`, `avatars-voice` and `avatars-design`), which teach Claude
how to write, voice, check and render episodes and how to work with the
design system. Its id is `avatars@avatars`, and its skills are namespaced
under the plugin, for example `/avatars:avatars-episode`.

## Enable it for everyone in a project

Commit this `.claude/settings.json` (or merge it into the existing one) in the
project that uses the library:

```json
{
  "extraKnownMarketplaces": {
    "avatars": {
      "source": { "source": "github", "repo": "dennisklein/avatars" }
    }
  },
  "enabledPlugins": {
    "avatars@avatars": true
  }
}
```

When a teammate opens the project in Claude Code and accepts the workspace
trust dialog, Claude Code registers the marketplace and loads the plugin.
Nobody runs an install command: the marketplace lists the plugin by a
relative path, so it loads from the marketplace's copy. Two cases differ:

- Non-interactive runs (`claude -p`, CI) apply the marketplace only in a folder
  whose trust was accepted before. They install in the background, so set
  `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` to have the first turn wait for it.
- Cloud sessions never show the trust dialog and therefore ignore a
  repository's `extraKnownMarketplaces`.

The same file can be written from the project directory with the CLI:

```bash
claude plugin marketplace add dennisklein/avatars --scope project
claude plugin install avatars@avatars --scope project
```

## Pin a ref

Without a `ref`, the marketplace follows the repository's default branch. To
keep the skills in step with the CLI that the project's `package.json`
installs, pin the same release tag:

```json
{
  "extraKnownMarketplaces": {
    "avatars": {
      "source": { "source": "github", "repo": "dennisklein/avatars", "ref": "v0.1.0" }
    }
  },
  "enabledPlugins": {
    "avatars@avatars": true
  }
}
```

`ref` takes a branch or a tag; `claude plugin marketplace add
dennisklein/avatars#v0.1.0 --scope project` writes this entry. To upgrade,
change the tag together with the `@dennisklein/avatars` dependency in one
commit. After the next session start, Claude Code notices that the
marketplace's source changed, fetches it again and asks to run
`/reload-plugins`.

The plugin's `version` in `plugin.json` is the package version, and Claude Code
replaces its cached copy of the plugin only when that version changes. A
project that follows the default branch therefore receives new skills with
each release, when the marketplace is updated (`/plugin marketplace update
avatars`, or in the background with `"autoUpdate": true` next to `source`).

## Documentation

The settings above follow these pages of the Claude Code documentation:

- [Plugin manifest reference][manifest]: `plugin.json` fields, the standard
  `skills/` layout, versions
- [Create a marketplace][create] and the [marketplace reference][market]:
  `marketplace.json`, relative-path sources, `github` sources with `ref`
- [Settings reference][settings]: `extraKnownMarketplaces`, `enabledPlugins`
- [Manage plugins for your organization][org]: requiring plugins per
  repository, workspace trust
- [Plugin loading reference][loading] and [Host and maintain a
  marketplace][host]: registration, updates, pinning

[manifest]: https://code.claude.com/docs/en/plugins-reference
[create]: https://code.claude.com/docs/en/plugin-marketplaces
[market]: https://code.claude.com/docs/en/plugins/marketplace-reference
[settings]: https://code.claude.com/docs/en/settings-reference
[org]: https://code.claude.com/docs/en/plugins/org
[loading]: https://code.claude.com/docs/en/plugins/loading
[host]: https://code.claude.com/docs/en/plugins/host-marketplace
