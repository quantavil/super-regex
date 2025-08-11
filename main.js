/*
Provides a dialog to find and replace text in the currently opened note. 
In addition to Obsidians on-board find/repace function, this plugin provides options to
use regular expressions or just plain text replace found occurances in the currently slected text or in the whole document

Now also supports:
- Search scope toggle: current file or all Markdown files in the vault
- Undo/Revert last operation (across files)
*/

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
    allFiles: false // new: default scope is current file
};

const MAX_HISTORY = 10; // keep last 10 operations

// logThreshold: 0 ... only error messages
//               9 ... verbose output
const logThreshold = 9;
const logger = (logString, logLevel = 0) => { if (logLevel <= logThreshold)
    console.log('RegexFiRe: ' + logString); };

class RegexFindReplacePlugin extends obsidian.Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            logger('Loading Plugin...', 9);
            this.history = []; // store undo information in memory
            yield this.loadSettings();
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
                name: 'Regex Find/Replace: Revert last operation',
                callback: () => __awaiter(this, void 0, void 0, function* () {
                    yield this.undoLast();
                })
            });
        });
    }
    onunload() {
        logger('Bye!', 9);
        this.history = [];
    }
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            logger('Loading Settings...', 6);
            this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
            logger('   findVal:         ' + this.settings.findText, 6);
            logger('   replaceText:     ' + this.settings.replaceText, 6);
            logger('   caseInsensitive: ' + this.settings.caseInsensitive, 6);
            logger('   processLineBreak: ' + this.settings.processLineBreak, 6);
            logger('   allFiles:        ' + this.settings.allFiles, 6);
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
                logger('Undo requested but history is empty', 6);
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
                    else {
                        logger('Could not find file to revert: ' + ch.path, 2);
                    }
                }
                catch (e) {
                    logger('Error reverting file ' + ch.path + ': ' + e.message, 1);
                }
            }
            new obsidian.Notice(`Reverted ${lastOp.count} replacement(s) in ${revertedFiles} file(s).`);
        });
    }
}
class FindAndReplaceModal extends obsidian.Modal {
    constructor(app, editor, settings, plugin) {
        super(app);
        this.editor = editor;
        this.settings = settings;
        this.plugin = plugin;
    }
    onOpen() {
        const { contentEl, titleEl, editor, modalEl } = this;
        modalEl.addClass('find-replace-modal');
        titleEl.setText('Regex Find/Replace');
        const rowClass = 'row';
        const divClass = 'div';
        const noSelection = editor.getSelection() === '';
        let regexFlags = 'gm';
        if (this.settings.caseInsensitive)
            regexFlags = regexFlags.concat('i');
        logger('No text selected?: ' + noSelection, 9);
        const addTextComponent = (label, placeholder, postfix = '') => {
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
            contentEl.append(containerEl);
            return [component, labelEl2];
        };
        const addToggleComponent = (label, tooltip, hide = false) => {
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
            if (!hide)
                contentEl.appendChild(containerEl);
            return component;
        };
        // Create input fields
        const findRow = addTextComponent('Find:', 'e.g. (.*)', '/' + regexFlags);
        const findInputComponent = findRow[0];
        const findRegexFlags = findRow[1];
        const replaceRow = addTextComponent('Replace:', 'e.g. $1', this.settings.processLineBreak ? '\\n=LF' : '');
        const replaceWithInputComponent = replaceRow[0];
        // Create and show regular expression toggle switch
        const regToggleComponent = addToggleComponent('Use regular expressions', 'If enabled, regular expressions in the find field are processed as such, and regex groups might be addressed in the replace field');
        // Create scope toggle: current file vs all files
        const scopeToggleComponent = addToggleComponent('Search in all files', 'If enabled, replaces in all Markdown files in the vault');
        // Update regex-flags label if regular expressions are enabled or disabled
        regToggleComponent.onChange(regNew => {
            if (regNew) {
                findRegexFlags.setText('/' + regexFlags);
            }
            else {
                findRegexFlags.setText('');
            }
        });
        // Create and show selection toggle switch only if any text is selected
        const selToggleComponent = addToggleComponent('Replace only in selection', 'If enabled, replaces only occurances in the currently selected text', noSelection);
        // Keep selection toggle mutually exclusive with "all files"
        scopeToggleComponent.onChange(val => {
            if (val) {
                selToggleComponent.setValue(false);
                if (typeof selToggleComponent.setDisabled === 'function') {
                    selToggleComponent.setDisabled(true);
                }
            }
            else {
                if (typeof selToggleComponent.setDisabled === 'function') {
                    selToggleComponent.setDisabled(noSelection);
                }
            }
        });
        // Create Buttons
        const buttonContainerEl = document.createElement(divClass);
        buttonContainerEl.addClass(rowClass);
        const submitButtonTarget = document.createElement(divClass);
        submitButtonTarget.addClass('button-wrapper');
        submitButtonTarget.addClass(rowClass);
        const undoButtonTarget = document.createElement(divClass);
        undoButtonTarget.addClass('button-wrapper');
        undoButtonTarget.addClass(rowClass);
        const cancelButtonTarget = document.createElement(divClass);
        cancelButtonTarget.addClass('button-wrapper');
        cancelButtonTarget.addClass(rowClass);
        const submitButtonComponent = new obsidian.ButtonComponent(submitButtonTarget);
        const undoButtonComponent = new obsidian.ButtonComponent(undoButtonTarget);
        const cancelButtonComponent = new obsidian.ButtonComponent(cancelButtonTarget);
        cancelButtonComponent.setButtonText('Cancel');
        cancelButtonComponent.onClick(() => {
            logger('Action cancelled.', 8);
            this.close();
        });
        submitButtonComponent.setButtonText('Replace All');
        submitButtonComponent.setCta();
        submitButtonComponent.onClick(() => __awaiter(this, void 0, void 0, function* () {
            let resultString = 'No match';
            const searchString = findInputComponent.getValue();
            let replaceString = replaceWithInputComponent.getValue();
            if (searchString === '') {
                new obsidian.Notice('Nothing to search for!');
                return;
            }
            // Replace control sequences in replace-field if enabled
            if (this.settings.processLineBreak) {
                logger('Replacing linebreaks in replace-field', 9);
                replaceString = replaceString.replace(/\\n/gm, '\n');
            }
            if (this.settings.processTab) {
                logger('Replacing tabs in replace-field', 9);
                replaceString = replaceString.replace(/\\t/gm, '\t');
            }
            const useRegex = regToggleComponent.getValue();
            const allFiles = scopeToggleComponent.getValue();
            const selectionOnly = !allFiles && selToggleComponent.getValue();
            let totalReplacements = 0;
            let changes = [];
            let scopeText = 'in current file';
            let searchRegex = null;
            if (useRegex) {
                try {
                    searchRegex = new RegExp(searchString, regexFlags);
                }
                catch (e) {
                    logger('Invalid regex: ' + e.message, 1);
                    new obsidian.Notice('Invalid regular expression. Check your pattern.');
                    return;
                }
            }
            if (allFiles) {
                logger('SCOPE: All files in vault', 8);
                scopeText = 'across vault';
                const files = this.app.vault.getMarkdownFiles();
                for (const file of files) {
                    try {
                        const original = yield this.app.vault.read(file);
                        let count = 0;
                        let updated = original;
                        if (useRegex) {
                            const hit = original.match(searchRegex);
                            if (hit && hit.length > 0) {
                                count = hit.length;
                                updated = original.replace(searchRegex, replaceString);
                            }
                        }
                        else {
                            const parts = original.split(searchString);
                            count = parts.length - 1;
                            if (count > 0) {
                                updated = parts.join(replaceString);
                            }
                        }
                        if (count > 0 && updated !== original) {
                            yield this.app.vault.modify(file, updated);
                            totalReplacements += count;
                            changes.push({ path: file.path, before: original, after: updated });
                            logger(`   Modified ${file.path} (${count} repl.)`, 9);
                        }
                    }
                    catch (e) {
                        logger('Error processing file: ' + file.path + ' -> ' + e.message, 1);
                    }
                }
            }
            else {
                const activeFile = this.app.workspace.getActiveFile();
                const docBefore = editor.getValue();
                if (useRegex) {
                    logger('USING regex with flags: ' + regexFlags, 8);
                    if (selectionOnly) {
                        logger('   SCOPE: Selection', 9);
                        const selectedText = editor.getSelection();
                        const rresult = selectedText.match(searchRegex);
                        if (rresult) {
                            editor.replaceSelection(selectedText.replace(searchRegex, replaceString));
                            totalReplacements = rresult.length;
                            scopeText = 'in selection';
                        }
                    }
                    else {
                        logger('   SCOPE: Full document', 9);
                        const rresult = docBefore.match(searchRegex);
                        if (rresult) {
                            editor.setValue(docBefore.replace(searchRegex, replaceString));
                            totalReplacements = rresult.length;
                            scopeText = 'in current file';
                        }
                    }
                }
                else {
                    logger('NOT using regex', 8);
                    if (selectionOnly) {
                        logger('   SCOPE: Selection', 9);
                        const selectedText = editor.getSelection();
                        const selectedSplit = selectedText.split(searchString);
                        const nrOfHits = selectedSplit.length - 1;
                        if (nrOfHits > 0) {
                            editor.replaceSelection(selectedSplit.join(replaceString));
                            totalReplacements = nrOfHits;
                            scopeText = 'in selection';
                        }
                    }
                    else {
                        logger('   SCOPE: Full document', 9);
                        const documentSplit = docBefore.split(searchString);
                        const nrOfHits = documentSplit.length - 1;
                        if (nrOfHits > 0) {
                            editor.setValue(documentSplit.join(replaceString));
                            totalReplacements = nrOfHits;
                            scopeText = 'in current file';
                        }
                    }
                }
                // Capture after and record change for undo
                const docAfter = editor.getValue();
                if (totalReplacements > 0 && activeFile) {
                    changes.push({ path: activeFile.path, before: docBefore, after: docAfter });
                }
            }
            // Compose result string
            resultString = totalReplacements > 0
                ? `Made ${totalReplacements} replacement(s) ${scopeText}`
                : 'No match';
            // Save settings (find/replace text and toggle switch states)
            this.settings.findText = searchString;
            this.settings.replaceText = replaceString;
            this.settings.useRegEx = useRegex;
            this.settings.selOnly = selectionOnly;
            this.settings.allFiles = allFiles;
            this.plugin.saveData(this.settings);
            // Save to history for undo
            if (totalReplacements > 0 && changes.length > 0) {
                const op = {
                    timestamp: Date.now(),
                    scope: allFiles ? 'vault' : (selectionOnly ? 'selection' : 'document'),
                    count: totalReplacements,
                    find: searchString,
                    replace: replaceString,
                    useRegEx: useRegex,
                    regexFlags: regexFlags,
                    changes
                };
                this.plugin.history.push(op);
                if (this.plugin.history.length > MAX_HISTORY) {
                    this.plugin.history.shift();
                }
                logger(`Saved operation to history. Total operations: ${this.plugin.history.length}`, 8);
            }
            this.close();
            new obsidian.Notice(resultString);
        }));
        undoButtonComponent.setButtonText('Undo last');
        if (!this.plugin.history || this.plugin.history.length === 0) {
            if (typeof undoButtonComponent.setDisabled === 'function')
                undoButtonComponent.setDisabled(true);
        }
        undoButtonComponent.onClick(() => __awaiter(this, void 0, void 0, function* () {
            yield this.plugin.undoLast();
            this.close();
        }));
        // Apply settings
        regToggleComponent.setValue(this.settings.useRegEx);
        scopeToggleComponent.setValue(this.settings.allFiles);
        selToggleComponent.setValue(this.settings.selOnly);
        if (this.settings.allFiles && typeof selToggleComponent.setDisabled === 'function') {
            selToggleComponent.setDisabled(true);
        }
        replaceWithInputComponent.setValue(this.settings.replaceText);
        // Check if the prefill find option is enabled and the selection does not contain linebreaks
        if (this.settings.prefillFind && editor.getSelection().indexOf('\n') < 0 && !noSelection) {
            logger('Found selection without linebreaks and option is enabled -> fill', 9);
            findInputComponent.setValue(editor.getSelection());
            selToggleComponent.setValue(false);
        }
        else {
            logger('Restore find text', 9);
            findInputComponent.setValue(this.settings.findText);
        }
        // Add button row to dialog
        buttonContainerEl.appendChild(submitButtonTarget);
        buttonContainerEl.appendChild(undoButtonTarget);
        buttonContainerEl.appendChild(cancelButtonTarget);
        contentEl.appendChild(buttonContainerEl);
        // If no text is selected, disable selection-toggle-switch
        if (noSelection) {
            selToggleComponent.setValue(false);
            if (typeof selToggleComponent.setDisabled === 'function') {
                selToggleComponent.setDisabled(true);
            }
        }
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
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
            .setDesc('When using regular expressions, apply the \'/i\' modifier for case insensitive search)')
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
            .setName('Prefill Find Field')
            .setDesc('Copy the currently selected text (if any) into the \'Find\' text field. This setting is only applied if the selection does not contain linebreaks')
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