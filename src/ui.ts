import { ToggleComponent } from 'obsidian';
import { FileMatch } from './types';
import { getReplacementText } from './utils';

export function createToggle(container: HTMLElement, label: string, value: boolean, onChange: (value: boolean) => void): ToggleComponent {
    const toggleContainer = container.createDiv('toggle-container');
    const toggle = new ToggleComponent(toggleContainer);
    toggle.setValue(value);
    toggle.onChange(onChange);
    toggleContainer.createEl('label', { text: label });
    return toggle;
}

export function createFlagButton(container: HTMLElement, label: string, svgContent: string, initialActive: boolean, onChange: (active: boolean) => void): HTMLButtonElement {
    const button = container.createEl('button', {
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

export interface PreviewOptions {
    replaceEnabled: boolean;
    pendingReplacement: boolean;
    useRegEx: boolean;
    searchRegex: RegExp | null;
    replaceText: string;
}

export function renderMatchPreview(container: HTMLElement, match: FileMatch, options: PreviewOptions) {
    const line = match.line;
    const { start, end, text } = match.match;

    const contextStart = Math.max(0, start - 30);
    const contextEnd = Math.min(line.length, end + 30);

    if (contextStart > 0) container.createEl('span', { text: '...', cls: 'ellipsis' });

    container.createEl('span', { text: line.substring(contextStart, start), cls: 'context' });

    const highlightEl = container.createEl('span', { text, cls: 'match-highlight' });

    if (options.replaceEnabled && options.pendingReplacement) {
        const replacement = getReplacementText(options.useRegEx, text, options.searchRegex, options.replaceText);
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
