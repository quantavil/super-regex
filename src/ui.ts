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
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    const svg = doc.querySelector('svg');
    if (svg) button.appendChild(svg);
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
    isRegexMode: boolean;
    searchRegex: RegExp | null;
    replaceText: string;
}

export function renderMatchPreview(container: HTMLElement, match: FileMatch, options: PreviewOptions) {
    const line = match.line;
    const { start, end, text } = match.match;

    const contextStart = Math.max(0, start - 40);
    const contextEnd = Math.min(line.length, end + 40);

    const showReplacement = options.replaceEnabled && options.pendingReplacement;
    const replacement = showReplacement
        ? getReplacementText(options.isRegexMode, text, options.searchRegex, options.replaceText)
        : null;
    const hasChange = replacement !== null && replacement !== text;

    if (contextStart > 0) container.createEl('span', { text: '…', cls: 'ellipsis' });

    container.createEl('span', { text: line.substring(contextStart, start), cls: 'context' });

    // Original match text — strikethrough if being replaced
    container.createEl('span', {
        text,
        cls: hasChange ? 'match-highlight has-replacement' : 'match-highlight'
    });

    // Inline replacement right after the struck-through match
    if (hasChange) {
        container.createEl('span', { text: replacement!, cls: 'replacement-inline' });
    }

    container.createEl('span', { text: line.substring(end, contextEnd), cls: 'context' });
    if (contextEnd < line.length) container.createEl('span', { text: '…', cls: 'ellipsis' });
}

