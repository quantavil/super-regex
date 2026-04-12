import { expect, test, describe, beforeEach } from "bun:test";
import { SearchController } from "../src/controllers/SearchController";
import { PAGE_SIZE, DEFAULT_SETTINGS } from "../src/types";

function createMockView(filesContent: Record<string, string> = {}) {
    const matches: any[] = [];
    const pendingReplacements = new Map<string, boolean>();
    const fileContainers = new Map<string, any>();
    const matchCounts = new Map<string, number>();

    return {
        plugin: {
            settings: { ...DEFAULT_SETTINGS, allFiles: false, replaceEnabled: true },
        },
        app: {
            vault: {
                read: async (file: any) => filesContent[file.path] || "",
                getMarkdownFiles: () =>
                    Object.keys(filesContent).map(p => ({ path: p })),
            },
            workspace: {
                getActiveFile: () =>
                    Object.keys(filesContent).length > 0
                        ? { path: Object.keys(filesContent)[0] }
                        : null,
            },
        },
        findInput: { value: "" },
        matches,
        pendingReplacements,
        matchesContainer: {
            empty: () => {},
            querySelectorAll: () => [],
        },
        headerTextEl: { setText: () => {} },
        searchInProgress: false,
        initialBatchRendered: false,
        renderLimit: PAGE_SIZE,
        renderedCount: 0,
        currentSearchRegex: null,
        currentSearchText: "",
        fileContainers,
        matchCounts,
        matchRenderer: {
            renderMatches: () => {},
            updateBadgeCounts: () => {},
            displayNotFoundWords: () => {},
        },
        updateLoadMoreVisibility: () => {},
        updateHeader: () => {},
        isMatchSelected: function (id: string) {
            return this.pendingReplacements.get(id) !== false;
        },
    } as any;
}

describe("SearchController", () => {
    test("performSearch with empty input sets status text", async () => {
        const view = createMockView();
        view.findInput.value = "";
        const controller = new SearchController(view);
        
        let statusText = "";
        view.headerTextEl.setText = (t: string) => { statusText = t; };

        await controller.performSearch();
        expect(statusText).toBe("Enter a search pattern");
        expect(view.matches.length).toBe(0);
    });

    test("performSearch finds regex matches in active file", async () => {
        const view = createMockView({ "test.md": "hello world\nfoo hello bar" });
        view.findInput.value = "hello";
        view.plugin.settings.searchMode = "regex";
        const controller = new SearchController(view);
        
        await controller.performSearch();
        expect(view.matches.length).toBe(2);
        expect(view.matches[0].match.text).toBe("hello");
    });

    test("performSearch finds text matches in active file", async () => {
        const view = createMockView({ "test.md": "Find THIS here and THIS there" });
        view.findInput.value = "THIS";
        view.plugin.settings.searchMode = "text";
        const controller = new SearchController(view);

        await controller.performSearch();
        expect(view.matches.length).toBe(2);
    });

    test("performSearch with case insensitive text", async () => {
        const view = createMockView({ "test.md": "Hello HELLO hello" });
        view.findInput.value = "hello";
        view.plugin.settings.searchMode = "text";
        view.plugin.settings.caseInsensitive = true;
        const controller = new SearchController(view);

        await controller.performSearch();
        expect(view.matches.length).toBe(3);
        // Original text preserved
        expect(view.matches[0].match.text).toBe("Hello");
        expect(view.matches[1].match.text).toBe("HELLO");
    });

    test("performSearch with pipe search finds multiple terms", async () => {
        const view = createMockView({ "test.md": "apple banana cherry" });
        view.findInput.value = "apple|cherry";
        view.plugin.settings.searchMode = "text";
        const controller = new SearchController(view);

        await controller.performSearch();
        expect(view.matches.length).toBe(2);
    });

    test("performSearch with invalid regex shows error", async () => {
        const view = createMockView({ "test.md": "test" });
        view.findInput.value = "[invalid";
        view.plugin.settings.searchMode = "regex";
        const controller = new SearchController(view);

        let statusText = "";
        view.headerTextEl.setText = (t: string) => { statusText = t; };

        await controller.performSearch();
        expect(statusText).toBe("Invalid regular expression");
        expect(view.matches.length).toBe(0);
    });

    test("performSearch with vault-wide search", async () => {
        const view = createMockView({
            "a.md": "hello from a",
            "b.md": "hello from b",
        });
        view.findInput.value = "hello";
        view.plugin.settings.searchMode = "text";
        view.plugin.settings.allFiles = true;
        const controller = new SearchController(view);

        await controller.performSearch();
        expect(view.matches.length).toBe(2);
        const paths = view.matches.map((m: any) => m.file.path);
        expect(paths).toContain("a.md");
        expect(paths).toContain("b.md");
    });

    test("performSearch with folder scope filters files", async () => {
        const view = createMockView({
            "docs/a.md": "hello",
            "notes/b.md": "hello",
        });
        view.findInput.value = "hello";
        view.plugin.settings.searchMode = "text";
        view.plugin.settings.allFiles = true;
        view.plugin.settings.folderScope = "docs";
        const controller = new SearchController(view);

        await controller.performSearch();
        expect(view.matches.length).toBe(1);
        expect(view.matches[0].file.path).toBe("docs/a.md");
    });

    test("pendingReplacements auto-set when replaceEnabled", async () => {
        const view = createMockView({ "test.md": "aaa" });
        view.findInput.value = "a";
        view.plugin.settings.searchMode = "text";
        view.plugin.settings.replaceEnabled = true;
        const controller = new SearchController(view);

        await controller.performSearch();
        expect(view.matches.length).toBe(3);
        // All should be auto-selected
        for (const m of view.matches) {
            expect(view.pendingReplacements.get(m.id)).toBe(true);
        }
    });

    test("searchInFile respects maxMatches limit", async () => {
        const view = createMockView({ "test.md": "a a a a a a a a a a" });
        view.findInput.value = "a"; // dummy, won't be used directly
        const controller = new SearchController(view);

        const config = {
            searchRegex: null,
            queryString: "a",
            isPipe: false,
            pipeRegExps: null,
        };
        const count = await controller.searchInFile(
            { path: "test.md" } as any,
            config,
            3
        );
        expect(count).toBe(3);
        expect(view.matches.length).toBe(3);
    });
});
