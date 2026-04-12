export const logThreshold = 9;

export const logger = (msg: string, lvl: number = 0) => { 
    if (lvl <= logThreshold) console.log('RegexFiRe:', msg); 
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

export const getReplacementText = (useRegEx: boolean, matchText: string, searchRegex: RegExp | null, replaceText: string) => {
    if (useRegEx && searchRegex) {
        try {
            return matchText.replace(searchRegex, replaceText);
        } catch (_) {
            return matchText;
        }
    }
    return replaceText;
};
