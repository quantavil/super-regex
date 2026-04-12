import { mock } from "bun:test";

mock.module("obsidian", () => {
    return {
        Plugin: class {},
        Notice: class {},
        Modal: class {},
        PluginSettingTab: class {},
        WorkspaceLeaf: class {},
        ItemView: class {},
        MarkdownView: class {},
        Menu: class {},
        FuzzySuggestModal: class { setPlaceholder() {} },
        App: class {},
        ToggleComponent: class {},
        TextComponent: class {},
        DropdownComponent: class {},
        ButtonComponent: class {},
        SliderComponent: class {},
        TFile: class {},
        TFolder: class {},
        Setting: class {
            setName() { return this; }
            setDesc() { return this; }
            addText() { return this; }
            addDropdown() { return this; }
            addButton() { return this; }
            addSlider() { return this; }
            addToggle() { return this; }
        },
        requestUrl: async (args: any) => {
            if ((globalThis as any).mockRequestUrl) {
                return (globalThis as any).mockRequestUrl(args);
            }
            return { status: 200, json: {} };
        }
    };
});
