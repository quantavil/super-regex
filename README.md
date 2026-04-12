# Super Regex

Super Regex is an advanced Find & Replace plugin for Obsidian. It provides a dedicated view pane allowing you to securely perform complex regular expression text replacements across single documents or your entire vault.

## Features

*   **Advanced Search & Replace:** Full support for JavaScript Regex including capture groups (`$1`, `$2`), case insensitivity, and whole word matching.
*   **Vault-Wide Processing:** Execute bulk search and replaces asynchronously across all files in your vault without locking the UI.
*   **Granular Control:** Preview specific match contexts, select individual lines using checkboxes before committing replacements.
*   **Safe Undo Mechanism:** Robust undo operation stack protected by a 20MB history cap to prevent memory leaks and out-of-memory crashes on enormous vaults.
*   **Plaintext Pipe Matching:** Separate multiple words using standard pipes (`|`) when Regex is disabled to quickly track which exact words were "Not Found".

## How to Use

1. Click the **Search** icon in the left ribbon or invoke the command `Open Find and Replace panel`.
2. Enter your query in the *Find* input. Use toggles like `Use RegEx` or `All Files` according to your scope.
3. Define the replacement string in the *Replace* input (using `$1` syntax if applying Regex groups).
4. Review highlighted match previews in the results pane.
5. Hit **Replace All** or uncheck specific entries and use **Replace Selected**.
6. Made a mistake? Run the command `Regex Find/Replace: Revert last operation` to instantly undo it.

## Author

Quantavil

## Version

1.0.2
