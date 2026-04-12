# Project: super-regex

## Overview
Obsidian plugin for finding and replacing text using regular expressions across specific files or the entire vault. Uses a custom view pane with RegEx options (case insensitive, whole word), undo history handling, and pipe-based multiple term matching logic.

## Structure
src/
├── main.ts # Entry point. Defines the Plugin class, settings logic, undo functions, and replace mechanism.
├── view.ts # ItemView implementation. Rich UI with previews, pagination, checkboxes for replace, and async background search.
├── settingsTab.ts # Configuration tab in Obsidian settings.
├── utils.ts # Helper functions (logger, debounce, buildRegex).
└── types.ts # Type definitions, constants, and interface for settings/history.
test/
└── utils.test.ts # Tests

## Conventions
- Vanilla DOM creation using Obsidian's `HTMLElement` helper functions (`createDiv`, `createEl`).
- Async search and replace across vault with background processing yields via `requestAnimationFrame` to avoid UI rendering blocks.
- Plugin state (history, matches) managed directly within the plugin/view instances.

## Dependencies & Setup
- `bun` is used for dev, build, and tests (`bun run build.ts`).
- Standard Obsidian Plugin API.

## Critical Information
- Replacing text requires iterating `matches` in reverse (done in `performReplacements` by matching lineNum and start index descending) to prevent string index corruption on the replaced line.
- Vault modifications are tracked in a custom `history` array to allow undo. Memory limits logic kept via `MAX_HISTORY = 10`.

## Insights
- `view.ts` is exceptionally large (~600 lines) and mixes UI creation, DOM event mapping, and complex search string/regex processing logic.
- `getReplacementText` logic is duplicated between `view.ts` and `main.ts`.

## Blunders
None recorded yet.
