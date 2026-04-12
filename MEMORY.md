# Project: super-regex

## Overview
Obsidian plugin for finding and replacing text across specific files, folders, or the entire vault. Supports two search modes: plain Text and RegEx. Includes an AI feature (via Gemini API) that converts natural language into regex patterns. Uses a custom view pane with inline replace previews, prominent undo banners, export-to-clipboard, and pipe-based multi-term matching.

## Structure
src/
├── main.ts # Entry point. Defines the Plugin class, settings logic, undo functions, and replace mechanism.
├── view.ts # ItemView implementation. Rich UI with previews, folder scoped picker, export, and pending/undo execution logic.
├── settingsTab.ts # Configuration tab in Obsidian settings. (AI API configurations added here).
├── ui.ts # Pure UI generic components and preview layout helpers (inline match rendering).
├── search.ts # Isolated math logic for raw regex and search loops.
├── ai.ts # AI Service connected via OpenAI API standard endpoints to generate regex strings from Natural Language.
├── utils.ts # Helper functions (debounce, buildRegex, getReplacementText).
└── types.ts # Type definitions, constants, and interface for settings/history. SearchMode ('text' | 'regex') replaces boolean regex toggles.
test/
└── utils.test.ts # Tests

## Conventions
- Vanilla DOM creation using Obsidian's `HTMLElement` helper functions (`createDiv`, `createEl`).
- Async search and replace across vault with background processing yields via `requestAnimationFrame` to avoid UI rendering blocks.
- Plugin state (history, matches) managed directly within the plugin/view instances.
- UI security strictly relies on `DOMParser` for SVG injection to adhere to Obsidian API policies. Avoid `innerHTML`.

## Dependencies & Setup
- `bun` is used for dev, build, and tests (`bun run build.ts`).
- Standard Obsidian Plugin API. Target `minAppVersion`: `1.4.0`.

## Critical Information
- Replacing text requires iterating `matches` in reverse (done in `performReplacements` by matching lineNum and start index descending) to prevent string index corruption on the replaced line.
- Vault modifications are tracked in a custom `history` array to allow undo. Memory limits logic kept via `MAX_HISTORY = 10` or a 10MB char length check.

## Insights
- UX transitions favor "forgive and forget" (auto-hiding Undo banner) rather than "ask and block" (Replace All confirmation dialogs) to keep workflow fast.
- The CSS selector `.cm-s-obsidian` is only for Obsidian CM5 legacy mode. Use `.cm-editor` for CodeMirror 6 active line targeting.
- Settings `folderScope` restricts searches by prepending paths to `getMarkdownFiles()`.
- Search limits are enforced globally per query via `MAX_MATCHES` constant.
- AI feature acts as a generator tool rather than a standalone mode ("AI-as-a-tool"). It converts natural language to RegEx via a "Convert to RegEx ✨" button and injects the result into RegEx mode.
- `SearchMode` type (`'text' | 'regex'`) replaces old boolean `useRegEx`. AI mode was removed as a type, simplifying state management and searches.

## Blunders
- SVG injection directly to `innerHTML` violates Obsidian community API security standards. Use `DOMParser.parseFromString` instead. Fix implemented in `ui.ts`.
- Memory leak in `setInterval`/`watch` on dev environment. Build watch natively handled by `fs.watch` now.
- Obsidian `createEl('option', { value: 'x' })` does NOT set the `value` attribute. Must set `.value` on the returned element explicitly.
- Removed `processLineBreak`, `processTab`, `prefillFind` settings. If old `data.json` has them, `Object.assign` in `loadSettings` ignores unknown keys harmlessly.
