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
    searchScope: 'current',
    maxUndoHistory: 10
};

const logThreshold = 9;
const logger = (logString, logLevel = 0) => { if (logLevel <= logThreshold) console.log('RegexFiRe: ' + logString); };

// Undo History Management
class UndoHistory {
    constructor(maxSize = 10) {
        this.history = [];
        this.maxSize = maxSize;
    }

    add(operation) {
        this.history.unshift(operation);
        if (this.history.length > this.maxSize) {
            this.history.pop();
        }
    }

    getLastOperation() {
        return this.history[0];
    }

    removeLastOperation() {
        return this.history.shift();
    }

    clear() {
        this.history = [];
    }

    isEmpty() {
        return this.history.length === 0;
    }
}

// Match Finder Class
class MatchFinder {
    constructor(app) {
        this.app = app;
    }

    findMatches(searchString, useRegex, regexFlags, searchAllFiles, currentFile) {
        return __awaiter(this, void 0, void 0, function* () {
            const matches = [];
            const files = searchAllFiles ? 
                this.app.vault.getMarkdownFiles() : 
                (currentFile ? [currentFile] : []);

            for (const file of files) {
                const content = yield this.app.vault.read(file);
                const fileMatches = this.findMatchesInContent(content, searchString, useRegex, regexFlags);
                
                fileMatches.forEach(match => {
                    matches.push({
                        file: file,
                        content: content,
                        line: match.line,
                        ch: match.ch,
                        matchText: match.text,
                        skip: false
                    });
                });
            }

            return matches;
        });
    }

    findMatchesInContent(content, searchString, useRegex, regexFlags) {
        const matches = [];
        const lines = content.split('\n');

        if (useRegex) {
            lines.forEach((line, lineIndex) => {
                let match;
                const lineRegex = new RegExp(searchString, regexFlags);
                while ((match = lineRegex.exec(line)) !== null) {
                    matches.push({
                        line: lineIndex,
                        ch: match.index,
                        text: match[0]
                    });
                    if (!regexFlags.includes('g')) break;
                }
            });
        } else {
            lines.forEach((line, lineIndex) => {
                let index = 0;
                while ((index = line.indexOf(searchString, index)) !== -1) {
                    matches.push({
                        line: lineIndex,
                        ch: index,
                        text: searchString
                    });
                    index += searchString.length;
                }
            });
        }

        return matches;
    }
}

// Preview Pane Class
class MatchPreviewPane {
    constructor(containerEl, plugin) {
        this.containerEl = containerEl;
        this.plugin = plugin;
        this.matches = [];
        this.currentMatchIndex = 0;
    }

    render(matches, searchString, replaceString, useRegex, regexFlags) {
        this.matches = matches;
        this.containerEl.empty();
        
        if (matches.length === 0) {
            this.containerEl.createEl('div', { 
                text: 'No matches found', 
                cls: 'no-matches-message' 
            });
            return;
        }

        // Create preview header
        const header = this.containerEl.createDiv('preview-header');
        header.createEl('h4', { text: `Found ${matches.length} matches` });
        
        // Create preview controls
        const controls = header.createDiv('preview-controls');
        const prevBtn = new obsidian.ButtonComponent(controls)
            .setButtonText('← Previous')
            .onClick(() => this.navigateMatch(-1));
        
        this.matchCounter = controls.createSpan('match-counter');
        this.updateMatchCounter();
        
        const nextBtn = new obsidian.ButtonComponent(controls)
            .setButtonText('Next →')
            .onClick(() => this.navigateMatch(1));

        if (matches.length === 1) {
            prevBtn.setDisabled(true);
            nextBtn.setDisabled(true);
        }
        
        // Create preview content area
        const previewContent = this.containerEl.createDiv('preview-content');
        
        matches.forEach((match, index) => {
            const matchEl = previewContent.createDiv({
                cls: 'match-item',
                attr: { 'data-index': index }
            });
            
            // File name header
            const fileHeader = matchEl.createDiv('match-file-header');
            fileHeader.createEl('span', { 
                text: match.file.path,
                cls: 'match-file-path'
            });
            
            // Match context with diff view
            const contextEl = matchEl.createDiv('match-context');
            this.renderMatchContext(contextEl, match, searchString, replaceString, useRegex, regexFlags);
            
            // Action buttons for batch operations
            if (replaceString !== undefined) {
                const actions = matchEl.createDiv('match-actions');
                
                match.skipBtn = new obsidian.ButtonComponent(actions)
                    .setButtonText('Skip')
                    .onClick(() => {
                        match.skip = true;
                        matchEl.addClass('skipped');
                        match.skipBtn.setDisabled(true);
                        match.approveBtn.setDisabled(false);
                        this.updateApprovedCount();
                    });
                
                match.approveBtn = new obsidian.ButtonComponent(actions)
                    .setButtonText('Replace')
                    .setCta()
                    .onClick(() => {
                        match.skip = false;
                        matchEl.removeClass('skipped');
                        match.skipBtn.setDisabled(false);
                        match.approveBtn.setDisabled(true);
                        this.updateApprovedCount();
                    });

                // Set initial state
                if (!match.skip) {
                    match.approveBtn.setDisabled(true);
                }
            }
            
            // Click to navigate to file
            contextEl.addEventListener('click', () => {
                this.navigateToMatch(match);
            });
        });
        
        this.highlightCurrentMatch();
        this.updateApprovedCount();
    }

    renderMatchContext(containerEl, match, searchString, replaceString, useRegex, regexFlags) {
        const lines = match.content.split('\n');
        const startLine = Math.max(0, match.line - 2);
        const endLine = Math.min(lines.length, match.line + 3);
        
        for (let i = startLine; i < endLine; i++) {
            const lineEl = containerEl.createDiv({
                cls: 'context-line',
                attr: { 'data-line': i + 1 }
            });
            
            lineEl.createSpan('context-line-number').setText(`${i + 1}: `);
            
            if (i === match.line) {
                lineEl.addClass('match-line');
                
                // Show diff if replace is enabled
                if (replaceString !== undefined) {
                    const lineContent = lineEl.createDiv('line-content');
                    
                    // Original line
                    const originalLine = lineContent.createDiv('diff-line diff-removed');
                    originalLine.createSpan('diff-marker').setText('- ');
                    this.highlightText(originalLine, lines[i], searchString, useRegex, regexFlags, 'match-highlight-removed');
                    
                    // Replaced line
                    const replacedLine = lineContent.createDiv('diff-line diff-added');
                    replacedLine.createSpan('diff-marker').setText('+ ');
                    const replacedText = this.getReplacedText(lines[i], searchString, replaceString, useRegex, regexFlags);
                    replacedLine.createSpan().setText(replacedText);
                } else {
                    // Just highlight matches
                    const lineContent = lineEl.createDiv('line-content');
                    this.highlightText(lineContent, lines[i], searchString, useRegex, regexFlags, 'match-highlight');
                }
            } else {
                lineEl.createSpan('line-text').setText(lines[i]);
            }
        }
    }

    highlightText(containerEl, text, pattern, useRegex, regexFlags, highlightClass) {
        if (!pattern) {
            containerEl.createSpan().setText(text);
            return;
        }

        if (useRegex) {
            try {
                const regex = new RegExp(pattern, regexFlags);
                let lastIndex = 0;
                let match;
                
                while ((match = regex.exec(text)) !== null) {
                    if (match.index > lastIndex) {
                        containerEl.createSpan().setText(text.substring(lastIndex, match.index));
                    }
                    containerEl.createSpan({ cls: highlightClass }).setText(match[0]);
                    lastIndex = match.index + match[0].length;
                    
                    if (!regexFlags.includes('g')) break;
                }
                
                if (lastIndex < text.length) {
                    containerEl.createSpan().setText(text.substring(lastIndex));
                }
            } catch (e) {
                containerEl.createSpan().setText(text);
            }
        } else {
            const parts = text.split(pattern);
            parts.forEach((part, index) => {
                containerEl.createSpan().setText(part);
                if (index < parts.length - 1) {
                    containerEl.createSpan({ cls: highlightClass }).setText(pattern);
                }
            });
        }
    }

    getReplacedText(text, searchString, replaceString, useRegex, regexFlags) {
        if (useRegex) {
            try {
                return text.replace(new RegExp(searchString, regexFlags), replaceString);
            } catch (e) {
                return text;
            }
        } else {
            return text.split(searchString).join(replaceString);
        }
    }

    navigateMatch(direction) {
        this.currentMatchIndex = (this.currentMatchIndex + direction + this.matches.length) % this.matches.length;
        this.highlightCurrentMatch();
        this.scrollToCurrentMatch();
        this.updateMatchCounter();
    }

    updateMatchCounter() {
        if (this.matchCounter && this.matches.length > 0) {
            this.matchCounter.setText(`${this.currentMatchIndex + 1} / ${this.matches.length}`);
        }
    }

    updateApprovedCount() {
        const approved = this.getApprovedMatches().length;
        const total = this.matches.length;
        const header = this.containerEl.querySelector('h4');
        if (header) {
            header.setText(`Found ${total} matches (${approved} to replace)`);
        }
    }

    highlightCurrentMatch() {
        this.containerEl.querySelectorAll('.match-item').forEach((el, index) => {
            el.classList.toggle('current-match', index === this.currentMatchIndex);
        });
    }

    scrollToCurrentMatch() {
        const currentEl = this.containerEl.querySelector(`[data-index="${this.currentMatchIndex}"]`);
        if (currentEl) {
            currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    navigateToMatch(match) {
        return __awaiter(this, void 0, void 0, function* () {
            const leaf = this.plugin.app.workspace.getLeaf(false);
            yield leaf.openFile(match.file);
            
            const view = leaf.view;
            if (view && view.editor) {
                const editor = view.editor;
                editor.setCursor({ line: match.line, ch: match.ch });
                editor.scrollIntoView({ from: { line: match.line, ch: 0 }, to: { line: match.line, ch: 0 } }, true);
                
                // Highlight the match temporarily
                const from = { line: match.line, ch: match.ch };
                const to = { line: match.line, ch: match.ch + match.matchText.length };
                editor.setSelection(from, to);
            }
        });
    }

    getApprovedMatches() {
        return this.matches.filter(match => !match.skip);
    }
}

// Main Plugin Class
class RegexFindReplacePlugin extends obsidian.Plugin {
    constructor() {
        super(...arguments);
        this.undoHistory = new UndoHistory();
    }

    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            logger('Loading Plugin...', 9);
            yield this.loadSettings();
            this.undoHistory.maxSize = this.settings.maxUndoHistory;
            
            this.addSettingTab(new RegexFindReplaceSettingTab(this.app, this));
            
            this.addCommand({
                id: 'obsidian-regex-replace',
                name: 'Find and Replace using regular expressions',
                editorCallback: (editor) => {
                    new FindAndReplaceModal(this.app, editor, this.settings, this).open();
                },
            });

            this.addCommand({
                id: 'obsidian-regex-replace-undo',
                name: 'Undo last find and replace operation',
                callback: () => {
                    this.undoLastOperation();
                },
            });
        });
    }

    onunload() {
        logger('Bye!', 9);
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

    undoLastOperation() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.undoHistory.isEmpty()) {
                new obsidian.Notice('No operations to undo');
                return;
            }

            const lastOp = this.undoHistory.removeLastOperation();
            let successCount = 0;
                for (const fileOp of lastOp.fileOperations) {
                try {
                    const file = this.app.vault.getAbstractFileByPath(fileOp.path);
                    if (file instanceof obsidian.TFile) {
                        yield this.app.vault.modify(file, fileOp.originalContent);
                        successCount++;
                    }
                } catch (e) {
                    console.error(`Failed to undo changes in ${fileOp.path}:`, e);
                }
            }

            new obsidian.Notice(`Reverted ${successCount} file(s)`);
        });
    }
}

// Main Modal Class
class FindAndReplaceModal extends obsidian.Modal {
    constructor(app, editor, settings, plugin) {
        super(app);
        this.editor = editor;
        this.settings = settings;
        this.plugin = plugin;
        this.matchFinder = new MatchFinder(app);
        this.previewPane = null;
        this.isSearchOnly = false;
        this.liveSearchTimeout = null;
        this.currentMatches = [];
    }

    onOpen() {
        const { contentEl, titleEl, editor, modalEl } = this;
        modalEl.addClass('find-replace-modal-enhanced');
        titleEl.setText('Advanced Find/Replace');

        // Create main container with split view
        const mainContainer = contentEl.createDiv('main-container');
        const controlsContainer = mainContainer.createDiv('controls-container');
        const previewContainer = mainContainer.createDiv('preview-container');
        
        this.previewPane = new MatchPreviewPane(previewContainer, this.plugin);

        const rowClass = 'row';
        const divClass = 'div';
        const noSelection = editor.getSelection() === '';
        let regexFlags = 'gm';
        if (this.settings.caseInsensitive) regexFlags = regexFlags.concat('i');

        // Helper function to add text components
        const addTextComponent = (container, label, placeholder, postfix = '') => {
            const containerEl = document.createElement(divClass);
            containerEl.addClass(rowClass);
            const targetEl = document.createElement(divClass);
            targetEl.addClass('input-wrapper');
            const labelEl = document.createElement(divClass);
            labelEl.addClass('input-label');
            labelEl.setText(label);
            const labelEl2 = document.createElement(divClass);
            labelEl2.addClass('postfix-label');
            labelEl2.setText(postfix);
            containerEl.appendChild(labelEl);
            containerEl.appendChild(targetEl);
            containerEl.appendChild(labelEl2);
            const component = new obsidian.TextComponent(targetEl);
            component.setPlaceholder(placeholder);
            container.append(containerEl);
            return [component, labelEl2, containerEl];
        };

        // Helper function to add toggle components
        const addToggleComponent = (container, label, tooltip, hide = false) => {
            const containerEl = document.createElement(divClass);
            containerEl.addClass(rowClass);
            const targetEl = document.createElement(divClass);
            targetEl.addClass(rowClass);
            const component = new obsidian.ToggleComponent(targetEl);
            component.setTooltip(tooltip);
            const labelEl = document.createElement(divClass);
            labelEl.addClass('check-label');
            labelEl.setText(label);
            containerEl.appendChild(labelEl);
            containerEl.appendChild(targetEl);
            if (!hide) container.appendChild(containerEl);
            return [component, containerEl];
        };

        // Create input fields
        const findRow = addTextComponent(controlsContainer, 'Find:', 'e.g. (.*)', '/' + regexFlags);
        const findInputComponent = findRow[0];
        const findRegexFlags = findRow[1];

        // Add search-only toggle
        const [searchOnlyToggle, searchOnlyContainer] = addToggleComponent(
            controlsContainer,
            'Search only mode',
            'Disable replace functionality and only search for matches'
        );

        // Replace field container
        const replaceContainer = document.createElement(divClass);
        replaceContainer.addClass('replace-container');
        controlsContainer.appendChild(replaceContainer);
        
        const replaceRow = addTextComponent(replaceContainer, 'Replace:', 'e.g. $1', this.settings.processLineBreak ? '\\n=LF' : '');
        const replaceWithInputComponent = replaceRow[0];
        const replaceRowEl = replaceRow[2];

        // Toggle replace field visibility
        searchOnlyToggle.onChange(value => {
            this.isSearchOnly = value;
            replaceContainer.style.display = value ? 'none' : 'block';
            this.updateButtonText();
            this.performLiveSearch();
        });

        // Create toggle components
        const [regToggleComponent] = addToggleComponent(
            controlsContainer,
            'Use regular expressions',
            'If enabled, regular expressions in the find field are processed as such'
        );

        const [scopeToggleComponent] = addToggleComponent(
            controlsContainer,
            'Search all files',
            'If enabled, search and replace in all vault files instead of just the current file'
        );

        const [selToggleComponent, selToggleContainer] = addToggleComponent(
            controlsContainer,
            'Replace only in selection',
            'If enabled, replaces only occurances in the currently selected text',
            noSelection
        );

        // Live search functionality
        const performLiveSearch = () => {
            clearTimeout(this.liveSearchTimeout);
            this.liveSearchTimeout = setTimeout(() => {
                this.performLiveSearch();
            }, 300);
        };

        findInputComponent.inputEl.addEventListener('input', performLiveSearch);
        replaceWithInputComponent.inputEl.addEventListener('input', performLiveSearch);

        // Update UI based on toggles
        regToggleComponent.onChange(regNew => {
            findRegexFlags.setText(regNew ? '/' + regexFlags : '');
            this.performLiveSearch();
        });

        scopeToggleComponent.onChange(value => {
            if (value) {
                selToggleContainer.style.display = 'none';
                selToggleComponent.setValue(false);
            } else {
                selToggleContainer.style.display = 'flex';
            }
            this.performLiveSearch();
        });

        selToggleComponent.onChange(() => this.performLiveSearch());

        // Create Buttons
        const buttonContainerEl = document.createElement(divClass);
        buttonContainerEl.addClass('button-row');
        
        this.cancelButton = new obsidian.ButtonComponent(buttonContainerEl)
            .setButtonText('Cancel')
            .onClick(() => {
                this.close();
            });

        this.submitButton = new obsidian.ButtonComponent(buttonContainerEl)
            .setButtonText('Replace All')
            .setCta()
            .onClick(() => this.performReplace());

        controlsContainer.appendChild(buttonContainerEl);

        // Store references for live search
        this.findInput = findInputComponent;
        this.replaceInput = replaceWithInputComponent;
        this.regexToggle = regToggleComponent;
        this.scopeToggle = scopeToggleComponent;
        this.selToggle = selToggleComponent;
        this.regexFlags = regexFlags;

        // Apply settings
        regToggleComponent.setValue(this.settings.useRegEx);
        scopeToggleComponent.setValue(this.settings.searchScope === 'all');
        selToggleComponent.setValue(this.settings.selOnly);
        replaceWithInputComponent.setValue(this.settings.replaceText);
        
        // Check if the prefill find option is enabled
        if (this.settings.prefillFind && editor.getSelection().indexOf('\n') < 0 && !noSelection) {
            findInputComponent.setValue(editor.getSelection());
            selToggleComponent.setValue(false);
        } else {
            findInputComponent.setValue(this.settings.findText);
        }

        // If no text is selected, disable selection-toggle-switch
        if (noSelection) {
            selToggleComponent.setValue(false);
        }

        // Perform initial search
        this.performLiveSearch();
    }

    performLiveSearch() {
        return __awaiter(this, void 0, void 0, function* () {
            const searchString = this.findInput.getValue();
            if (!searchString) {
                this.previewPane.render([], '', undefined, false, '');
                this.updateButtonText();
                return;
            }

            const currentFile = this.app.workspace.getActiveFile();
            const searchAllFiles = this.scopeToggle.getValue();
            const useRegex = this.regexToggle.getValue();
            const replaceString = this.isSearchOnly ? undefined : this.replaceInput.getValue();

            try {
                const matches = yield this.matchFinder.findMatches(
                    searchString,
                    useRegex,
                    this.regexFlags,
                    searchAllFiles,
                    currentFile
                );

                this.currentMatches = matches;
                this.previewPane.render(matches, searchString, replaceString, useRegex, this.regexFlags);
                this.updateButtonText();
            } catch (e) {
                console.error('Search error:', e);
                this.previewPane.render([], '', undefined, false, '');
            }
        });
    }

    updateButtonText() {
        if (this.isSearchOnly) {
            this.submitButton.setButtonText('Close');
            this.submitButton.removeCta();
        } else {
            const approvedCount = this.previewPane ? this.previewPane.getApprovedMatches().length : 0;
            this.submitButton.setButtonText(`Replace ${approvedCount} Match${approvedCount !== 1 ? 'es' : ''}`);
            this.submitButton.setCta();
        }
    }

    performReplace() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isSearchOnly) {
                this.close();
                return;
            }

            const searchString = this.findInput.getValue();
            let replaceString = this.replaceInput.getValue();

            if (!searchString) {
                new obsidian.Notice('Nothing to search for!');
                return;
            }

            // Process line breaks and tabs
            if (this.settings.processLineBreak) {
                replaceString = replaceString.replace(/\\n/gm, '\n');
            }
            if (this.settings.processTab) {
                replaceString = replaceString.replace(/\\t/gm, '\t');
            }

            const approvedMatches = this.previewPane.getApprovedMatches();
            if (approvedMatches.length === 0) {
                new obsidian.Notice('No matches selected for replacement');
                return;
            }

            // Group matches by file
            const matchesByFile = new Map();
            approvedMatches.forEach(match => {
                if (!matchesByFile.has(match.file.path)) {
                    matchesByFile.set(match.file.path, []);
                }
                matchesByFile.get(match.file.path).push(match);
            });

            // Perform replacements
            const fileOperations = [];
            let totalReplacements = 0;

            for (const [filePath, fileMatches] of matchesByFile) {
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (!(file instanceof obsidian.TFile)) continue;

                const originalContent = yield this.app.vault.read(file);
                let newContent = originalContent;

                // Sort matches by position (reverse order to maintain positions)
                fileMatches.sort((a, b) => {
                    if (a.line !== b.line) return b.line - a.line;
                    return b.ch - a.ch;
                });

                // Apply replacements
                const lines = newContent.split('\n');
                fileMatches.forEach(match => {
                    if (match.line < lines.length) {
                        const line = lines[match.line];
                        if (this.regexToggle.getValue()) {
                            const regex = new RegExp(searchString, this.regexFlags.replace('g', ''));
                            lines[match.line] = line.substring(0, match.ch) + 
                                line.substring(match.ch).replace(regex, replaceString);
                        } else {
                            lines[match.line] = line.substring(0, match.ch) + 
                                replaceString + 
                                line.substring(match.ch + searchString.length);
                        }
                        totalReplacements++;
                    }
                });

                newContent = lines.join('\n');
                yield this.app.vault.modify(file, newContent);

                fileOperations.push({
                    path: filePath,
                    originalContent: originalContent
                });
            }

            // Add to undo history
            if (fileOperations.length > 0) {
                this.plugin.undoHistory.add({
                    timestamp: new Date(),
                    fileOperations: fileOperations
                });
            }

            // Save settings
            this.settings.findText = searchString;
            this.settings.replaceText = replaceString;
            this.settings.useRegEx = this.regexToggle.getValue();
            this.settings.selOnly = this.selToggle.getValue();
            this.settings.searchScope = this.scopeToggle.getValue() ? 'all' : 'current';
            yield this.plugin.saveSettings();

            this.close();
            new obsidian.Notice(`Replaced ${totalReplacements} match${totalReplacements !== 1 ? 'es' : ''} in ${fileOperations.length} file${fileOperations.length !== 1 ? 's' : ''}`);
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        if (this.liveSearchTimeout) {
            clearTimeout(this.liveSearchTimeout);
        }
    }
}

// Settings Tab
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
            .setDesc('When using regular expressions, apply the \'/i\' modifier for case insensitive search')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.caseInsensitive)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
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
                    this.plugin.settings.processLineBreak = value;
                    yield this.plugin.saveSettings();
                })));

        new obsidian.Setting(containerEl)
            .setName('Process \\t as tab')
            .setDesc('When \'\\t\' is used in the replace field, a \'tab\' will be inserted accordingly')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.processTab)
                .onChange((value) => __awaiter(this, void 0, void 0,function* () {
                    this.plugin.settings.processTab = value;
                    yield this.plugin.saveSettings();
                })));

        new obsidian.Setting(containerEl)
            .setName('Prefill Find Field')
            .setDesc('Copy the currently selected text (if any) into the \'Find\' text field. This setting is only applied if the selection does not contain linebreaks')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.prefillFind)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.prefillFind = value;
                    yield this.plugin.saveSettings();
                })));

        containerEl.createEl('h4', { text: 'History Settings' });
        
        new obsidian.Setting(containerEl)
            .setName('Maximum Undo History')
            .setDesc('Maximum number of operations to keep in undo history')
            .addText(text => text
                .setPlaceholder('10')
                .setValue(String(this.plugin.settings.maxUndoHistory))
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.maxUndoHistory = num;
                        this.plugin.undoHistory.maxSize = num;
                        yield this.plugin.saveSettings();
                    }
                })));

        new obsidian.Setting(containerEl)
            .setName('Clear Undo History')
            .setDesc('Remove all stored undo operations')
            .addButton(button => button
                .setButtonText('Clear History')
                .onClick(() => {
                    this.plugin.undoHistory.clear();
                    new obsidian.Notice('Undo history cleared');
                }));
    }
}

module.exports = RegexFindReplacePlugin;