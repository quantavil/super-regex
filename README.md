# Super Regex

Super Regex is an advanced Find & Replace plugin for Obsidian. It provides a dedicated view pane for performing text replacements across single documents, specific folders, or your entire vault — with full regex support and AI-powered natural language search.

## Features

*   **AI-Powered Regex ✨:** Describe what you want to find in plain English (e.g. "email addresses", "dates in YYYY-MM-DD format"), click the `✨ Convert to RegEx` button, and let Google's Gemini API generate the pattern for you automatically.
*   **Dual Search Modes:** Switch between **Text** (literal string bounds) and **RegEx** (full expression support) via a simple pill selector.
*   **Flexible Scoping:** Search your entire vault, restrict to specific folders via a fuzzy finder, or search within the currently active document.
*   **Granular Control:** Preview match contexts inline with real-time replacement previews. Select individual matches using checkboxes before committing.
*   **Safe Undo Mechanism:** A prominent Undo banner appears after bulk operations, allowing quick reversal. Protected by a history cap.
*   **Export Matches:** Copy all grep-style match results (`file:line:col: text`) to clipboard.
*   **Plaintext Pipe Matching:** Separate multiple words using pipes (`|`) in Text mode to track which terms were "Not Found".
*   **Keyboard Friendly:** `Ctrl/Cmd+Enter` to search, `Ctrl/Cmd+Shift+Enter` to replace.

## How to Use

1. Click the **Search** icon in the left ribbon or invoke `Open Find and Replace panel`.
2. Select your **Mode** using the pills — **Text** or **RegEx**.
3. Enter your query in the *Find* input:
   - **Text mode:** Enter standard text values.
   - **RegEx mode:** Type your regex, OR write plain English and click the `✨ Convert to RegEx` button.
4. Toggle `All Files` and click `📁 All` to restrict to a folder if needed.
5. Define the replacement string in the *Replace* input.
6. Review inline match previews in the results pane.
7. Hit **Replace Checked** to execute.
8. Made a mistake? Click **Undo** on the banner or use the Undo button/command.

## AI Setup

1. Go to **Settings → Super Regex → AI Configuration**.
2. Enter your **API Key** (Google Gemini API key).
3. The default model is `gemma-4-31b-it` and the default endpoint is Google's OpenAI-compatible API. You can change both to use any OpenAI-compatible provider.
4. Click `Verify API Configuration` to test your connection.

## Author

Quantavil

## Version

1.0.3
