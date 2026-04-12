export interface RegexFindReplaceSettings {
    findText: string;
    replaceText: string;
    useRegEx: boolean;
    caseInsensitive: boolean;
    processLineBreak: boolean;
    processTab: boolean;
    prefillFind: boolean;
    allFiles: boolean;
    replaceEnabled: boolean;
    wholeWord: boolean;
}

export const DEFAULT_SETTINGS: RegexFindReplaceSettings = {
    findText: '',
    replaceText: '',
    useRegEx: true,
    caseInsensitive: false,
    processLineBreak: false,
    processTab: false,
    prefillFind: false,
    allFiles: false,
    replaceEnabled: true,
    wholeWord: false
};

export const MAX_MATCHES = 10000;
export const MAX_HISTORY = 10;
export const PAGE_SIZE = 1000;

export const VIEW_TYPE_REGEX_FIND_REPLACE = "regex-find-replace-view";

export interface MatchOperation {
    timestamp: number;
    scope: 'vault' | 'document';
    count: number;
    find: string;
    replace: string;
    useRegEx: boolean;
    regexFlags: string;
    changes: Array<{
        path: string;
        before: string;
        after: string;
    }>;
}
