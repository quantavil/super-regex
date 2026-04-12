export enum LogLevel {
    DEBUG = 0,
    INFO = 5,
    WARN = 8,
    ERROR = 10
}

export const logThreshold = LogLevel.INFO;

export const logger = (msg: string, lvl: LogLevel = LogLevel.DEBUG) => { 
    if (lvl >= logThreshold) console.log('RegexFiRe:', msg); 
};

export const debounce = <T extends (...args: any[]) => void>(fn: T, delay: number = 300) => {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
};

export const buildRegex = (pattern: string, options: { caseInsensitive?: boolean, wholeWord?: boolean } = {}) => {
  const flags = 'gm' + (options.caseInsensitive ? 'i' : '');
  let patt = pattern;
  if (options.wholeWord) patt = `\\b(?:${patt})\\b`;
  return new RegExp(patt, flags);
};

export const getReplacementText = (isRegex: boolean, matchText: string, searchRegex: RegExp | null, replaceText: string) => {
    if (isRegex && searchRegex) {
        try {
            return matchText.replace(searchRegex, replaceText);
        } catch (_) {
            return matchText;
        }
    }
    return replaceText;
};
