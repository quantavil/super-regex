import { ItemView, WorkspaceLeaf, MarkdownView, FuzzySuggestModal, TFolder, App } from 'obsidian';
import type RegexFindReplacePlugin from './main';
import { VIEW_TYPE_REGEX_FIND_REPLACE, FileMatch, SearchMode, MAX_MATCHES } from './types';
import { debounce, pluralize, initAutoResize } from './utils';
import { createToggle, createFlagButton } from './ui';
import { ActionHandler } from './controllers/ActionHandler';
import { SearchController } from './controllers/SearchController';
import { MatchRenderer } from './ui/MatchRenderer';

class FolderSuggest extends FuzzySuggestModal<TFolder> {
    folders: TFolder[];
    onChoose: (folder: TFolder) => void;

    constructor(app: App, folders: TFolder[], onChoose: (folder: TFolder) => void) {
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
    pendingReplacements: Map<string, boolean>; // true = selected for replacement, false = deselected. Default for new matches: true.
    debouncedSearch: () => void;
    debouncedSaveSettings: () => void;
        renderedCount: number;
    fileContainers: Map<string, HTMLElement>;
    matchCounts: Map<string, number>;
    initialBatchRendered: boolean;
    searchInProgress: boolean;
    currentSearchRegex: RegExp | null = null;
    currentSearchText: string = '';
    findInput!: HTMLTextAreaElement;
    replaceInput!: HTMLTextAreaElement;
    replaceRow!: HTMLElement;
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
    undoBannerTimer: ReturnType<typeof setTimeout> | null = null;
    updatePillsUI?: () => void;
    aiBtn!: HTMLButtonElement;
    originalPrompt: string | null = null;

    actionHandler: ActionHandler;
    searchController: SearchController;
    matchRenderer: MatchRenderer;

    constructor(leaf: WorkspaceLeaf, plugin: RegexFindReplacePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.matches = [];
        this.pendingReplacements = new Map();
        this.debouncedSearch = debounce(() => this.searchController.performSearch(), 300);
        this.debouncedSaveSettings = debounce(() => this.plugin.saveSettings(), 500);
        this.actionHandler = new ActionHandler(this);
        this.searchController = new SearchController(this);
        this.matchRenderer = new MatchRenderer(this);

        this.renderedCount = 0;
        this.fileContainers = new Map();
        this.matchCounts = new Map();
        this.initialBatchRendered = false;
        this.searchInProgress = false;
    }

    getViewType(): string { return VIEW_TYPE_REGEX_FIND_REPLACE; }
    getDisplayText(): string { return "Find and replace"; }
    getIcon(): string { return "search"; }

    onOpen(): Promise<void> {
        // Obsidian ItemView: children[0] is the header bar, children[1] is the content container
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('regex-find-replace-view');

        this.createUI(container);
        this.updateUI();
        return Promise.resolve();
    }

    onClose(): Promise<void> {
        if (this.undoBannerTimer) {
            clearTimeout(this.undoBannerTimer);
            this.undoBannerTimer = null;
        }
        return Promise.resolve();
    }

    createUI(container: HTMLElement) {
        const searchSection = container.createDiv('search-section');

        // --- Find row ---
        const findContainer = searchSection.createDiv('input-container');
        findContainer.createEl('label', { text: 'Find:' });

        const findInputWrapper = findContainer.createDiv('find-input-wrapper');

        this.findInput = findInputWrapper.createEl('textarea', {
            placeholder: 'Search pattern…'
        });
        this.findInput.value = this.plugin.settings.findText;

        this.aiBtn = findInputWrapper.createEl('button', { text: '✨', title: 'Convert natural language to regex', cls: 'ai-generate-btn-inline' });
        this.aiBtn.onclick = () => this.toggleAiRegex();

        this.regexFlagsContainer = findInputWrapper.createDiv('regex-flags-container');
        this.createRegexFlagButtons();

        initAutoResize(this.findInput);

        // --- Replace row ---
        const replaceContainer = searchSection.createDiv('input-container');
        this.replaceRow = replaceContainer;
        replaceContainer.createEl('label', { text: 'Replace:' });

        const replaceInputWrapper = replaceContainer.createDiv('find-input-wrapper');
        this.replaceInput = replaceInputWrapper.createEl('textarea', {
            placeholder: 'Replace with…'
        });
        this.replaceInput.value = this.plugin.settings.replaceText;
        initAutoResize(this.replaceInput);

        // --- Options row ---
        const optionsContainer = searchSection.createDiv('options-container');

        // --- Mode switcher (Pill) ---
        const modeContainer = optionsContainer.createDiv('mode-pill-container');
        
        const textPill = modeContainer.createDiv('mode-pill');
        textPill.setText('Text');
        const regexPill = modeContainer.createDiv('mode-pill');
        regexPill.setText('Regex');

        const updatePills = () => {
            if (this.plugin.settings.searchMode === 'text') {
                textPill.classList.add('active');
                regexPill.classList.remove('active');
            } else {
                regexPill.classList.add('active');
                textPill.classList.remove('active');
            }
        };

        this.updatePillsUI = updatePills;

        const setMode = (mode: SearchMode) => {
            this.plugin.settings.searchMode = mode;
            void this.plugin.saveSettings();
            updatePills();
            this.updateRegexFlagsVisibility();
            void this.searchController.performSearch();
        };

        textPill.onclick = () => setMode('text');
        regexPill.onclick = () => setMode('regex');
        updatePills();

        createToggle(optionsContainer, 'All files', this.plugin.settings.allFiles, (value) => {
            this.plugin.settings.allFiles = value;
            void this.plugin.saveSettings();
            this.updateFolderScopeVisibility();
            void this.searchController.performSearch();
        });

        createToggle(optionsContainer, 'Replace', this.plugin.settings.replaceEnabled, (value) => {
            this.plugin.settings.replaceEnabled = value;
            void this.plugin.saveSettings();
            this.updateUI();
        });

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
                void this.plugin.saveSettings();
                folderLabel.textContent = path ? `📁 ${path}` : '📁 All';
                void this.searchController.performSearch();
            });
            modal.open();
        };
        this.updateFolderScopeVisibility();

        const buttonContainer = searchSection.createDiv('button-container');

        this.replaceAllBtn = buttonContainer.createEl('button', { text: 'Replace checked', cls: 'mod-cta' });
        this.replaceAllBtn.title = 'Replace checked (Ctrl+Shift+Enter)';
        this.replaceAllBtn.onclick = () => this.actionHandler.replaceAll();

        this.selectAllBtn = buttonContainer.createEl('button', { text: 'Select all', cls: 'mod-muted' });
        this.selectAllBtn.onclick = () => this.selectAll();

        this.deselectAllBtn = buttonContainer.createEl('button', { text: 'Deselect all', cls: 'mod-muted' });
        this.deselectAllBtn.onclick = () => this.deselectAll();

        this.undoBtn = buttonContainer.createEl('button', { text: 'Undo', cls: 'mod-muted' });
        this.undoBtn.onclick = () => this.actionHandler.doUndo();

        this.undoBanner = searchSection.createDiv('undo-banner');
        this.undoBanner.setCssProps({ display: 'none' });

        this.resultsContainer = container.createDiv('results-section');
        this.resultsHeader = this.resultsContainer.createDiv('results-header');

        this.headerTextEl = this.resultsHeader.createEl('span', { cls: 'results-header-text' });

        const exportBtn = this.resultsHeader.createEl('button', {
            cls: 'results-header-export',
            title: 'Copy all matches to clipboard'
        });
        exportBtn.textContent = '📋';
        exportBtn.onclick = () => this.actionHandler.exportMatches();

        this.loadMoreLink = this.resultsHeader.createEl('a', {
            text: 'Load more',
            href: '#',
            cls: 'results-header-load-more'
        });
        this.loadMoreLink.onclick = (e) => { e.preventDefault(); this.loadMore(); };

        this.matchesContainer = this.resultsContainer.createDiv('matches-container');
        this.updateLoadMoreVisibility();

        this.findInput.oninput = () => {
            this.plugin.settings.findText = this.findInput.value;
            this.debouncedSaveSettings();
            this.debouncedSearch();
        };

        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (e.shiftKey || e.target === this.replaceInput) void this.actionHandler.replaceAll();
                    else void this.searchController.performSearch();
                } else if (!e.shiftKey && e.target === this.findInput) {
                    e.preventDefault();
                    this.plugin.settings.findText = this.findInput.value;
                    void this.plugin.saveSettings();
                    void this.searchController.performSearch();
                }
            }
        };

        this.findInput.onkeydown = handleKeydown;
        this.replaceInput.onkeydown = handleKeydown;

        this.replaceInput.oninput = () => {
            this.plugin.settings.replaceText = this.replaceInput.value;
            this.debouncedSaveSettings();
            this.matchRenderer.updatePreviews();
        };
    }

    getAllFolders(): TFolder[] {
        const folders: TFolder[] = [];
        const root = this.app.vault.getRoot();
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
            this.folderScopeEl.setCssProps({ display: this.plugin.settings.allFiles ? '' : 'none' });
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
                void this.plugin.saveSettings();
                void this.searchController.performSearch();
            }
        );

        this.wholeWordButton = createFlagButton(
            this.regexFlagsContainer,
            'Whole word',
            `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="11" y2="15"/></svg>`,
            this.plugin.settings.wholeWord,
            (active) => {
                this.plugin.settings.wholeWord = active;
                void this.plugin.saveSettings();
                void this.searchController.performSearch();
            }
        );

        this.updateRegexFlagsVisibility();
    }

    updateRegexFlagsVisibility() {
        if (this.plugin.settings.searchMode !== 'text') {
            this.wholeWordButton.setCssProps({ display: 'flex' });
            if (this.aiBtn) this.aiBtn.setCssProps({ display: 'block' });
        } else {
            this.wholeWordButton.setCssProps({ display: 'none' });
            if (this.aiBtn) this.aiBtn.setCssProps({ display: 'none' });
        }
    }

    updateUI() {
        const enabled = this.plugin.settings.replaceEnabled;
        if (this.replaceRow) this.replaceRow.setCssProps({ display: enabled ? '' : 'none' });
        if (this.replaceAllBtn) this.replaceAllBtn.setCssProps({ display: enabled ? '' : 'none' });
        if (this.selectAllBtn) this.selectAllBtn.setCssProps({ display: enabled ? '' : 'none' });
        if (this.deselectAllBtn) this.deselectAllBtn.setCssProps({ display: enabled ? '' : 'none' });
        this.updateRegexFlagsVisibility();
        this.updateFolderScopeVisibility();
    }

    async toggleAiRegex() {
        if (this.originalPrompt !== null) {
            // Revert off
            this.findInput.value = this.originalPrompt;
            this.plugin.settings.findText = this.originalPrompt;
            this.originalPrompt = null;
            this.aiBtn.classList.remove('active');
            void this.plugin.saveSettings();
            await this.searchController.performSearch();
            return;
        }

        let prompt = this.findInput.value || '';
        prompt = prompt.trim();
        if (!prompt) return;

        this.originalPrompt = prompt;
        this.aiBtn.classList.add('active');
        this.headerTextEl.setText('Generating regex via AI ✨...');
        this.searchInProgress = true;
        this.updateLoadMoreVisibility();
        this.matchesContainer.empty();
        
        try {
            const { generateRegex } = await import('./ai');
            const result = await generateRegex(prompt, this.plugin.settings);
            
            this.findInput.value = result;
            this.plugin.settings.findText = result;
            this.plugin.settings.searchMode = 'regex';
            void this.plugin.saveSettings();
            
            this.updatePillsUI?.();
            this.updateRegexFlagsVisibility();
            
            this.searchInProgress = false; // Allow search to proceed and update header
            await this.searchController.performSearch();
            
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            this.searchInProgress = false;
            this.originalPrompt = null;
            this.aiBtn.classList.remove('active');
            this.headerTextEl.setText(`AI Error: ${message}`);
            this.updateLoadMoreVisibility();
        }
    }

    isMatchSelected(id: string): boolean {
        return this.pendingReplacements.get(id) !== false;
    }



    selectAll() {
        if (!this.plugin.settings.replaceEnabled) return;
        this.pendingReplacements.clear();
        this.matchesContainer.querySelectorAll('.match-checkbox').forEach(cb => { (cb as HTMLInputElement).checked = true; });
        this.matches.forEach(m => this.pendingReplacements.set(m.id, true));
        this.matchRenderer.updatePreviews();
    }

    deselectAll() {
        if (!this.plugin.settings.replaceEnabled) return;
        this.matchesContainer.querySelectorAll('.match-checkbox').forEach(cb => { (cb as HTMLInputElement).checked = false; });
        this.matches.forEach(m => this.pendingReplacements.set(m.id, false));
        this.matchRenderer.updatePreviews();
    }

    loadMore() {
        this.matchRenderer.renderMatches({ append: true });
    }

    updateLoadMoreVisibility() {
        if (this.loadMoreLink) {
            this.loadMoreLink.setCssProps({ display: (this.renderedCount < this.matches.length) ? '' : 'none' });
        }
    }

    updateHeader(limitReached = false) {
        if (this.matches.length === 0) {
            this.headerTextEl.empty();
            const icon = this.headerTextEl.createSpan();
            icon.setCssProps({ opacity: '0.6', fontSize: '1.1em', verticalAlign: 'middle', marginRight: '4px' });
            icon.textContent = '🔍';
            const text = this.headerTextEl.createSpan();
            text.setCssProps({ opacity: '0.8' });
            text.textContent = 'No matches found';
        } else {
            const countStr = limitReached ? `${MAX_MATCHES}+` : `${this.matches.length}`;
            this.headerTextEl.setText(`Found ${countStr} ${this.matches.length !== 1 ? 'matches' : 'match'}`);
        }
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

    showUndoBanner(count: number) {
        this.undoBanner.empty();
        this.undoBanner.setCssProps({ display: '' });
        this.undoBanner.createEl('span', { text: `${pluralize('match', count)} replaced. `, cls: 'undo-banner-text' });
        const undoLink = this.undoBanner.createEl('button', { text: 'Undo', cls: 'undo-banner-btn' });
        undoLink.onclick = () => this.actionHandler.doUndo();

        if (this.undoBannerTimer) clearTimeout(this.undoBannerTimer);

        // Auto-hide after 8 seconds
        this.undoBannerTimer = setTimeout(() => {
            if (this.undoBanner) this.undoBanner.setCssProps({ display: 'none' });
            this.undoBannerTimer = null;
        }, 8000);
    }
}
