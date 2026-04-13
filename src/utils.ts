export enum LogLevel {
    DEBUG = 0,
    INFO = 5,
    WARN = 8,
    ERROR = 10
}

export const logThreshold = LogLevel.INFO;

export const logger = (msg: string, lvl: LogLevel = LogLevel.DEBUG) => { 
    if (lvl >= logThreshold) {
        if (lvl >= LogLevel.ERROR) console.error('RegexFiRe:', msg);
        else console.debug('RegexFiRe:', msg);
    }
};

export const debounce = <T extends (...args: unknown[]) => void>(fn: T, delay: number = 300) => {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
};

export const buildFlags = (caseInsensitive?: boolean): string => 'gm' + (caseInsensitive ? 'i' : '');

export const buildRegex = (pattern: string, options: { caseInsensitive?: boolean, wholeWord?: boolean } = {}) => {
  const flags = buildFlags(options.caseInsensitive);
  let patt = pattern;
  if (options.wholeWord) patt = `\\b(?:${patt})\\b`;
  return new RegExp(patt, flags);
};

export const getReplacementText = (isRegex: boolean, matchText: string, searchRegex: RegExp | null, replaceText: string) => {
    if (isRegex && searchRegex) {
        try {
            return matchText.replace(searchRegex, replaceText);
        } catch {
            return matchText;
        }
    }
    return replaceText;
};

export function escapeRegex(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const pluralize = (word: string, count: number): string =>
    `${count} ${word}${count !== 1 ? (word.endsWith('ch') || word.endsWith('s') || word.endsWith('x') ? 'es' : 's') : ''}`;

export function initAutoResize(el: HTMLTextAreaElement) {
    const resize = () => { el.setCssProps({ height: 'auto' }); el.setCssProps({ height: el.scrollHeight + 'px' }); };
    el.addEventListener('input', resize);
    setTimeout(resize, 0);
}
