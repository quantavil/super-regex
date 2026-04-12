import { ItemView, WorkspaceLeaf, Notice, TFile, MarkdownView, Menu, FuzzySuggestModal, TFolder } from 'obsidian';
import type RegexFindReplacePlugin from './main';
import { VIEW_TYPE_REGEX_FIND_REPLACE, PAGE_SIZE, MAX_MATCHES, FileMatch } from './types';
import { debounce, buildRegex, getReplacementText } from './utils';
import { findAllMatchesInLine, SearchConfig } from './search';
import { createToggle, createFlagButton, renderMatchPreview } from './ui';

class FolderSuggest extends FuzzySuggestModal<TFolder> {
    folders: TFolder[];
    onChoose: (folder: TFolder) => void;

    constructor(app: any, folders: TFolder[], onChoose: (folder: TFolder) => void) {
        super(app);
        this.folders = folders;
        this.onChoose = onChoose;
        this.setPlaceholder('Pick a folder…');
    }
    getItems(): TFolder[] { return this.folders; }
    getItemText(item: TFolder): string { return item.path || '/'; }
    onChooseItem(item: TFolder): void { this.onChoose(item); }
}

export class RegexFindReplaceView extends ItemView {
    plugin: RegexFindReplacePlugin;
    matches: FileMatch[];
    pendingReplacements: Map<string, boolean>;
    debouncedSearch: () => void;
    renderLimit: number;
    renderedCount: number;
    fileContainers: Map<string, HTMLElement>;
    matchCounts: Map<string, number>;
    initialBatchRendered: boolean;
    searchInProgress: boolean;
    currentSearchRegex: RegExp | null = null;
    currentSearchText: string = '';

    findInput!: HTMLTextAreaElement;
    replaceInput!: HTMLTextAreaElement;
    replaceAllBtn!: HTMLButtonElement;
    selectAllBtn!: HTMLButtonElement;
    deselectAllBtn!: HTMLButtonElement;
    undoBtn!: HTMLButtonElement;
    regexFlagsContainer!: HTMLElement;
    resultsContainer!: HTMLElement;
    resultsHeader!: HTMLElement;
    headerTextEl!: HTMLElement;
    loadMoreLink!: HTMLAnchorElement;
    matchesContainer!: HTMLElement;
    caseButton!: HTMLButtonElement;
    wholeWordButton!: HTMLButtonElement;
    folderScopeEl!: HTMLElement;
    undoBanner!: HTMLElement;

    constructor(leaf: WorkspaceLeaf, plugin: RegexFindReplacePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.matches = [];
        this.pendingReplacements = new Map();
        this.debouncedSearch = debounce(() => this.performSearch(), 500);

        this.renderLimit = PAGE_SIZE;
        this.renderedCount = 0;
        this.fileContainers = new Map();
        this.matchCounts = new Map();
        this.initialBatchRendered = false;
        this.searchInProgress = false;
    }

    getViewType(): string { return VIEW_TYPE_REGEX_FIND_REPLACE; }
    getDisplayText(): string { return "Find and Replace"; }
    getIcon(): string { return "search"; }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('regex-find-replace-view');

        this.createUI(container);
        this.updateUI();
    }

    createUI(container: HTMLElement) {
        const searchSection = container.createDiv('search-section');

        // --- Find row ---
        const findContainer = searchSection.createDiv('input-container');
        findContainer.createEl('label', { text: 'Find:' });

        const findInputWrapper = findContainer.createDiv('find-input-wrapper');

        const historyBtn = findInputWrapper.createEl('button', { cls: 'regex-history-button', title: 'Search History' });
        historyBtn.textContent = '🕒';
        historyBtn.onclick = (e) => {
            const menu = new Menu();
            if (!this.plugin.settings.searchHistory || this.plugin.settings.searchHistory.length === 0) {
                menu.addItem(i => i.setTitle('No history').setDisabled(true));
            } else {
                for (const h of this.plugin.settings.searchHistory) {
                    menu.addItem(item => {
                        item.setTitle(h).onClick(() => {
                            this.findInput.value = h;
                            this.plugin.settings.findText = h;
                            this.plugin.saveSettings();
                            this.performSearch();
                        });
                    });
                }
            }
            menu.showAtMouseEvent(e);
        };

        this.findInput = findInputWrapper.createEl('textarea', {
            placeholder: 'Search pattern…'
        });
        this.findInput.value = this.plugin.settings.findText;

        this.regexFlagsContainer = findInputWrapper.createDiv('regex-flags-container');
        this.createRegexFlagButtons();

        const autoResize = (el: HTMLTextAreaElement) => () => {
            if (!el) return;
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        };
        this.findInput.addEventListener('input', autoResize(this.findInput));
        setTimeout(autoResize(this.findInput), 0);

        // --- Replace row ---
        const replaceContainer = searchSection.createDiv('input-container');
        replaceContainer.createEl('label', { text: 'Replace:' });

        const replaceInputWrapper = replaceContainer.createDiv('find-input-wrapper');
        this.replaceInput = replaceInputWrapper.createEl('textarea', {
            placeholder: 'Replace with…'
        });
        this.replaceInput.value = this.plugin.settings.replaceText;
        this.replaceInput.addEventListener('input', autoResize(this.replaceInput));
        setTimeout(autoResize(this.replaceInput), 0);

        // --- Options row ---
        const optionsContainer = searchSection.createDiv('options-container');

        createToggle(optionsContainer, 'RegEx', this.plugin.settings.useRegEx, (value) => {
            this.plugin.settings.useRegEx = value;
            this.plugin.saveSettings();
            this.updateRegexFlagsVisibility();
            this.performSearch();
        });

        createToggle(optionsContainer, 'All Files', this.plugin.settings.allFiles, (value) => {
            this.plugin.settings.allFiles = value;
            this.plugin.saveSettings();
            this.updateFolderScopeVisibility();
            this.performSearch();
        });

        createToggle(optionsContainer, 'Replace', this.plugin.settings.replaceEnabled, (value) => {
            this.plugin.settings.replaceEnabled = value;
            this.plugin.saveSettings();
            this.updateUI();
        });

        // --- Folder scope (F2) ---
        this.folderScopeEl = optionsContainer.createDiv('folder-scope');
        const folderLabel = this.folderScopeEl.createEl('span', { cls: 'folder-scope-label' });
        folderLabel.textContent = this.plugin.settings.folderScope
            ? `📁 ${this.plugin.settings.folderScope}`
            : '📁 All';
        this.folderScopeEl.onclick = () => {
            const allFolders = this.getAllFolders();
            const modal = new FolderSuggest(this.app, allFolders, (folder) => {
                const path = folder.path === '/' ? '' : folder.path;
                this.plugin.settings.folderScope = path;
                this.plugin.saveSettings();
                folderLabel.textContent = path ? `📁 ${path}` : '📁 All';
                this.performSearch();
            });
            modal.open();
        };
        this.updateFolderScopeVisibility();

        // --- Buttons ---
        const buttonContainer = searchSection.createDiv('button-container');

        this.replaceAllBtn = buttonContainer.createEl('button', { text: 'Replace Checked', cls: 'mod-cta' });
        this.replaceAllBtn.onclick = () => this.replaceAll();

        this.selectAllBtn = buttonContainer.createEl('button', { text: 'Select All', cls: 'mod-muted' });
        this.selectAllBtn.onclick = () => this.selectAll();

        this.deselectAllBtn = buttonContainer.createEl('button', { text: 'Deselect All', cls: 'mod-muted' });
        this.deselectAllBtn.onclick = () => this.deselectAll();

        this.undoBtn = buttonContainer.createEl('button', { text: 'Undo', cls: 'mod-muted' });
        this.undoBtn.onclick = () => this.doUndo();

        // --- Undo banner (F9 — prominent undo after replacement) ---
        this.undoBanner = searchSection.createDiv('undo-banner');
        this.undoBanner.style.display = 'none';

        // --- Results ---
        this.resultsContainer = container.createDiv('results-section');
        this.resultsHeader = this.resultsContainer.createDiv('results-header');

        this.headerTextEl = this.resultsHeader.createEl('span', { cls: 'results-header-text' });

        // Export matches button (F5)
        const exportBtn = this.resultsHeader.createEl('button', {
            cls: 'results-header-export',
            title: 'Copy all matches to clipboard'
        });
        exportBtn.textContent = '📋';
        exportBtn.onclick = () => this.exportMatches();

        this.loadMoreLink = this.resultsHeader.createEl('a', {
            text: 'Load more',
            href: '#',
            cls: 'results-header-load-more'
        });
        this.loadMoreLink.onclick = (e) => { e.preventDefault(); this.loadMore(); };

        this.matchesContainer = this.resultsContainer.createDiv('matches-container');
        this.updateLoadMoreVisibility();

        // --- Event handlers ---
        this.findInput.oninput = () => {
            this.plugin.settings.findText = this.findInput.value;
            this.plugin.saveSettings();
            this.debouncedSearch();
        };

        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (e.shiftKey) this.replaceAll();
                    else this.performSearch();
                } else if (!e.shiftKey && e.target === this.findInput) {
                    e.preventDefault();
                    this.plugin.settings.findText = this.findInput.value;
                    this.plugin.saveSettings();
                    this.performSearch();
                }
            }
        };

        this.findInput.onkeydown = handleKeydown;
        this.replaceInput.onkeydown = handleKeydown;

        this.replaceInput.oninput = () => {
            this.plugin.settings.replaceText = this.replaceInput.value;
            this.plugin.saveSettings();
            this.updatePreviews();
        };
    }

    getAllFolders(): TFolder[] {
        const folders: TFolder[] = [];
        const root = this.app.vault.getRoot();
        // Add a synthetic "All" root
        folders.push(root);
        const walk = (folder: TFolder) => {
            for (const child of folder.children) {
                if (child instanceof TFolder) {
                    folders.push(child);
                    walk(child);
                }
            }
        };
        walk(root);
        return folders;
    }

    updateFolderScopeVisibility() {
        if (this.folderScopeEl) {
            this.folderScopeEl.style.display = this.plugin.settings.allFiles ? '' : 'none';
        }
    }

    createRegexFlagButtons() {
        this.caseButton = createFlagButton(
            this.regexFlagsContainer,
            'Match case',
            `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon uppercase-lowercase-a"><path d="M10.5 14L4.5 14"></path><path d="M12.5 18L7.5 6"></path><path d="M3 18L7.5 6"></path><path d="M15.9526 10.8322C15.9526 10.8322 16.6259 10 18.3832 10C20.1406 9.99999 20.9986 11.0587 20.9986 11.9682V16.7018C20.9986 17.1624 21.2815 17.7461 21.7151 18"></path><path d="M20.7151 13.5C18.7151 13.5 15.7151 14.2837 15.7151 16C15.7151 17.7163 17.5908 18.2909 18.7151 18C19.5635 17.7804 20.5265 17.3116 20.889 16.6199"></path></svg>`,
            !this.plugin.settings.caseInsensitive,
            (active) => {
                this.plugin.settings.caseInsensitive = !active;
                this.plugin.saveSettings();
                this.performSearch();
            }
        );

        this.wholeWordButton = createFlagButton(
            this.regexFlagsContainer,
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

    updateRegexFlagsVisibility() {
        if (this.plugin.settings.useRegEx) {
            this.wholeWordButton.style.display = 'flex';
        } else {
            this.wholeWordButton.style.display = 'none';
        }
    }

    updateUI() {
        const enabled = this.plugin.settings.replaceEnabled;
        const setDisabled = (el: HTMLElement & { disabled?: boolean }) => {
            el.disabled = !enabled;
            el.toggleClass('disabled', !enabled);
        };
        setDisabled(this.replaceInput);
        setDisabled(this.replaceAllBtn);
        setDisabled(this.selectAllBtn);
        setDisabled(this.deselectAllBtn);
        this.updateRegexFlagsVisibility();
        this.updateFolderScopeVisibility();
    }

    async performSearch() {
        this.matches = [];
        this.pendingReplacements.clear();
        this.matchesContainer.empty();
        this.fileContainers = new Map();
        this.matchCounts = new Map();

        const notFoundContainer = this.resultsContainer.querySelector('.not-found-words-container');
        if (notFoundContainer) notFoundContainer.remove();

        this.headerTextEl.setText('Searching…');
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

        this.currentSearchText = searchText;
        if (!this.plugin.settings.searchHistory) this.plugin.settings.searchHistory = [];
        if (!this.plugin.settings.searchHistory.includes(searchText)) {
            this.plugin.settings.searchHistory.unshift(searchText);
            if (this.plugin.settings.searchHistory.length > 10) this.plugin.settings.searchHistory.pop();
            this.plugin.saveSettings();
        }

        const { useRegEx, caseInsensitive, allFiles, wholeWord } = this.plugin.settings;

        const isPipeSearch = !useRegEx && searchText.includes('|');
        const searchWords = isPipeSearch ? searchText.split('|').map(w => w.trim()).filter(Boolean) : [];
        const foundWords = isPipeSearch ? new Set<string>() : null;
        
        const pipeRegExps = searchWords.length ? searchWords.map(w => {
            try { 
                return { word: w, re: new RegExp(w, this.plugin.settings.caseInsensitive ? 'i' : '') }; 
            } catch (_) { 
                console.warn(`Skipping invalid pipe pattern: ${w}`);
                return null;
            }
        }).filter((p): p is { word: string; re: RegExp } => p !== null) : null;
        
        const searchConfig: SearchConfig = {
            searchRegex: null,
            queryString: caseInsensitive ? searchText.toLowerCase() : searchText,
            isPipe: isPipeSearch,
            pipeRegExps
        };

        let searchRegex: RegExp | null = null;
        if (useRegEx) {
            try {
                searchRegex = buildRegex(searchText, { caseInsensitive, wholeWord });
                if (searchRegex.test('')) {
                    this.headerTextEl.setText('Pattern matches empty string — please refine');
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

        this.currentSearchRegex = searchRegex;
        searchConfig.searchRegex = searchRegex;

        let matchCount = 0;
        let limitReached = false;

        if (allFiles) {
            let files = this.app.vault.getMarkdownFiles();
            const scope = this.plugin.settings.folderScope;
            if (scope) {
                files = files.filter(f => f.path.startsWith(scope + '/'));
            }
            files.sort((a, b) => a.path.localeCompare(b.path));
            for (const file of files) {
                const fileMatchCount = await this.searchInFile(file, searchConfig, MAX_MATCHES - matchCount, foundWords);
                matchCount += fileMatchCount;
                if (matchCount >= MAX_MATCHES) { limitReached = true; break; }
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        } else {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                matchCount = await this.searchInFile(activeFile, searchConfig, MAX_MATCHES, foundWords);
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

        if (isPipeSearch && foundWords) this.displayNotFoundWords(searchWords, foundWords);
    }

    displayNotFoundWords(searchWords: string[], foundWords: Set<string>) {
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

    async searchInFile(file: TFile, searchConfig: SearchConfig, maxMatches = MAX_MATCHES, foundWords: Set<string> | null = null) {
        const content = await this.app.vault.read(file);
        const lines = content.split('\n');
        let fileMatchCount = 0;

        const ci = this.plugin.settings.caseInsensitive;
        const searchRegex = searchConfig.searchRegex;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            const srcLine = ci && !searchRegex ? line.toLowerCase() : line;
            
            const lineMatches = findAllMatchesInLine(srcLine, searchConfig, foundWords);

            for (const m of lineMatches) {
                if (this.matches.length >= maxMatches) return fileMatchCount;

                const matchVal = { start: m.start, end: m.end, text: line.substring(m.start, m.end) };
                this.matches.push({ file, lineNum, line, match: matchVal, id: `${file.path}-${lineNum}-${m.start}` });
                fileMatchCount++;

                this.maybeRenderInitialBatch();
            }

            if (this.matches.length >= maxMatches) break;
        }

        this.matchCounts.set(file.path, fileMatchCount);
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

    selectAll() {
        if (!this.plugin.settings.replaceEnabled) return;
        this.pendingReplacements.clear();
        this.matchesContainer.querySelectorAll('.match-checkbox').forEach(cb => { (cb as HTMLInputElement).checked = true; });
        this.updatePreviews();
    }

    deselectAll() {
        if (!this.plugin.settings.replaceEnabled) return;
        for (const m of this.matches) this.pendingReplacements.set(m.id, false);
        this.matchesContainer.querySelectorAll('.match-checkbox').forEach(cb => { (cb as HTMLInputElement).checked = false; });
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

    ensureFileContainer(file: TFile) {
        const key = file.path;
        if (this.fileContainers.has(key)) return this.fileContainers.get(key)!;
        const fileContainer = this.matchesContainer.createDiv('file-matches');
        const fileHeader = fileContainer.createDiv('file-header');
        fileHeader.createEl('span', { text: '▼ ', cls: 'collapse-icon' });
        fileHeader.createEl('span', { text: key, cls: 'file-path' });
        
        const count = this.matchCounts.get(key) || 0;
        fileHeader.createEl('span', { text: count.toString(), cls: 'match-count' });
        
        fileHeader.onclick = () => {
            fileContainer.toggleClass('collapsed', !fileContainer.hasClass('collapsed'));
        };
        
        this.fileContainers.set(key, fileContainer);
        return fileContainer;
    }

    renderMatchesSlice(start: number, end: number) {
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
            renderMatchPreview(previewEl, match, {
                replaceEnabled: this.plugin.settings.replaceEnabled,
                pendingReplacement: this.pendingReplacements.get(match.id) !== false,
                useRegEx: this.plugin.settings.useRegEx,
                searchRegex: this.currentSearchRegex,
                replaceText: this.replaceInput.value
            });

            matchEl.onclick = (e) => {
                if (!(e.target instanceof HTMLInputElement && e.target.classList.contains('match-checkbox'))) {
                    this.navigateToMatch(match);
                }
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
            requestAnimationFrame(() => {
                this.renderMatches({ append: false });
                this.updateHeader();
            });
        }
    }

    updateHeader(limitReached = false) {
        if (!this.headerTextEl) return;

        if (this.initialBatchRendered && (this.searchInProgress || this.renderedCount < this.matches.length)) {
            const bg = this.searchInProgress ? ' (searching…)' : '';
            this.headerTextEl.setText(`Showing ${this.renderedCount.toLocaleString()} of ${this.matches.length.toLocaleString()} matches${bg}`);
        } else {
            let text = `${this.matches.length} match${this.matches.length !== 1 ? 'es' : ''}`;
            if (limitReached) text += ` (limit ${MAX_MATCHES.toLocaleString()})`;
            this.headerTextEl.setText(text);
        }

        this.updateLoadMoreVisibility();
    }

    updatePreviews() {
        for (const match of this.matches) this.updatePreview(match);
    }

    updatePreview(match: FileMatch) {
        const matchEl = this.matchesContainer.querySelector(`[data-match-id="${match.id}"]`);
        if (!matchEl) return;
        const previewEl = matchEl.querySelector('.match-preview');
        if (!previewEl) return;
        previewEl.empty();
        renderMatchPreview(previewEl as HTMLElement, match, {
            replaceEnabled: this.plugin.settings.replaceEnabled,
            pendingReplacement: this.pendingReplacements.get(match.id) !== false,
            useRegEx: this.plugin.settings.useRegEx,
            searchRegex: this.currentSearchRegex,
            replaceText: this.replaceInput.value
        });
    }

    async navigateToMatch(match: FileMatch) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(match.file);

        const view = leaf.view;
        if (view instanceof MarkdownView) {
            const editor = view.editor;
            const from = { line: match.lineNum, ch: match.match.start };
            const to = { line: match.lineNum, ch: match.match.end };
            editor.setSelection(from, to);
            editor.scrollIntoView({ from, to }, true);
        }
    }

    // F5: Export matches to clipboard
    exportMatches() {
        if (!this.matches.length) {
            new Notice('No matches to export');
            return;
        }
        const lines = this.matches.map(m =>
            `${m.file.path}:${m.lineNum + 1}:${m.match.start}: ${m.match.text}`
        );
        navigator.clipboard.writeText(lines.join('\n')).then(() => {
            new Notice(`Copied ${this.matches.length} match${this.matches.length !== 1 ? 'es' : ''} to clipboard`);
        });
    }

    async replaceAll() {
        if (!this.plugin.settings.replaceEnabled || this.matches.length === 0) return;
        const replacements = this.matches.filter(m => this.pendingReplacements.get(m.id) !== false);
        if (!replacements.length) { new Notice('No replacements selected'); return; }
        await this.submitReplacements(replacements);
    }

    async submitReplacements(matches: FileMatch[]) {
        const replaceText = this.replaceInput.value;
        const findText = this.findInput.value;
        await this.plugin.performReplacements(matches, this.currentSearchRegex, replaceText, findText);
        this.showUndoBanner(matches.length);
        await this.performSearch();
    }

    // F9: Prominent undo banner after replacement
    showUndoBanner(count: number) {
        this.undoBanner.empty();
        this.undoBanner.style.display = '';
        this.undoBanner.createEl('span', { text: `✅ Replaced ${count} match${count !== 1 ? 'es' : ''}. `, cls: 'undo-banner-text' });
        const undoLink = this.undoBanner.createEl('button', { text: 'Undo', cls: 'undo-banner-btn' });
        undoLink.onclick = () => this.doUndo();

        // Auto-hide after 8 seconds
        setTimeout(() => {
            if (this.undoBanner) this.undoBanner.style.display = 'none';
        }, 8000);
    }

    async doUndo() {
        await this.plugin.undoLast();
        this.undoBanner.style.display = 'none';
        await this.performSearch();
    }
}
