import { MatchLocation } from './types';

export interface SearchConfig {
    searchRegex: RegExp | null;
    queryString: string;
    isPipe: boolean;
    pipeRegExps: { word: string, re: RegExp }[] | null;
}

export const findAllMatchesInLine = (line: string, config: SearchConfig, foundWords: Set<string> | null): MatchLocation[] => {
    const lineMatches: MatchLocation[] = [];

    if (config.searchRegex) {
        config.searchRegex.lastIndex = 0;
        let match;
        while ((match = config.searchRegex.exec(line)) !== null) {
            lineMatches.push({ start: match.index, end: match.index + match[0].length, text: match[0] });

            if (foundWords && config.isPipe && config.pipeRegExps) {
                for (let i = 0; i < config.pipeRegExps.length; i++) {
                    if (config.pipeRegExps[i].re.test(match[0])) {
                        foundWords.add(config.pipeRegExps[i].word);
                    }
                }
            }
        }
    } else {
        const query = config.queryString;
        if (!query) return lineMatches;
        
        let index = 0;
        while ((index = line.indexOf(query, index)) !== -1) {
            lineMatches.push({ start: index, end: index + query.length, text: query });
            index += query.length;
        }
    }

    return lineMatches;
};
