import { Notice } from 'obsidian';
import { RegexFindReplaceView } from '../view';
import { FileMatch } from '../types';

export class ActionHandler {
    constructor(private view: RegexFindReplaceView) {}

    async replaceAll() {
        if (!this.view.plugin.settings.replaceEnabled || this.view.matches.length === 0) return;
        const replacements = this.view.matches.filter(m => this.view.pendingReplacements.get(m.id) !== false);
        if (!replacements.length) { new Notice('No replacements selected'); return; }
        await this.submitReplacements(replacements);
    }

    async submitReplacements(matches: FileMatch[]) {
        const replaceText = this.view.replaceInput.value;
        await this.view.plugin.performReplacements(matches, this.view.currentSearchRegex, replaceText);
        this.view.showUndoBanner(matches.length);
        await this.view.performSearch();
    }

    async doUndo() {
        await this.view.plugin.undoLast();
        await this.view.performSearch();
    }

    exportMatches() {
        if (!this.view.matches.length) {
            new Notice('No matches to export');
            return;
        }

        const report = this.view.matches.map(m => `[${m.file.path}:${m.lineNum + 1}] ${m.match.text}`).join('\n');
        navigator.clipboard.writeText(report).then(() => {
            new Notice(`Copied ${this.view.matches.length} matches to clipboard`);
        }).catch(err => {
            new Notice('Failed to copy to clipboard');
            console.error(err);
        });
    }
}
