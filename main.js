'use strict';

const {
    Plugin,
    ItemView,
    ToggleComponent,
    PluginSettingTab,
    Setting,
    TFile,
    Notice,
    MarkdownView
} = require('obsidian');

/* ===========================
   Constants / Utilities
   =========================== */
const VIEW_TYPE_REGEX_FIND_REPLACE = "regex-find-replace-view";

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

const MAX_MATCHES = 10000;
const MAX_HISTORY = 10;
const PAGE_SIZE = 1000;

const logThreshold = 9;
const logger = (msg, lvl = 0) => { if (lvl <= logThreshold) console.log('RegexFiRe:', msg); };

const debounce = (fn, delay = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
};

// Centralized regex builder with whole-word support
const buildRegex = (pattern, { caseInsensitive, wholeWord } = {}) => {
  const flags = 'gm' + (caseInsensitive ? 'i' : '');
  let patt = pattern;
  if (wholeWord) patt = `\\b(?:${patt})\\b`;
  return new RegExp(patt, flags);
};

/* ===========================
   Plugin
   =========================== */
class RegexFindReplacePlugin extends Plugin {
    async onload() {
        logger('Loading Plugin...', 9);
        this.history = [];
        await this.loadSettings();

        this.registerView(VIEW_TYPE_REGEX_FIND_REPLACE, (leaf) => new RegexFindReplaceView(leaf, this));
        this.addSettingTab(new RegexFindReplaceSettingTab(this.app, this));

        this.addRibbonIcon("search", "Open Regex Find & Replace", () => this.activateView());

        this.addCommand({
            id: 'open-regex-find-replace',
            name: 'Open Find and Replace panel',
            callback: () => this.activateView()
        });

        this.addCommand({
            id: 'obsidian-regex-replace-undo',
            name: 'Regex Find/Replace: Revert last operation',
            callback: async () => await this.undoLast()
        });

    }

    onunload() {
        logger('Bye!', 9);
        this.history = [];
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_REGEX_FIND_REPLACE);
    }

    async activateView() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_REGEX_FIND_REPLACE);
        const leaf = this.app.workspace.getRightLeaf(false);
        await leaf.setViewState({ type: VIEW_TYPE_REGEX_FIND_REPLACE, active: true });
        this.app.workspace.revealLeaf(this.app.workspace.getLeavesOfType(VIEW_TYPE_REGEX_FIND_REPLACE)[0]);
    }

    async loadSettings() {
        logger('Loading Settings...', 6);
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async undoLast() {
        if (!this.history?.length) {
            new Notice('Nothing to revert.');
            return;
        }

        const lastOp = this.history.pop();
        if (!lastOp?.changes?.length) {
            new Notice('Nothing to revert.');
            return;
        }

        logger(`Reverting last operation from ${new Date(lastOp.timestamp).toLocaleString()}`, 6);

        let revertedFiles = 0;
        for (const ch of lastOp.changes) {
            try {
                const af = this.app.vault.getAbstractFileByPath(ch.path);
                if (af && af instanceof TFile) {
                    await this.app.vault.modify(af, ch.before);
                    revertedFiles++;
                    logger('Reverted file: ' + ch.path, 8);
                }
            } catch (e) {
                logger('Error reverting file ' + ch.path + ': ' + e.message, 1);
            }
        }

        new Notice(`Reverted ${lastOp.count} replacement(s) in ${revertedFiles} file(s).`);
    }
}

/* ===========================
   View
   =========================== */
class RegexFindReplaceView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.matches = [];
        this.currentMatchIndex = 0;
        this.pendingReplacements = new Map();
        this.debouncedSearch = debounce(() => this.performSearch(), 500);

        // Paging / background search state
        this.renderLimit = PAGE_SIZE;
        this.renderedCount = 0;
        this.fileContainers = new Map();
        this.initialBatchRendered = false;
        this.searchInProgress = false;
    }

    getViewType() { return VIEW_TYPE_REGEX_FIND_REPLACE; }
    getDisplayText() { return "Find and Replace"; }
    getIcon() { return "search"; }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('regex-find-replace-view');

        this.createUI(container);
        this.updateUI();
    }

    createUI(container) {
        // Search section
        const searchSection = container.createDiv('search-section');

        // Find input container
        const findContainer = searchSection.createDiv('input-container');
        findContainer.createEl('label', { text: 'Find:' });

        const findInputWrapper = findContainer.createDiv('find-input-wrapper');

        this.findInput = findInputWrapper.createEl('textarea', {
            placeholder: 'Search pattern...',
            value: this.plugin.settings.findText
        });

        // Regex flags container
        this.regexFlagsContainer = findInputWrapper.createDiv('regex-flags-container');
        this.createRegexFlagButtons();

        // Auto-resize textarea
        const autoResize = () => {
            this.findInput.style.height = 'auto';
            this.findInput.style.height = this.findInput.scrollHeight + 'px';
        };
        this.findInput.addEventListener('input', autoResize);
        setTimeout(autoResize, 0);

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

        // Buttons
        const buttonContainer = searchSection.createDiv('button-container');

        this.replaceAllBtn = buttonContainer.createEl('button', { text: 'Replace All', cls: 'mod-cta' });
        this.replaceSelectedBtn = buttonContainer.createEl('button', { text: 'Replace Selected', cls: 'mod-cta' });

        // Deselect All
        this.deselectAllBtn = buttonContainer.createEl('button', { text: 'Deselect All', cls: 'mod-muted' });
        this.deselectAllBtn.onclick = () => this.deselectAll();

        // Undo
        buttonContainer.createEl('button', { text: 'Undo', cls: 'mod-muted' }).onclick = () => this.plugin.undoLast();

        // Results
        this.resultsContainer = container.createDiv('results-section');
        this.resultsHeader = this.resultsContainer.createDiv('results-header');

        // Header text + clickable "Load more"
        this.headerTextEl = this.resultsHeader.createEl('span', { cls: 'results-header-text' });
        this.loadMoreLink = this.resultsHeader.createEl('a', {
            text: 'Load more',
            href: '#',
            cls: 'results-header-load-more'
        });
        this.loadMoreLink.style.marginLeft = '8px';
        this.loadMoreLink.onclick = (e) => { e.preventDefault(); this.loadMore(); };

        this.matchesContainer = this.resultsContainer.createDiv('matches-container');
        this.updateLoadMoreVisibility();

        // Events
        this.findInput.oninput = () => {
            this.plugin.settings.findText = this.findInput.value;
            this.plugin.saveSettings();
            this.debouncedSearch();
        };

        this.findInput.onkeydown = (e) => {
            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                this.plugin.settings.findText = this.findInput.value;
                this.plugin.saveSettings();
                this.performSearch();
            }
        };

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
        const toggle = new ToggleComponent(toggleContainer);
        toggle.setValue(value);
        toggle.onChange(onChange);
        toggleContainer.createEl('label', { text: label });
        return toggle;
    }

    createRegexFlagButtons() {
        // Match case (active = case sensitive)
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

        // Whole word
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
            attr: { 'aria-label': label }
        });
        button.innerHTML = svgContent;
        button.onclick = () => {
            const nowActive = !button.hasClass('active');
            button.toggleClass('active', nowActive);
            onChange(nowActive);
        };
        return button;
    }

    updateRegexFlagsVisibility() {
        // Case button always visible; whole-word only for regex mode
        if (this.plugin.settings.useRegEx) {
            this.wholeWordButton.style.display = 'flex';
        } else {
            this.wholeWordButton.style.display = 'none';
        }
    }

    updateUI() {
        const enabled = this.plugin.settings.replaceEnabled;
        const setDisabled = (el) => {
            el.disabled = !enabled;
            el.toggleClass('disabled', !enabled);
        };
        setDisabled(this.replaceInput);
        setDisabled(this.replaceAllBtn);
        setDisabled(this.replaceSelectedBtn);
        setDisabled(this.deselectAllBtn);
        this.updateRegexFlagsVisibility();
    }

    async performSearch() {
        this.matches = [];
        this.pendingReplacements.clear();
        this.matchesContainer.empty();
        this.fileContainers = new Map();

        const notFoundContainer = this.resultsContainer.querySelector('.not-found-words-container');
        if (notFoundContainer) notFoundContainer.remove();

        this.headerTextEl.setText('Searching...');
        this.initialBatchRendered = false;
        this.renderLimit = PAGE_SIZE;
        this.renderedCount = 0;
        this.searchInProgress = true;

        const searchText = this.findInput.value || '';
        if (!searchText.trim()) {
            this.headerTextEl.setText('Enter a search pattern');
            this.searchInProgress = false;
            this.updateLoadMoreVisibility();
            return;
        }

        const { useRegEx, caseInsensitive, allFiles, wholeWord } = this.plugin.settings;

        // Pipe-separated tracking
        const isPipeSearch = searchText.includes('|');
        const searchWords = isPipeSearch ? searchText.split('|').map(w => w.trim()).filter(Boolean) : [];
        const foundWords = isPipeSearch ? new Set() : null;

        let searchRegex = null;
        if (useRegEx) {
            try {
                searchRegex = buildRegex(searchText, { caseInsensitive, wholeWord });
                if (searchRegex.test('')) {
                    this.headerTextEl.setText('Pattern matches empty string - please refine your search');
                    this.searchInProgress = false;
                    this.updateLoadMoreVisibility();
                    return;
                }
            } catch (e) {
                this.headerTextEl.setText('Invalid regular expression');
                this.searchInProgress = false;
                this.updateLoadMoreVisibility();
                return;
            }
        }

        let matchCount = 0;
        let limitReached = false;

        if (allFiles) {
            const files = this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
            for (const file of files) {
                const fileMatchCount = await this.searchInFile(file, searchText, searchRegex, MAX_MATCHES - matchCount, foundWords);
                matchCount += fileMatchCount;
                if (matchCount >= MAX_MATCHES) { limitReached = true; break; }
                // Yield to UI so it stays responsive
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        } else {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                matchCount = await this.searchInFile(activeFile, searchText, searchRegex, MAX_MATCHES, foundWords);
                if (matchCount >= MAX_MATCHES) limitReached = true;
            }
        }

        if (!this.initialBatchRendered) {
            this.renderLimit = Math.min(PAGE_SIZE, this.matches.length);
            this.renderMatches({ append: false });
        } else {
            this.updateLoadMoreVisibility();
        }

        this.searchInProgress = false;
        this.updateHeader(limitReached);

        if (isPipeSearch) this.displayNotFoundWords(searchWords, foundWords);
    }

    displayNotFoundWords(searchWords, foundWords) {
        const notFoundWords = searchWords.filter(w => !foundWords.has(w));
        let notFoundContainer = this.resultsContainer.querySelector('.not-found-words-container');

        if (notFoundWords.length > 0) {
            if (!notFoundContainer) {
                notFoundContainer = this.resultsContainer.createDiv('not-found-words-container');
                this.resultsContainer.insertBefore(notFoundContainer, this.matchesContainer);
            } else {
                notFoundContainer.empty();
            }

            const header = notFoundContainer.createDiv('not-found-header');
            header.createEl('span', { text: 'Words not found:', cls: 'not-found-label' });

            const wordsContainer = notFoundContainer.createDiv('not-found-words-wrapper');
            const wordsText = notFoundWords.join(' | ');
            wordsContainer.createEl('span', { text: wordsText, cls: 'not-found-words' });

            const copyBtn = wordsContainer.createEl('button', { text: 'Copy', cls: 'copy-not-found-btn' });
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(wordsText).then(() => {
                    new Notice('Copied!');
                    copyBtn.setText('Copied!');
                    setTimeout(() => copyBtn.setText('Copy'), 2000);
                });
            };
        } else if (notFoundContainer) {
            notFoundContainer.remove();
        }
    }

    async searchInFile(file, searchText, searchRegex, maxMatches = MAX_MATCHES, foundWords = null) {
        const content = await this.app.vault.read(file);
        const lines = content.split('\n');
        let fileMatchCount = 0;

        const isPipe = searchText.includes('|');
        const pipeWords = isPipe ? searchText.split('|').map(w => w.trim()).filter(Boolean) : null;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            const lineMatches = [];

            if (searchRegex) {
                searchRegex.lastIndex = 0;
                let match;
                while ((match = searchRegex.exec(line)) !== null) {
                    lineMatches.push({ start: match.index, end: match.index + match[0].length, text: match[0] });

                    if (foundWords && isPipe && pipeWords?.length) {
                        for (const word of pipeWords) {
                            try {
                                const re = new RegExp(word, this.plugin.settings.caseInsensitive ? 'i' : '');
                                if (re.test(match[0])) foundWords.add(word);
                            } catch (_) { /* ignore */ }
                        }
                    }
                    if (this.matches.length + lineMatches.length >= maxMatches) break;
                }
            } else {
                const ci = this.plugin.settings.caseInsensitive;
                const query = ci ? searchText.toLowerCase() : searchText;
                const src = ci ? line.toLowerCase() : line;
                let index = 0;
                while ((index = src.indexOf(query, index)) !== -1) {
                    lineMatches.push({ start: index, end: index + searchText.length, text: line.substring(index, index + searchText.length) });
                    index += searchText.length;
                    if (this.matches.length + lineMatches.length >= maxMatches) break;
                }
            }

            for (const m of lineMatches) {
                if (this.matches.length >= maxMatches) return fileMatchCount;

                this.matches.push({ file, lineNum, line, match: m, id: `${file.path}-${lineNum}-${m.start}` });
                fileMatchCount++;

                // Render the first page as soon as we have it
                this.maybeRenderInitialBatch();
            }

            if (this.matches.length >= maxMatches) break;
        }

        return fileMatchCount;
    }

    renderMatches({ append = false } = {}) {
        if (!append) {
            this.matchesContainer.empty();
            this.fileContainers = new Map();
            this.renderedCount = 0;
        }
        const end = Math.min(this.renderLimit, this.matches.length);
        this.renderMatchesSlice(this.renderedCount, end);
        this.renderedCount = end;
        this.updateLoadMoreVisibility();
    }

    // Actions
    deselectAll() {
        if (!this.plugin.settings.replaceEnabled) return;
        for (const m of this.matches) this.pendingReplacements.set(m.id, false);
        this.matchesContainer.querySelectorAll('.match-checkbox').forEach(cb => { cb.checked = false; });
        this.updatePreviews();
    }

    loadMore() {
        const start = this.renderedCount;
        const end = Math.min(start + PAGE_SIZE, this.matches.length);
        this.renderMatchesSlice(start, end);
        this.renderedCount = end;
        this.updateLoadMoreVisibility();
        this.updateHeader();
    }

    // Rendering helpers
    ensureFileContainer(file) {
        const key = file.path;
        if (this.fileContainers.has(key)) return this.fileContainers.get(key);
        const fileContainer = this.matchesContainer.createDiv('file-matches');
        const fileHeader = fileContainer.createDiv('file-header');
        fileHeader.createEl('span', { text: key, cls: 'file-path' });
        this.fileContainers.set(key, fileContainer);
        return fileContainer;
    }

    renderMatchesSlice(start, end) {
        for (let i = start; i < end; i++) {
            const match = this.matches[i];
            const fileContainer = this.ensureFileContainer(match.file);

            const matchEl = fileContainer.createDiv('match-item');
            matchEl.setAttribute('data-match-id', match.id);

            if (this.plugin.settings.replaceEnabled) {
                const checkbox = matchEl.createEl('input', { type: 'checkbox', cls: 'match-checkbox' });
                checkbox.checked = this.pendingReplacements.get(match.id) !== false;
                checkbox.onchange = () => {
                    if (checkbox.checked) this.pendingReplacements.delete(match.id);
                    else this.pendingReplacements.set(match.id, false);
                    this.updatePreview(match);
                };
            }

            const lineContainer = matchEl.createDiv('line-container');
            lineContainer.createEl('span', { text: `${match.lineNum + 1}:`, cls: 'line-number' });

            const previewEl = lineContainer.createDiv('match-preview');
            this.renderMatchPreview(previewEl, match);

            matchEl.onclick = (e) => {
                if (e.target.type !== 'checkbox') this.navigateToMatch(match);
            };
        }
    }

    updateLoadMoreVisibility() {
        if (this.loadMoreLink) {
            this.loadMoreLink.style.display = (this.renderedCount < this.matches.length) ? '' : 'none';
        }
    }

    maybeRenderInitialBatch() {
        if (!this.initialBatchRendered && this.matches.length >= PAGE_SIZE) {
            this.initialBatchRendered = true;
            this.renderLimit = PAGE_SIZE;
            // Render first page without blocking the ongoing search
            requestAnimationFrame(() => {
                this.renderMatches({ append: false });
                this.updateHeader();
            });
        }
    }

    updateHeader(limitReached = false) {
        if (!this.headerTextEl) return;

        if (this.initialBatchRendered && (this.searchInProgress || this.renderedCount < this.matches.length)) {
            const bg = this.searchInProgress ? ' (continuing search in background...)' : '';
            this.headerTextEl.setText(`Showing first ${this.renderedCount.toLocaleString()} matches${bg}`);
        } else {
            let text = `Found ${this.matches.length} match${this.matches.length !== 1 ? 'es' : ''}`;
            if (limitReached) text += ` (limit of ${MAX_MATCHES.toLocaleString()} reached)`;
            this.headerTextEl.setText(text);
        }

        this.updateLoadMoreVisibility();
    }

    // Match preview renderer
    renderMatchPreview(container, match) {
        const line = match.line;
        const { start, end, text } = match.match;

        const contextStart = Math.max(0, start - 30);
        const contextEnd = Math.min(line.length, end + 30);

        if (contextStart > 0) container.createEl('span', { text: '...', cls: 'ellipsis' });

        container.createEl('span', { text: line.substring(contextStart, start), cls: 'context' });

        const highlightEl = container.createEl('span', { text, cls: 'match-highlight' });

        if (this.plugin.settings.replaceEnabled && this.pendingReplacements.get(match.id) !== false) {
            const replacement = this.getReplacementText(text);
            if (replacement !== text) {
                highlightEl.addClass('has-replacement');
                const replacementEl = container.createDiv('replacement-preview');
                replacementEl.createEl('span', { text: '→', cls: 'arrow' });
                replacementEl.createEl('span', { text: replacement, cls: 'replacement-text' });
            }
        }

        container.createEl('span', { text: line.substring(end, contextEnd), cls: 'context' });
        if (contextEnd < line.length) container.createEl('span', { text: '...', cls: 'ellipsis' });
    }

    getReplacementText(matchText) {
        const replaceText = this.replaceInput.value ?? '';
        if (this.plugin.settings.useRegEx) {
            try {
                const regex = buildRegex(this.findInput.value, {
                    caseInsensitive: this.plugin.settings.caseInsensitive,
                    wholeWord: this.plugin.settings.wholeWord
                });
                return matchText.replace(regex, replaceText);
            } catch (_) {
                return matchText;
            }
        }
        return replaceText;
    }

    updatePreviews() {
        for (const match of this.matches) this.updatePreview(match);
    }

    updatePreview(match) {
        const matchEl = this.matchesContainer.querySelector(`[data-match-id="${match.id}"]`);
        if (!matchEl) return;
        const previewEl = matchEl.querySelector('.match-preview');
        if (!previewEl) return;
        previewEl.empty();
        this.renderMatchPreview(previewEl, match);
    }

    async navigateToMatch(match) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(match.file);

        const view = leaf.view;
        if (view instanceof MarkdownView) {
            const editor = view.editor;
            const from = { line: match.lineNum, ch: match.match.start };
            const to = { line: match.lineNum, ch: match.match.end };
            editor.setCursor(from);
            editor.scrollIntoView({ from, to }, true);
            const mark = editor.markText(from, to, { className: 'regex-find-highlight-temp' });
            setTimeout(() => mark.clear(), 2000);
        }
    }

    async replaceAll() {
        if (!this.plugin.settings.replaceEnabled || this.matches.length === 0) return;
        const replacements = this.matches.filter(m => this.pendingReplacements.get(m.id) !== false);
        if (!replacements.length) { new Notice('No replacements selected'); return; }
        await this.performReplacements(replacements);
    }

    async replaceSelected() {
        if (!this.plugin.settings.replaceEnabled || this.matches.length === 0) return;
        const selected = this.matches.filter(m => {
            const checkbox = this.matchesContainer.querySelector(`[data-match-id="${m.id}"] .match-checkbox`);
            return checkbox && checkbox.checked;
        });
        if (!selected.length) { new Notice('No matches selected'); return; }
        await this.performReplacements(selected);
    }

    async performReplacements(matches) {
        const fileChanges = new Map();
        const changes = [];
        let totalReplacements = 0;

        // Group by file
        for (const m of matches) {
            if (!fileChanges.has(m.file)) fileChanges.set(m.file, []);
            fileChanges.get(m.file).push(m);
        }

        for (const [file, fileMatches] of fileChanges) {
            try {
                const original = await this.app.vault.read(file);
                const lines = original.split('\n');

                // Sort reverse to preserve indices
                fileMatches.sort((a, b) => (a.lineNum !== b.lineNum) ? b.lineNum - a.lineNum : b.match.start - a.match.start);

                for (const m of fileMatches) {
                    const line = lines[m.lineNum];
                    const replacement = this.getReplacementText(m.match.text);
                    lines[m.lineNum] = line.slice(0, m.match.start) + replacement + line.slice(m.match.end);
                    totalReplacements++;
                }

                const modified = lines.join('\n');
                if (modified !== original) {
                    await this.app.vault.modify(file, modified);
                    changes.push({ path: file.path, before: original, after: modified });
                }
            } catch (e) {
                logger('Error processing file: ' + file.path + ' -> ' + e.message, 1);
            }
        }

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
            if (this.plugin.history.length > MAX_HISTORY) this.plugin.history.shift();
        }

        new Notice(`Replaced ${totalReplacements} match${totalReplacements !== 1 ? 'es' : ''} in ${changes.length} file${changes.length !== 1 ? 's' : ''}`);
        await this.performSearch();
    }

    onClose() { /* noop */ }
}

/* ===========================
   Settings
   =========================== */
class RegexFindReplaceSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h4', { text: 'Regular Expression Settings' });

        new Setting(containerEl)
            .setName('Case Insensitive')
            .setDesc('When using regular expressions, apply the \'i\' modifier for case insensitive search')
            .addToggle(t => t
                .setValue(this.plugin.settings.caseInsensitive)
                .onChange(async (value) => {
                    logger('Settings update: caseInsensitive: ' + value);
                    this.plugin.settings.caseInsensitive = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h4', { text: 'General Settings' });

        new Setting(containerEl)
            .setName('Process \\n as line break')
            .setDesc('When \'\\n\' is used in the replace field, a \'line break\' will be inserted accordingly')
            .addToggle(t => t
                .setValue(this.plugin.settings.processLineBreak)
                .onChange(async (value) => {
                    logger('Settings update: processLineBreak: ' + value);
                    this.plugin.settings.processLineBreak = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Process \\t as tab')
            .setDesc('When \'\\t\' is used in the replace field, a \'tab\' will be inserted accordingly')
            .addToggle(t => t
                .setValue(this.plugin.settings.processTab)
                .onChange(async (value) => {
                    logger('Settings update: processTab: ' + value);
                    this.plugin.settings.processTab = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Prefill Find Field')
            .setDesc('Copy the currently selected text (if any) into the \'Find\' text field')
            .addToggle(t => t
                .setValue(this.plugin.settings.prefillFind)
                .onChange(async (value) => {
                    logger('Settings update: prefillFind: ' + value);
                    this.plugin.settings.prefillFind = value;
                    await this.plugin.saveSettings();
                }));
    }
}

module.exports = RegexFindReplacePlugin;