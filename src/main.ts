import { Plugin, Notice, TFile } from 'obsidian';
import { RegexFindReplaceSettingTab } from './settingsTab';
import { RegexFindReplaceView } from './view';
import { DEFAULT_SETTINGS, RegexFindReplaceSettings, VIEW_TYPE_REGEX_FIND_REPLACE, MatchOperation, MAX_HISTORY } from './types';
import { logger } from './utils';

export default class RegexFindReplacePlugin extends Plugin {
    settings!: RegexFindReplaceSettings;
    history: MatchOperation[] = [];

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
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE_REGEX_FIND_REPLACE, active: true });
            this.app.workspace.revealLeaf(this.app.workspace.getLeavesOfType(VIEW_TYPE_REGEX_FIND_REPLACE)[0]);
        }
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
            } catch (e: any) {
                logger('Error reverting file ' + ch.path + ': ' + e.message, 1);
            }
        }

        new Notice(`Reverted ${lastOp.count} replacement(s) in ${revertedFiles} file(s).`);
    }

    getReplacementText(matchText: string, searchRegex: RegExp | null, replaceText: string) {
        if (this.settings.useRegEx && searchRegex) {
            try {
                return matchText.replace(searchRegex, replaceText);
            } catch (_) {
                return matchText;
            }
        }
        return replaceText;
    }

    async performReplacements(matches: any[], searchRegex: RegExp | null, replaceText: string, findText: string) {
        const fileChanges = new Map<TFile, any[]>();
        const changes: any[] = [];
        let totalReplacements = 0;

        for (const m of matches) {
            if (!fileChanges.has(m.file)) fileChanges.set(m.file, []);
            fileChanges.get(m.file)!.push(m);
        }

        for (const [file, fileMatches] of fileChanges.entries()) {
            try {
                const original = await this.app.vault.read(file);
                const lines = original.split('\n');

                fileMatches.sort((a: any, b: any) => (a.lineNum !== b.lineNum) ? b.lineNum - a.lineNum : b.match.start - a.match.start);

                for (const m of fileMatches) {
                    const line = lines[m.lineNum];
                    let replacement = this.getReplacementText(m.match.text, searchRegex, replaceText);
                    
                    if (this.settings.processLineBreak) {
                        replacement = replacement.replace(/\\n/g, '\n');
                    }
                    if (this.settings.processTab) {
                        replacement = replacement.replace(/\\t/g, '\t');
                    }

                    lines[m.lineNum] = line.slice(0, m.match.start) + replacement + line.slice(m.match.end);
                    totalReplacements++;
                }

                const modified = lines.join('\n');
                if (modified !== original) {
                    await this.app.vault.modify(file, modified);
                    changes.push({ path: file.path, before: original, after: modified });
                }
            } catch (e: any) {
                console.error('Error processing file: ' + file.path + ' -> ' + e.message);
            }
        }

        if (totalReplacements > 0 && changes.length > 0) {
            const op: MatchOperation = {
                timestamp: Date.now(),
                scope: this.settings.allFiles ? 'vault' : 'document',
                count: totalReplacements,
                find: findText,
                replace: replaceText,
                useRegEx: this.settings.useRegEx,
                regexFlags: 'gm' + (this.settings.caseInsensitive ? 'i' : ''),
                changes
            };
            this.history.push(op);
            if (this.history.length > MAX_HISTORY) this.history.shift();
        }

        new Notice(`Replaced ${totalReplacements} match${totalReplacements !== 1 ? 'es' : ''} in ${changes.length} file${changes.length !== 1 ? 's' : ''}`);
    }
}
