# Project: super-regex

## Overview
Advanced Find & Replace plugin for Obsidian. Features vault/folder/file scoping, case-sensitivity, whole-word matching, and AI-powered natural language to RegEx conversion. Uses a modularized architecture (M-V-C/Renderer) for robust state management and rendering performance.

## Structure
src/
├── main.ts # Entry point. Plugin lifecycle, command registry, settingsPersistence, and core vault/editor modification logic.
├── view.ts # ItemView. UI shell orchestration and state container (matches, folders).
├── controllers/
│   ├── ActionHandler.ts # Handles logic for replacements, undo history management, and clipboard exports.
│   └── SearchController.ts # Orchestrates match engine execution across vault files or active document.
├── ui/
│   └── MatchRenderer.ts # Handles DOM construction/cleanup for search results. Uses pagination for large datasets.
├── ui.ts # Pure UI generic components (toggles, SVG icons) and inline match preview rendering.
├── search.ts # Dedicated match engine for raw regexp and text mode (including pipe matching).
├── ai.ts # API Service (OpenAI schema) to generate regex strings from Natural Language.
├── utils.ts # Shared static helpers (debounce, buildRegex, buildFlags, escapeRegex).
└── types.ts # Shared interfaces, constants, and SearchMode union.

test/
├── setup.ts # Central Bun mock for 'obsidian' module. Preloaded via bunfig.toml.
├── ai.test.ts # AI sanitization and error handling tests.
├── main.test.ts # Plugin instance and history calculation tests.
├── search.test.ts # Match engine (RegExp/Text) tests.
└── utils.test.ts # Helper function unit tests.

## Conventions
- **Modularized Views:** Logic must be split between specialized controllers and renderers to prevent `view.ts` bloat.
- **Vanilla DOM:** Obsidian's `HTMLElement` API (`createDiv`, `createEl`) preferred.
- **UI Elements:** Use `.setCssProps()` or CSS classes instead of directly mutating `element.style.display`.
- **Text Casing:** Use sentence case ("Like this label") for command titles and UI elements per Obsidian UI guidelines.
- **Security:** SVG icons must be injected via `DOMParser` in `ui.ts` to strictly follow security policies.
- **Mocking:** Unit tests use `test/setup.ts` via `bunfig.toml` preloading. Runtime configuration of mocks is done via `globalThis.mockRequestUrl`.

## Critical Information
- **Replacement Order:** Matches are sorted descending by line/index before replacement to ensure string index stability.
- **Editor Integration:** Uses Obsidian's `editor.transaction()` for active file replacements to maintain standard undo/redo buffers.
- **Memory Management:** `onClose()` in `view.ts` must clear all active timers (e.g. undo banner auto-hide).

## Insights
- **AI-as-a-Tool:** AI is a generator tool for RegEx mode, not a standalone search mode.
- **Standardized State:** `pendingReplacements` Map uses strictly `true` (selected) and `false` (deselected) values.
- **Debounced Writes:** `saveSettings` uses a 500ms debounce to minimize disk I/O on text inputs, but discrete UI toggles inherently invoke it synchronously without penalty.
- **Adaptive Layouts:** Completely hiding (`display: none`) the Replace row and its specific action buttons when replacing is disabled reclaims significant vertical space over graying them out.

## Blunders
- SVG injection directly to `innerHTML` violates security standards. Use `DOMParser.parseFromString` instead.
- `createEl('option')` doesn't set `.value`. Must be set explicitly on the element instance.
- Bun `mock.module` globally overrides resolution; redefining in individual files causes sibling failures. Define centrally and use `globalThis` for runtime changes.
- Stale `fileContainers` DOM references caused invisible results on second search. Must be cleared on search reset.
- Match count badges froze at creation time during progressive rendering. Must call `updateBadgeCounts()` after search completes.
- `renderLimit` implicitly acted as a chunk size but was named like a ceiling. Misnamed state variables degrade maintainability; reverted to direct `PAGE_SIZE` usage.
- Forwarding `performSearch()` through `view.ts` instead of calling `searchController` directly tied UI events unnecessarily to the View layer.
- `navigateToMatch()` existed on view but was never wired to any click handler — dead code for entire feature lifecycle.
- Bun test env lacks `requestAnimationFrame`. Polyfill in `test/setup.ts` with `setTimeout(cb, 0)`.
- Modifying DOM via `innerHTML` triggers audit failures. Use `empty()` and `createEl/createSpan` instead.
- Typing error catch variable as `any`. TypeScript and linters prefer `catch (e: unknown)`.
- Emojis at the start of `.setText()` or `.setDesc()` trigger automated code scanner "sentence case" validation rules.
