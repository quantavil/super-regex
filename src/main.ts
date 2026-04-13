import { Plugin, Notice, TFile, MarkdownView } from 'obsidian';
import { RegexFindReplaceSettingTab } from './settingsTab';
import { RegexFindReplaceView } from './view';
import { DEFAULT_SETTINGS, RegexFindReplaceSettings, VIEW_TYPE_REGEX_FIND_REPLACE, MatchOperation, MAX_HISTORY, FileMatch, FileChange } from './types';
import { logger, getReplacementText, buildFlags, pluralize, LogLevel } from './utils';

export default class RegexFindReplacePlugin extends Plugin {
    settings!: RegexFindReplaceSettings;
    history: MatchOperation[] = [];

    async onload() {
        logger('Loading Plugin...', LogLevel.INFO);
        await this.loadSettings();

        this.registerView(VIEW_TYPE_REGEX_FIND_REPLACE, (leaf) => new RegexFindReplaceView(leaf, this));
        this.addSettingTab(new RegexFindReplaceSettingTab(this.app, this));

        this.addRibbonIcon("search", "Open regex find & replace", () => this.activateView());

        this.addCommand({
            id: 'open-regex-find-replace',
            name: 'Open find and replace panel',
            callback: () => this.activateView()
        });

        this.addCommand({
            id: 'obsidian-regex-replace-undo',
            name: 'Regex find/replace: revert last operation',
            callback: async () => await this.undoLast()
        });
    }

    onunload() {
        logger('Bye!', LogLevel.INFO);
    }

    async activateView() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_REGEX_FIND_REPLACE);
        if (leaves.length > 0) {
            await this.app.workspace.revealLeaf(leaves[0]);
            return;
        }
        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE_REGEX_FIND_REPLACE, active: true });
            await this.app.workspace.revealLeaf(leaf);
        }
    }

    async loadSettings() {
        logger('Loading Settings...', LogLevel.DEBUG);
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

        logger(`Reverting last operation from ${new Date(lastOp.timestamp).toLocaleString()}`, LogLevel.DEBUG);

        let revertedFiles = 0;
        for (const ch of lastOp.changes) {
            try {
                const af = this.app.vault.getAbstractFileByPath(ch.path);
                if (af && af instanceof TFile) {
                    await this.app.vault.modify(af, ch.before);
                    revertedFiles++;
                    logger('Reverted file: ' + ch.path, LogLevel.DEBUG);
                }
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                logger('Error reverting file ' + ch.path + ': ' + message, LogLevel.ERROR);
            }
        }

        new Notice(`Reverted ${pluralize('replacement', lastOp.count)} in ${pluralize('file', revertedFiles)}.`);
    }

    getHistoryCharCount(): number {
        return this.history.reduce((acc, op) => acc + op.changes.reduce((sum, ch) => sum + ch.before.length + ch.after.length, 0), 0);
    }

    async performReplacements(matches: FileMatch[], searchRegex: RegExp | null, replaceText: string) {
        const fileChanges = new Map<TFile, FileMatch[]>();
        const changes: FileChange[] = [];
        let totalReplacements = 0;

        for (const m of matches) {
            if (!fileChanges.has(m.file)) fileChanges.set(m.file, []);
            fileChanges.get(m.file)!.push(m);
        }

        const activeFile = this.app.workspace.getActiveFile();
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = activeView?.editor;

        for (const [file, fileMatches] of fileChanges.entries()) {
            try {
                fileMatches.sort((a, b) => (a.lineNum !== b.lineNum) ? b.lineNum - a.lineNum : b.match.start - a.match.start);
                
                const isRegex = this.settings.searchMode !== 'text';
                const ops = fileMatches.map(m => ({
                    m,
                    replacement: getReplacementText(isRegex, m.match.text, searchRegex, replaceText)
                }));

                if (file === activeFile && editor) {
                    // C1: Use Editor API for active file
                    const original = await this.app.vault.read(file);
                    
                    editor.transaction({
                        changes: ops.map(({ m, replacement }) => ({
                            from: { line: m.lineNum, ch: m.match.start },
                            to: { line: m.lineNum, ch: m.match.end },
                            text: replacement
                        }))
                    });
                    
                    const modified = editor.getValue();
                    if (modified !== original) {
                        changes.push({ path: file.path, before: original, after: modified });
                    }
                    totalReplacements += fileMatches.length;
                    
                } else {
                    const original = await this.app.vault.read(file);
                    const lines = original.split('\n');

                    for (const { m, replacement } of ops) {
                        const line = lines[m.lineNum];
                        lines[m.lineNum] = line.slice(0, m.match.start) + replacement + line.slice(m.match.end);
                        totalReplacements++;
                    }

                    const modified = lines.join('\n');
                    if (modified !== original) {
                        await this.app.vault.modify(file, modified);
                        changes.push({ path: file.path, before: original, after: modified });
                    }
                }
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                logger('Error processing file: ' + file.path + ' -> ' + message, LogLevel.ERROR);
            }
        }

        if (totalReplacements > 0 && changes.length > 0) {
            const op: MatchOperation = {
                timestamp: Date.now(),
                scope: this.settings.allFiles ? 'vault' : 'document',
                count: totalReplacements,
                find: this.settings.findText,
                replace: replaceText,
                searchMode: this.settings.searchMode,
                regexFlags: buildFlags(this.settings.caseInsensitive),
                changes
            };
            this.history.push(op);
            while (this.history.length > MAX_HISTORY || this.getHistoryCharCount() > 10000000) {
                if (this.history.length <= 1) break; // retain at least 1 history item
                this.history.shift();
            }
        }

        new Notice(`Replaced ${pluralize('match', totalReplacements)} in ${pluralize('file', changes.length)}`);    }
}
