# Super Regex

Super Regex is an advanced Find & Replace plugin for Obsidian. It provides a dedicated view pane allowing you to securely perform complex regular expression text replacements across single documents, specific folders, or your entire vault.

## Features

*   **Advanced Search & Replace:** Full support for JavaScript Regex including capture groups (`$1`, `$2`), case insensitivity, and whole word matching.
*   **Flexible Scoping:** Search your entire vault, restrict to specific folders via a fuzzy finder, or search within the currently active document.
*   **Granular Control:** Preview specific match contexts inline. Matches are shown alongside your replacement text in real-time. Select individual lines using checkboxes before committing replacements.
*   **Safe Undo Mechanism:** A prominent Undo banner appears immediately after bulk operations, allowing you to quickly reverse replacements. Protected by a history cap to prevent memory leaks on enormous vaults.
*   **Export Matches:** Copy all grep-style match results (`file:line:col: text`) directly to your clipboard.
*   **Plaintext Pipe Matching:** Separate multiple words using standard pipes (`|`) when Regex is disabled to quickly track which exact words were "Not Found".
*   **Keyboard Friendly:** Press `Ctrl/Cmd+Enter` to search and `Ctrl/Cmd+Shift+Enter` to execute replacements directly from the input fields.

## How to Use

1. Click the **Search** icon in the left ribbon or invoke the command `Open Find and Replace panel`.
2. Enter your query in the *Find* input. Use toggles like `RegEx` or `All Files` according to your scope.
3. Click the `📁 All` chip to restrict your search to a specific folder.
4. Define the replacement string in the *Replace* input (using `$1` syntax if applying Regex groups).
5. Review inline match previews in the results pane.
6. Hit **Replace Checked** to execute the operation.
7. Made a mistake? Click **Undo** on the success banner that appears—or use the dedicated Undo button/command.

## Author

Quantavil

## Version

1.0.2
