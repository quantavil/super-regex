import { TFile } from 'obsidian';
import { RegexFindReplaceView } from '../view';
import { SearchConfig, findAllMatchesInLine } from '../search';
import { PAGE_SIZE, MAX_MATCHES, FileMatch } from '../types';
import { buildRegex, escapeRegex, logger, LogLevel } from '../utils';

export class SearchController {
    constructor(private view: RegexFindReplaceView) {}

    async performSearch() {
        if (this.view.searchInProgress) return;
        
        this.view.matches = [];
        this.view.pendingReplacements.clear();
        this.view.matchesContainer.empty();
        this.view.initialBatchRendered = false;
        this.view.renderedCount = 0;
        this.view.searchInProgress = true;

        const searchText = this.view.findInput.value || '';
        if (!searchText.trim()) {
            this.view.headerTextEl.setText('Enter a search pattern');
            this.view.searchInProgress = false;
            this.view.updateLoadMoreVisibility();
            return;
        }

        this.view.currentSearchText = searchText;

        const { searchMode, caseInsensitive, allFiles, wholeWord } = this.view.plugin.settings;
        const isTextMode = searchMode === 'text';

        const isPipeSearch = isTextMode && searchText.includes('|');
        const searchWords = isPipeSearch ? searchText.split('|').map(w => w.trim()).filter(Boolean) : [];
        const foundWords = isPipeSearch ? new Set<string>() : null;
        
        const pipeRegExps = searchWords.length ? searchWords.map(w => {
            try { 
                const safeWord = escapeRegex(w);
                return { word: w, re: new RegExp(safeWord, caseInsensitive ? 'i' : '') }; 
            } catch { 
                logger(`Skipping invalid pipe pattern: ${w}`, LogLevel.WARN);
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
        if (!isTextMode) {
            try {
                const pat = searchText;
                searchRegex = buildRegex(pat, { caseInsensitive, wholeWord });
                if (searchRegex.test('')) {
                    this.view.headerTextEl.setText('Pattern matches empty string — please refine');
                    this.view.searchInProgress = false;
                    this.view.updateLoadMoreVisibility();
                    return;
                }
            } catch {
                this.view.headerTextEl.setText('Invalid regular expression');
                this.view.searchInProgress = false;
                this.view.updateLoadMoreVisibility();
                return;
            }
        }

        this.view.currentSearchRegex = searchRegex;
        searchConfig.searchRegex = searchRegex;

        let matchCount = 0;
        let limitReached = false;

        if (allFiles) {
            let files = this.view.app.vault.getMarkdownFiles();
            const scope = this.view.plugin.settings.folderScope;
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
            const activeFile = this.view.app.workspace.getActiveFile();
            if (activeFile) {
                matchCount = await this.searchInFile(activeFile, searchConfig, MAX_MATCHES, foundWords);
                if (matchCount >= MAX_MATCHES) limitReached = true;
            }
        }

        if (!this.view.initialBatchRendered) {
            this.view.matchRenderer.renderMatches({ append: false });
        } else {
            this.view.updateLoadMoreVisibility();
        }

        this.view.searchInProgress = false;
        this.view.updateHeader(limitReached);
        this.view.matchRenderer.updateBadgeCounts();

        if (isPipeSearch && foundWords) this.view.matchRenderer.displayNotFoundWords(searchWords, foundWords);
    }

    async searchInFile(file: TFile, searchConfig: SearchConfig, maxMatches = MAX_MATCHES, foundWords: Set<string> | null = null) {
        const content = await this.view.app.vault.read(file);
        const lines = content.split('\n');
        let fileMatchCount = 0;

        const ci = this.view.plugin.settings.caseInsensitive;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            const srcLine = ci ? line.toLowerCase() : line;
            
            const lineMatches = findAllMatchesInLine(srcLine, searchConfig, foundWords);
            for (const m of lineMatches) {
                if (fileMatchCount >= maxMatches) break;
                
                const matchVal = { start: m.start, end: m.end, text: line.substring(m.start, m.end) };
                const id = `${file.path}:${lineNum}:${matchVal.start}`;
                const fileMatch: FileMatch = {
                    id, file, lineNum, line, match: matchVal
                };
                
                this.view.matches.push(fileMatch);
                if (this.view.plugin.settings.replaceEnabled && !this.view.pendingReplacements.has(id)) {
                    this.view.pendingReplacements.set(id, true);
                }
                fileMatchCount++;
                
                if (this.view.matches.length >= PAGE_SIZE && !this.view.initialBatchRendered) {
                    this.view.matchRenderer.renderMatches({ append: false });
                }
            }
            if (fileMatchCount >= maxMatches) break;
        }

        return fileMatchCount;
    }
}
