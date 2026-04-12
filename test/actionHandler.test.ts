import { expect, test, describe, beforeEach } from "bun:test";
import { ActionHandler } from "../src/controllers/ActionHandler";
import { DEFAULT_SETTINGS, FileMatch } from "../src/types";

/**
 * Creates a minimal mock view with the properties ActionHandler needs.
 */
function createMockView(overrides: Record<string, any> = {}) {
    const defaults = {
        plugin: {
            settings: { ...DEFAULT_SETTINGS, replaceEnabled: true },
            performReplacements: async () => {},
            undoLast: async () => {},
        },
        matches: [] as FileMatch[],
        pendingReplacements: new Map<string, boolean>(),
        replaceInput: { value: 'replacement' },
        currentSearchRegex: null,
        isMatchSelected: function (id: string) {
            return this.pendingReplacements.get(id) !== false;
        },
        showUndoBanner: () => {},
        searchController: { performSearch: async () => {} },
        findInput: { focus: () => {} },
    };
    return { ...defaults, ...overrides } as any;
}

function createMatch(id: string, text = "hello"): FileMatch {
    return {
        id,
        file: { path: "test.md" } as any,
        lineNum: 0,
        line: `some ${text} line`,
        match: { start: 5, end: 5 + text.length, text },
    };
}

describe("ActionHandler", () => {
    let view: any;
    let handler: ActionHandler;

    beforeEach(() => {
        view = createMockView();
        handler = new ActionHandler(view);
    });

    test("replaceAll skips when replace disabled", async () => {
        view.plugin.settings.replaceEnabled = false;
        view.matches = [createMatch("m1")];
        let called = false;
        view.plugin.performReplacements = async () => { called = true; };
        await handler.replaceAll();
        expect(called).toBe(false);
    });

    test("replaceAll skips when no matches", async () => {
        let called = false;
        view.plugin.performReplacements = async () => { called = true; };
        await handler.replaceAll();
        expect(called).toBe(false);
    });

    test("replaceAll submits only selected matches", async () => {
        const m1 = createMatch("m1");
        const m2 = createMatch("m2");
        view.matches = [m1, m2];
        view.pendingReplacements.set("m1", true);
        view.pendingReplacements.set("m2", false);

        let submitted: FileMatch[] = [];
        view.plugin.performReplacements = async (matches: FileMatch[]) => {
            submitted = matches;
        };
        await handler.replaceAll();
        expect(submitted.length).toBe(1);
        expect(submitted[0].id).toBe("m1");
    });

    test("replaceAll with default selection includes all", async () => {
        const m1 = createMatch("m1");
        const m2 = createMatch("m2");
        view.matches = [m1, m2];
        // default: not in map → isMatchSelected returns true

        let submitted: FileMatch[] = [];
        view.plugin.performReplacements = async (matches: FileMatch[]) => {
            submitted = matches;
        };
        await handler.replaceAll();
        expect(submitted.length).toBe(2);
    });

    test("doUndo calls plugin.undoLast and performSearch", async () => {
        let undoCalled = false;
        let searchCalled = false;
        view.plugin.undoLast = async () => { undoCalled = true; };
        view.searchController.performSearch = async () => { searchCalled = true; };
        await handler.doUndo();
        expect(undoCalled).toBe(true);
        expect(searchCalled).toBe(true);
    });

    test("exportMatches copies formatted report", async () => {
        const m1 = createMatch("test.md:0:5", "hello");
        m1.file = { path: "test.md" } as any;
        view.matches = [m1];

        let clipboardContent = "";
        // Mock navigator.clipboard
        (globalThis as any).navigator = {
            clipboard: {
                writeText: async (text: string) => { clipboardContent = text; },
            },
        };

        handler.exportMatches();
        // Allow promise to resolve
        await new Promise(r => setTimeout(r, 10));
        expect(clipboardContent).toContain("test.md");
        expect(clipboardContent).toContain("hello");
    });
});
