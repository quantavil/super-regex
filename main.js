// main.js
'use strict';

var obsidian = require('obsidian');

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

const DEFAULT_SETTINGS = {
    findText: '',
    replaceText: '',
    useRegEx: true,
    selOnly: false,
    caseInsensitive: false,
    processLineBreak: false,
    processTab: false,
    prefillFind: false,
    allFiles: false,
    replaceEnabled: true,
    wholeWord: false
};
const MAX_MATCHES = 20000;
const MAX_HISTORY = 10;
const VIEW_TYPE_REGEX_FIND_REPLACE = "regex-find-replace-view";

const logThreshold = 9;
const logger = (logString, logLevel = 0) => {
    if (logLevel <= logThreshold) console.log('RegexFiRe: ' + logString);
};

class RegexFindReplacePlugin extends obsidian.Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            logger('Loading Plugin...', 9);
            this.history = [];
            yield this.loadSettings();

            // Register the custom view
            this.registerView(
                VIEW_TYPE_REGEX_FIND_REPLACE,
                (leaf) => new RegexFindReplaceView(leaf, this)
            );

            // Add the settings tab in Obsidian's settings panel
            this.addSettingTab(new RegexFindReplaceSettingTab(this.app, this));

            // Add an icon to the left-hand ribbon
            this.addRibbonIcon("search", "Open Regex Find & Replace", () => {
                this.activateView();
            });

            // Add command to open the panel from the command palette
            this.addCommand({
                id: 'open-regex-find-replace',
                name: 'Open Find and Replace panel',
                callback: () => {
                    this.activateView();
                }
            });

            // Add command to undo last replacement
            this.addCommand({
                id: 'obsidian-regex-replace-undo',
                name: 'Regex Find/Replace: Revert last operation',
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    yield this.undoLast();
                })
            });

            // Try to activate the view on startup
            this.app.workspace.onLayoutReady(() => {
                this.activateView();
            });
        });
    }


    onunload() {
        logger('Bye!', 9);
        this.history = [];
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_REGEX_FIND_REPLACE);
    }

    activateView() {
        return __awaiter(this, void 0, void 0, function* () {
            this.app.workspace.detachLeavesOfType(VIEW_TYPE_REGEX_FIND_REPLACE);

            yield this.app.workspace.getRightLeaf(false).setViewState({
                type: VIEW_TYPE_REGEX_FIND_REPLACE,
                active: true,
            });

            this.app.workspace.revealLeaf(
                this.app.workspace.getLeavesOfType(VIEW_TYPE_REGEX_FIND_REPLACE)[0]
            );
        });
    }

    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            logger('Loading Settings...', 6);
            this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
        });
    }

    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
        });
    }

    undoLast() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.history || this.history.length === 0) {
                new obsidian.Notice('Nothing to revert.');
                return;
            }

            const lastOp = this.history.pop();
            if (!lastOp || !lastOp.changes || lastOp.changes.length === 0) {
                new obsidian.Notice('Nothing to revert.');
                return;
            }

            logger(`Reverting last operation from ${new Date(lastOp.timestamp).toLocaleString()}`, 6);

            let revertedFiles = 0;
            for (const ch of lastOp.changes) {
                try {
                    const af = this.app.vault.getAbstractFileByPath(ch.path);
                    if (af && af instanceof obsidian.TFile) {
                        yield this.app.vault.modify(af, ch.before);
                        revertedFiles++;
                        logger('Reverted file: ' + ch.path, 8);
                    }
                } catch (e) {
                    logger('Error reverting file ' + ch.path + ': ' + e.message, 1);
                }
            }

            new obsidian.Notice(`Reverted ${lastOp.count} replacement(s) in ${revertedFiles} file(s).`);
        });
    }
}

class RegexFindReplaceView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.matches = [];
        this.currentMatchIndex = 0;
        this.pendingReplacements = new Map();
        this.searchTimeout = null;
    }

    getViewType() {
        return VIEW_TYPE_REGEX_FIND_REPLACE;
    }

    getDisplayText() {
        return "Find and Replace";
    }

    getIcon() {
        return "search";
    }

    onOpen() {
        return __awaiter(this, void 0, void 0, function* () {
            const container = this.containerEl.children[1];
            container.empty();
            container.addClass('regex-find-replace-view');

            this.createUI(container);
            this.updateUI();
        });
    }

    createUI(container) {
        // Search section
        const searchSection = container.createDiv('search-section');

        // Find input container with wrapper for buttons
        const findContainer = searchSection.createDiv('input-container');
        findContainer.createEl('label', { text: 'Find:' });

        // Create wrapper for input and buttons
        const findInputWrapper = findContainer.createDiv('find-input-wrapper');

        // Find input - textarea
        this.findInput = findInputWrapper.createEl('textarea', {
            placeholder: 'Search pattern...',
            value: this.plugin.settings.findText
        });

        // Regex flags container (next to find input)
        this.regexFlagsContainer = findInputWrapper.createDiv('regex-flags-container');
        this.createRegexFlagButtons();

        // Auto-resize textarea
        const autoResize = () => {
            this.findInput.style.height = 'auto';
            this.findInput.style.height = this.findInput.scrollHeight + 'px';
        };
        this.findInput.addEventListener('input', autoResize);
        setTimeout(autoResize, 0); // Initial resize

        // Replace input
        const replaceContainer = searchSection.createDiv('input-container');
        replaceContainer.createEl('label', { text: 'Replace:' });
        this.replaceInput = replaceContainer.createEl('input', {
            type: 'text',
            placeholder: 'Replace with...',
            value: this.plugin.settings.replaceText
        });

        // Options
        const optionsContainer = searchSection.createDiv('options-container');

        this.createToggle(optionsContainer, 'Use RegEx', this.plugin.settings.useRegEx, (value) => {
            this.plugin.settings.useRegEx = value;
            this.plugin.saveSettings();
            this.updateRegexFlagsVisibility();
            this.performSearch();
        });

        this.createToggle(optionsContainer, 'All Files', this.plugin.settings.allFiles, (value) => {
            this.plugin.settings.allFiles = value;
            this.plugin.saveSettings();
            this.performSearch();
        });

        this.createToggle(optionsContainer, 'Enable Replace', this.plugin.settings.replaceEnabled, (value) => {
            this.plugin.settings.replaceEnabled = value;
            this.plugin.saveSettings();
            this.updateUI();
        });

        // Action buttons
        const buttonContainer = searchSection.createDiv('button-container');

        this.replaceAllBtn = buttonContainer.createEl('button', {
            text: 'Replace All',
            cls: 'mod-cta'
        });

        this.replaceSelectedBtn = buttonContainer.createEl('button', {
            text: 'Replace Selected',
            cls: 'mod-cta'
        });

        buttonContainer.createEl('button', {
            text: 'Undo',
            cls: 'mod-muted'
        }).onclick = () => this.plugin.undoLast();

        // Results section
        this.resultsContainer = container.createDiv('results-section');
        this.resultsHeader = this.resultsContainer.createDiv('results-header');
        this.matchesContainer = this.resultsContainer.createDiv('matches-container');

        // Event listeners for Find input (textarea)
        this.findInput.oninput = () => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.plugin.settings.findText = this.findInput.value;
                this.plugin.saveSettings();
                this.performSearch();
            }, 2000); // Changed from 300ms to 2000ms
        };

        // Press Enter to search immediately (Ctrl/Cmd+Enter for multiline)
        this.findInput.onkeydown = (e) => {
            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                clearTimeout(this.searchTimeout);
                this.plugin.settings.findText = this.findInput.value;
                this.plugin.saveSettings();
                this.performSearch();
            }
        };

        // Event listener for Replace input
        this.replaceInput.oninput = () => {
            this.plugin.settings.replaceText = this.replaceInput.value;
            this.plugin.saveSettings();
            this.updatePreviews();
        };

        this.replaceAllBtn.onclick = () => this.replaceAll();
        this.replaceSelectedBtn.onclick = () => this.replaceSelected();
    }

    createToggle(container, label, value, onChange) {
        const toggleContainer = container.createDiv('toggle-container');
        const toggle = new obsidian.ToggleComponent(toggleContainer);
        toggle.setValue(value);
        toggle.onChange(onChange);
        toggleContainer.createEl('label', { text: label });
        return toggle;
    }

    createRegexFlagButtons() {
        // Case insensitive button
        this.caseButton = this.createFlagButton(
            'Match case',
            `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon uppercase-lowercase-a"><path d="M10.5 14L4.5 14"></path><path d="M12.5 18L7.5 6"></path><path d="M3 18L7.5 6"></path><path d="M15.9526 10.8322C15.9526 10.8322 16.6259 10 18.3832 10C20.1406 9.99999 20.9986 11.0587 20.9986 11.9682V16.7018C20.9986 17.1624 21.2815 17.7461 21.7151 18"></path><path d="M20.7151 13.5C18.7151 13.5 15.7151 14.2837 15.7151 16C15.7151 17.7163 17.5908 18.2909 18.7151 18C19.5635 17.7804 20.5265 17.3116 20.889 16.6199"></path></svg>`,
            !this.plugin.settings.caseInsensitive,
            (active) => {
                this.plugin.settings.caseInsensitive = !active;
                this.plugin.saveSettings();
                this.performSearch();
            }
        );

        // Whole word button
        this.wholeWordButton = this.createFlagButton(
            'Whole word',
            `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="11" y2="15"/></svg>`,
            this.plugin.settings.wholeWord,
            (active) => {
                this.plugin.settings.wholeWord = active;
                this.plugin.saveSettings();
                this.performSearch();
            }
        );

        this.updateRegexFlagsVisibility();
    }

    createFlagButton(label, svgContent, initialActive, onChange) {
        const button = this.regexFlagsContainer.createEl('button', {
            cls: 'regex-flag-button' + (initialActive ? ' active' : ''),
            attr: {
                'aria-label': label
            }
        });

        button.innerHTML = svgContent;

        button.onclick = () => {
            const isActive = button.hasClass('active');
            if (isActive) {
                button.removeClass('active');
            } else {
                button.addClass('active');
            }
            onChange(!isActive);
        };

        return button;
    }

    updateRegexFlagsVisibility() {
        if (this.plugin.settings.useRegEx) {
            this.wholeWordButton.style.display = 'flex';
        } else {
            this.wholeWordButton.style.display = 'none';
        }
    }

    updateUI() {
        const replaceEnabled = this.plugin.settings.replaceEnabled;
        this.replaceInput.disabled = !replaceEnabled;
        this.replaceAllBtn.disabled = !replaceEnabled;
        this.replaceSelectedBtn.disabled = !replaceEnabled;

        if (!replaceEnabled) {
            this.replaceInput.addClass('disabled');
            this.replaceAllBtn.addClass('disabled');
            this.replaceSelectedBtn.addClass('disabled');
        } else {
            this.replaceInput.removeClass('disabled');
            this.replaceAllBtn.removeClass('disabled');
            this.replaceSelectedBtn.removeClass('disabled');
        }

        this.updateRegexFlagsVisibility();
    }


    // Add this method to the RegexFindReplaceView class

    performSearch() {
        return __awaiter(this, void 0, void 0, function* () {
            this.matches = [];
            this.pendingReplacements.clear();
            this.matchesContainer.empty();

            const searchText = this.findInput.value;

            // Check if search text is empty or only whitespace
            if (!searchText || !searchText.trim()) {
                this.resultsHeader.setText('Enter a search pattern');
                return;
            }

            // Additional check for single whitespace characters that could cause issues
            if (searchText.length === 1 && /\s/.test(searchText)) {
                this.resultsHeader.setText('Single whitespace characters are not allowed');
                return;
            }

            const useRegEx = this.plugin.settings.useRegEx;
            const caseInsensitive = this.plugin.settings.caseInsensitive;
            const allFiles = this.plugin.settings.allFiles;

            // Track which words were found (for pipe-separated searches)
            let searchWords = [];
            let foundWords = new Set();

            // Check if this is a pipe-separated search
            if (searchText.includes('|')) {
                searchWords = searchText.split('|').map(w => w.trim()).filter(w => w.length > 0);
            }

            let searchRegex = null;
            if (useRegEx) {
                try {
                    const flags = 'gm' + (caseInsensitive ? 'i' : '');
                    let pattern = searchText;

                    // Apply whole word boundary if enabled
                    if (this.plugin.settings.wholeWord) {
                        pattern = `\\b${pattern}\\b`;
                    }

                    searchRegex = new RegExp(pattern, flags);
                } catch (e) {
                    this.resultsHeader.setText('Invalid regular expression');
                    return;
                }
            }

            let matchCount = 0;
            let limitReached = false;

            if (allFiles) {
                // Sort files by folder structure (path)
                const files = this.app.vault.getMarkdownFiles().sort((a, b) => {
                    return a.path.localeCompare(b.path);
                });

                for (const file of files) {
                    const fileMatchCount = yield this.searchInFile(file, searchText, searchRegex, MAX_MATCHES - matchCount, foundWords);
                    matchCount += fileMatchCount;

                    if (matchCount >= MAX_MATCHES) {
                        limitReached = true;
                        break;
                    }
                }
            } else {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    matchCount = yield this.searchInFile(activeFile, searchText, searchRegex, MAX_MATCHES, foundWords);
                    if (matchCount >= MAX_MATCHES) {
                        limitReached = true;
                    }
                }
            }

            let headerText = `Found ${this.matches.length} match${this.matches.length !== 1 ? 'es' : ''}`;
            if (limitReached) {
                headerText += ` (limit of ${MAX_MATCHES.toLocaleString()} reached)`;
            }
            this.resultsHeader.setText(headerText);

            // Display not found words if this was a pipe-separated search
            if (searchWords.length > 0) {
                this.displayNotFoundWords(searchWords, foundWords);
            }

            this.renderMatches();
        });
    }

    // Update the displayNotFoundWords method
    displayNotFoundWords(searchWords, foundWords) {
        const notFoundWords = searchWords.filter(word => !foundWords.has(word));

        if (notFoundWords.length > 0) {
            // Create or update the not-found container
            let notFoundContainer = this.resultsContainer.querySelector('.not-found-words-container');
            if (!notFoundContainer) {
                notFoundContainer = this.resultsContainer.createDiv('not-found-words-container');
                this.resultsContainer.insertBefore(notFoundContainer, this.matchesContainer);
            } else {
                notFoundContainer.empty();
            }

            // Add header
            const header = notFoundContainer.createDiv('not-found-header');
            header.createEl('span', {
                text: 'Words not found:',
                cls: 'not-found-label'
            });

            // Create container for words and copy button
            const wordsContainer = notFoundContainer.createDiv('not-found-words-wrapper');

            // Display the not found words
            const wordsText = notFoundWords.join(' | ');
            const wordsEl = wordsContainer.createEl('span', {
                text: wordsText,
                cls: 'not-found-words'
            });

            // Add copy button
            const copyBtn = wordsContainer.createEl('button', {
                text: 'Copy',
                cls: 'copy-not-found-btn'
            });

            copyBtn.onclick = () => {
                navigator.clipboard.writeText(wordsText).then(() => {
                    new obsidian.Notice('Copied!');
                    copyBtn.setText('Copied!');
                    setTimeout(() => copyBtn.setText('Copy'), 2000);
                });
            };
        }
    }

    // Update the searchInFile method to track found words
    searchInFile(file, searchText, searchRegex, maxMatches = MAX_MATCHES, foundWords = null) {
        return __awaiter(this, void 0, void 0, function* () {
            const content = yield this.app.vault.read(file);
            const lines = content.split('\n');
            let fileMatchCount = 0;

            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                let matches = [];

                if (searchRegex) {
                    searchRegex.lastIndex = 0;
                    let match;
                    while ((match = searchRegex.exec(line)) !== null) {
                        matches.push({
                            start: match.index,
                            end: match.index + match[0].length,
                            text: match[0]
                        });

                        // Track found words for pipe-separated searches
                        if (foundWords && searchText.includes('|')) {
                            const searchWords = searchText.split('|').map(w => w.trim());
                            for (const word of searchWords) {
                                if (match[0].match(new RegExp(word, this.plugin.settings.caseInsensitive ? 'i' : ''))) {
                                    foundWords.add(word);
                                }
                            }
                        }

                        // Check if we've hit the limit
                        if (this.matches.length + matches.length >= maxMatches) {
                            break;
                        }
                    }
                } else {
                    let index = 0;
                    const searchLower = this.plugin.settings.caseInsensitive ? searchText.toLowerCase() : searchText;
                    const lineLower = this.plugin.settings.caseInsensitive ? line.toLowerCase() : line;

                    while ((index = lineLower.indexOf(searchLower, index)) !== -1) {
                        matches.push({
                            start: index,
                            end: index + searchText.length,
                            text: line.substring(index, index + searchText.length)
                        });
                        index += searchText.length;

                        // Check if we've hit the limit
                        if (this.matches.length + matches.length >= maxMatches) {
                            break;
                        }
                    }
                }

                for (const match of matches) {
                    if (this.matches.length >= maxMatches) {
                        return fileMatchCount;
                    }

                    this.matches.push({
                        file: file,
                        lineNum: lineNum,
                        line: line,
                        match: match,
                        id: `${file.path}-${lineNum}-${match.start}`
                    });
                    fileMatchCount++;
                }

                // Early exit if we've reached the limit
                if (this.matches.length >= maxMatches) {
                    break;
                }
            }

            return fileMatchCount;
        });
    }

    renderMatches() {
        this.matchesContainer.empty();

        let currentFile = null;
        let fileContainer = null;

        for (const match of this.matches) {
            if (match.file !== currentFile) {
                currentFile = match.file;
                fileContainer = this.matchesContainer.createDiv('file-matches');
                const fileHeader = fileContainer.createDiv('file-header');
                fileHeader.createEl('span', {
                    text: match.file.path,
                    cls: 'file-path'
                });
            }

            const matchEl = fileContainer.createDiv('match-item');
            matchEl.setAttribute('data-match-id', match.id);

            // Checkbox for selective replacement
            if (this.plugin.settings.replaceEnabled) {
                const checkbox = matchEl.createEl('input', {
                    type: 'checkbox',
                    cls: 'match-checkbox'
                });
                checkbox.checked = this.pendingReplacements.get(match.id) !== false;
                checkbox.onchange = () => {
                    if (checkbox.checked) {
                        this.pendingReplacements.delete(match.id);
                    } else {
                        this.pendingReplacements.set(match.id, false);
                    }
                    this.updatePreview(match);
                };
            }

            const lineContainer = matchEl.createDiv('line-container');

            // Line number
            lineContainer.createEl('span', {
                text: `${match.lineNum + 1}:`,
                cls: 'line-number'
            });

            // Match preview with highlighting
            const previewEl = lineContainer.createDiv('match-preview');
            this.renderMatchPreview(previewEl, match);

            // Click to navigate
            matchEl.onclick = (e) => {
                if (e.target.type !== 'checkbox') {
                    this.navigateToMatch(match);
                }
            };
        }
    }

    renderMatchPreview(container, match) {
        const line = match.line;
        const start = match.match.start;
        const end = match.match.end;

        // Show context around the match
        const contextStart = Math.max(0, start - 30);
        const contextEnd = Math.min(line.length, end + 30);

        if (contextStart > 0) {
            container.createEl('span', { text: '...', cls: 'ellipsis' });
        }

        container.createEl('span', {
            text: line.substring(contextStart, start),
            cls: 'context'
        });

        const highlightEl = container.createEl('span', {
            text: match.match.text,
            cls: 'match-highlight'
        });

        // Show replacement preview if enabled
        if (this.plugin.settings.replaceEnabled && this.pendingReplacements.get(match.id) !== false) {
            const replacement = this.getReplacementText(match.match.text);
            if (replacement !== match.match.text) {
                highlightEl.addClass('has-replacement');
                const replacementEl = container.createDiv('replacement-preview');
                replacementEl.createEl('span', { text: '→', cls: 'arrow' });
                replacementEl.createEl('span', {
                    text: replacement,
                    cls: 'replacement-text'
                });
            }
        }

        container.createEl('span', {
            text: line.substring(end, contextEnd),
            cls: 'context'
        });

        if (contextEnd < line.length) {
            container.createEl('span', { text: '...', cls: 'ellipsis' });
        }
    }

    getReplacementText(matchText) {
        const replaceText = this.replaceInput.value;

        if (this.plugin.settings.useRegEx) {
            const searchText = this.findInput.value;
            const flags = 'gm' + (this.plugin.settings.caseInsensitive ? 'i' : '');
            try {
                const regex = new RegExp(searchText, flags);
                return matchText.replace(regex, replaceText);
            } catch (e) {
                return matchText;
            }
        } else {
            return replaceText;
        }
    }

    updatePreviews() {
        for (const match of this.matches) {
            this.updatePreview(match);
        }
    }

    updatePreview(match) {
        const matchEl = this.matchesContainer.querySelector(`[data-match-id="${match.id}"]`);
        if (matchEl) {
            const previewEl = matchEl.querySelector('.match-preview');
            previewEl.empty();
            this.renderMatchPreview(previewEl, match);
        }
    }

    navigateToMatch(match) {
        return __awaiter(this, void 0, void 0, function* () {
            const leaf = this.app.workspace.getLeaf(false);
            yield leaf.openFile(match.file);

            const view = leaf.view;
            if (view instanceof obsidian.MarkdownView) {
                const editor = view.editor;
                const pos = {
                    line: match.lineNum,
                    ch: match.match.start
                };
                editor.setCursor(pos);
                editor.scrollIntoView({
                    from: pos,
                    to: { line: match.lineNum, ch: match.match.end }
                }, true);

                // Highlight the match temporarily
                const mark = editor.markText(
                    pos,
                    { line: match.lineNum, ch: match.match.end },
                    { className: 'regex-find-highlight-temp' }
                );

                setTimeout(() => mark.clear(), 2000);
            }
        });
    }

    replaceAll() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.plugin.settings.replaceEnabled || this.matches.length === 0) {
                return;
            }

            const replacements = this.matches.filter(m => this.pendingReplacements.get(m.id) !== false);
            if (replacements.length === 0) {
                new obsidian.Notice('No replacements selected');
                return;
            }

            yield this.performReplacements(replacements);
        });
    }

    replaceSelected() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.plugin.settings.replaceEnabled || this.matches.length === 0) {
                return;
            }

            const selected = this.matches.filter(m => {
                const checkbox = this.matchesContainer.querySelector(`[data-match-id="${m.id}"] .match-checkbox`);
                return checkbox && checkbox.checked;
            });

            if (selected.length === 0) {
                new obsidian.Notice('No matches selected');
                return;
            }

            yield this.performReplacements(selected);
        });
    }

    performReplacements(matches) {
        return __awaiter(this, void 0, void 0, function* () {
            const fileChanges = new Map();
            const changes = [];
            let totalReplacements = 0;

            // Group matches by file
            for (const match of matches) {
                if (!fileChanges.has(match.file)) {
                    fileChanges.set(match.file, []);
                }
                fileChanges.get(match.file).push(match);
            }

            // Process each file
            for (const [file, fileMatches] of fileChanges) {
                try {
                    const original = yield this.app.vault.read(file);
                    let modified = original;

                    // Sort matches by position (reverse order to maintain indices)
                    fileMatches.sort((a, b) => {
                        if (a.lineNum !== b.lineNum) {
                            return b.lineNum - a.lineNum;
                        }
                        return b.match.start - a.match.start;
                    });

                    // Apply replacements
                    const lines = modified.split('\n');
                    for (const match of fileMatches) {
                        const line = lines[match.lineNum];
                        const replacement = this.getReplacementText(match.match.text);
                        lines[match.lineNum] =
                            line.substring(0, match.match.start) +
                            replacement +
                            line.substring(match.match.end);
                        totalReplacements++;
                    }

                    modified = lines.join('\n');

                    if (modified !== original) {
                        yield this.app.vault.modify(file, modified);
                        changes.push({
                            path: file.path,
                            before: original,
                            after: modified
                        });
                    }
                } catch (e) {
                    logger('Error processing file: ' + file.path + ' -> ' + e.message, 1);
                }
            }

            // Save to history
            if (totalReplacements > 0 && changes.length > 0) {
                const op = {
                    timestamp: Date.now(),
                    scope: this.plugin.settings.allFiles ? 'vault' : 'document',
                    count: totalReplacements,
                    find: this.findInput.value,
                    replace: this.replaceInput.value,
                    useRegEx: this.plugin.settings.useRegEx,
                    regexFlags: 'gm' + (this.plugin.settings.caseInsensitive ? 'i' : ''),
                    changes
                };

                this.plugin.history.push(op);
                if (this.plugin.history.length > MAX_HISTORY) {
                    this.plugin.history.shift();
                }
            }

            new obsidian.Notice(`Replaced ${totalReplacements} match${totalReplacements !== 1 ? 'es' : ''} in ${changes.length} file${changes.length !== 1 ? 's' : ''}`);

            // Refresh search
            yield this.performSearch();
        });
    }

    onClose() {
        // Nothing to clean up
    }
}

class RegexFindReplaceSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h4', { text: 'Regular Expression Settings' });

        new obsidian.Setting(containerEl)
            .setName('Case Insensitive')
            .setDesc('When using regular expressions, apply the \'i\' modifier for case insensitive search')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.caseInsensitive)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    logger('Settings update: caseInsensitive: ' + value);
                    this.plugin.settings.caseInsensitive = value;
                    yield this.plugin.saveSettings();
                })));

        containerEl.createEl('h4', { text: 'General Settings' });

        new obsidian.Setting(containerEl)
            .setName('Process \\n as line break')
            .setDesc('When \'\\n\' is used in the replace field, a \'line break\' will be inserted accordingly')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.processLineBreak)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    logger('Settings update: processLineBreak: ' + value);
                    this.plugin.settings.processLineBreak = value;
                    yield this.plugin.saveSettings();
                })));

        new obsidian.Setting(containerEl)
            .setName('Process \\t as tab')
            .setDesc('When \'\\t\' is used in the replace field, a \'tab\' will be inserted accordingly')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.processTab)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    logger('Settings update: processTab: ' + value);
                    this.plugin.settings.processTab = value;
                    yield this.plugin.saveSettings();
                })));

        new obsidian.Setting(containerEl)
            .setName('Prefill Find Field')
            .setDesc('Copy the currently selected text (if any) into the \'Find\' text field')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.prefillFind)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    logger('Settings update: prefillFind: ' + value);
                    this.plugin.settings.prefillFind = value;
                    yield this.plugin.saveSettings();
                })));
    }
}

module.exports = RegexFindReplacePlugin;