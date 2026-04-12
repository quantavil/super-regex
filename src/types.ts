import { TFile } from 'obsidian';

export type SearchMode = 'text' | 'regex' | 'ai';

export interface RegexFindReplaceSettings {
    findText: string;
    replaceText: string;
    searchMode: SearchMode;
    caseInsensitive: boolean;
    allFiles: boolean;
    replaceEnabled: boolean;
    wholeWord: boolean;
    folderScope: string;
    aiApiKey: string;
    aiModel: string;
    aiBaseUrl: string;
}

export const DEFAULT_SETTINGS: RegexFindReplaceSettings = {
    findText: '',
    replaceText: '',
    searchMode: 'regex',
    caseInsensitive: false,
    allFiles: false,
    replaceEnabled: true,
    wholeWord: false,
    folderScope: '',
    aiApiKey: '',
    aiModel: 'gemma-4-31b-it',
    aiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
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
    searchMode: SearchMode;
    regexFlags: string;
    changes: Array<FileChange>;
}

export interface FileChange {
    path: string;
    before: string;
    after: string;
}

export interface MatchLocation {
    start: number;
    end: number;
    text: string;
}

export interface FileMatch {
    id: string;
    file: TFile;
    lineNum: number;
    line: string;
    match: MatchLocation;
}
