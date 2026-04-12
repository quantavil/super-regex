import { Notice, TFile } from 'obsidian';
import { FileMatch, PAGE_SIZE } from '../types';
import { RegexFindReplaceView } from '../view';
import { renderMatchPreview, PreviewOptions } from '../ui';

export class MatchRenderer {
    constructor(private view: RegexFindReplaceView) {}

    private buildPreviewOptions(matchId: string): PreviewOptions {
        return {
            replaceEnabled: this.view.plugin.settings.replaceEnabled,
            pendingReplacement: this.view.isMatchSelected(matchId),
            isRegexMode: this.view.plugin.settings.searchMode !== 'text',
            searchRegex: this.view.currentSearchRegex,
            replaceText: this.view.replaceInput.value
        };
    }

    renderMatches({ append = false } = {}) {
        if (!this.view.matchesContainer) return;
        if (!append) {
            this.view.matchesContainer.empty();
            this.view.fileContainers.clear();
            this.view.matchCounts.clear();
            this.view.renderedCount = 0;
            this.view.initialBatchRendered = true;
        }

        const start = this.view.renderedCount;
        const end = Math.min(start + PAGE_SIZE, this.view.matches.length);
        
        this.renderMatchesSlice(start, end);
        this.view.renderedCount = end;
        this.view.updateLoadMoreVisibility();
    }

    renderMatchesSlice(start: number, end: number) {
        let currentFile: string | null = null;
        let fileContainer: HTMLElement | null = null;

        for (let i = start; i < end; i++) {
            const match = this.view.matches[i];
            
            if (match.file.path !== currentFile) {
                fileContainer = this.ensureFileContainer(match.file);
                currentFile = match.file.path;
            }

            if (!fileContainer) continue;

            const matchEl = fileContainer.createDiv('match-item');
            matchEl.dataset.matchId = match.id;

            // B1 fix: click-to-navigate (skip if clicking checkbox)
            matchEl.onclick = (e) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('match-checkbox') ||
                    target.classList.contains('match-apply-btn')) return;
                this.view.navigateToMatch(match);
            };

            if (this.view.plugin.settings.replaceEnabled) {
                const checkbox = matchEl.createEl('input', { type: 'checkbox', cls: 'match-checkbox' });
                checkbox.checked = this.view.isMatchSelected(match.id);
                checkbox.onchange = () => {
                    this.view.pendingReplacements.set(match.id, checkbox.checked);
                    const previewEl = matchEl.querySelector('.match-preview');
                    if (previewEl) {
                        previewEl.empty();
                        renderMatchPreview(previewEl as HTMLElement, match, this.buildPreviewOptions(match.id));
                    }
                };
            }

            const lineContainer = matchEl.createDiv('line-container');
            lineContainer.createEl('span', { text: `${match.lineNum + 1}:`, cls: 'line-number' });

            const previewEl = lineContainer.createDiv('match-preview');
            renderMatchPreview(previewEl, match, this.buildPreviewOptions(match.id));

            // U2: git-diff style inline apply arrow (visible on hover via CSS)
            if (this.view.plugin.settings.replaceEnabled) {
                const applyBtn = matchEl.createEl('button', {
                    cls: 'match-apply-btn',
                    attr: { 'aria-label': 'Apply this replacement', title: 'Apply this replacement' }
                });
                applyBtn.innerHTML = '&#x276F;'; // ❯ chevron
                applyBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.view.actionHandler.submitReplacements([match]);
                };
            }
        }
    }

    updatePreviews() {
        if (!this.view.matchesContainer) return;

        const matchMap = new Map<string, FileMatch>();
        for (const match of this.view.matches) {
            matchMap.set(match.id, match);
        }
        
        this.view.matchesContainer.querySelectorAll('.match-item').forEach((matchEl: Element) => {
            const id = (matchEl as HTMLElement).dataset.matchId;
            if (!id) return;
            const match = matchMap.get(id);
            if (!match) return;
            
            const previewEl = matchEl.querySelector('.match-preview');
            if (previewEl) {
                previewEl.empty();
                renderMatchPreview(previewEl as HTMLElement, match, this.buildPreviewOptions(match.id));
            }
        });
    }

    ensureFileContainer(file: TFile): HTMLElement {
        const key = file.path;
        if (this.view.fileContainers.has(key)) return this.view.fileContainers.get(key)!;

        // B2 fix: store a reference to the badge element so we can update counts later
        const fileContainer = this.view.matchesContainer.createDiv('file-matches');
        const fileHeader = fileContainer.createDiv('file-header');
        fileHeader.createEl('span', { text: '▼ ', cls: 'collapse-icon' });
        fileHeader.createEl('span', { text: key, cls: 'file-path' });
        const badge = fileHeader.createEl('span', { text: '…', cls: 'match-count' });
        badge.dataset.filePath = key;
        
        fileHeader.onclick = () => {
            fileContainer.toggleClass('collapsed', !fileContainer.hasClass('collapsed'));
        };
        
        this.view.fileContainers.set(key, fileContainer);
        return fileContainer;
    }

    /** B2 fix: call after search completes to set accurate badge counts */
    updateBadgeCounts() {
        const counts = new Map<string, number>();
        for (const m of this.view.matches) {
            counts.set(m.file.path, (counts.get(m.file.path) || 0) + 1);
        }
        this.view.matchesContainer.querySelectorAll('.match-count[data-file-path]').forEach((badge: Element) => {
            const path = (badge as HTMLElement).dataset.filePath!;
            const count = counts.get(path) || 0;
            badge.textContent = count.toString();
        });
    }

    displayNotFoundWords(searchWords: string[], foundWords: Set<string>) {
        const notFoundWords = searchWords.filter(w => !foundWords.has(w));
        let notFoundContainer = this.view.resultsContainer.querySelector('.not-found-words-container');

        if (notFoundWords.length > 0) {
            if (!notFoundContainer) {
                notFoundContainer = this.view.resultsContainer.createDiv('not-found-words-container');
                this.view.resultsContainer.insertBefore(notFoundContainer, this.view.matchesContainer);
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
}
