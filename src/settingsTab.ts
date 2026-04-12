import { App, PluginSettingTab, Setting } from 'obsidian';
import type RegexFindReplacePlugin from './main';
import { logger } from './utils';

export class RegexFindReplaceSettingTab extends PluginSettingTab {
    plugin: RegexFindReplacePlugin;

    constructor(app: App, plugin: RegexFindReplacePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h4', { text: 'Regular Expression Settings' });

        new Setting(containerEl)
            .setName('Case Insensitive')
            .setDesc('When using regular expressions, apply the \'i\' modifier for case insensitive search')
            .addToggle(t => t
                .setValue(this.plugin.settings.caseInsensitive)
                .onChange(async (value) => {
                    logger('Settings update: caseInsensitive: ' + value);
                    this.plugin.settings.caseInsensitive = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h4', { text: 'General Settings' });

        new Setting(containerEl)
            .setName('Process \\n as line break')
            .setDesc('When \'\\n\' is used in the replace field, a \'line break\' will be inserted accordingly')
            .addToggle(t => t
                .setValue(this.plugin.settings.processLineBreak)
                .onChange(async (value) => {
                    logger('Settings update: processLineBreak: ' + value);
                    this.plugin.settings.processLineBreak = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Process \\t as tab')
            .setDesc('When \'\\t\' is used in the replace field, a \'tab\' will be inserted accordingly')
            .addToggle(t => t
                .setValue(this.plugin.settings.processTab)
                .onChange(async (value) => {
                    logger('Settings update: processTab: ' + value);
                    this.plugin.settings.processTab = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Prefill Find Field')
            .setDesc('Copy the currently selected text (if any) into the \'Find\' text field')
            .addToggle(t => t
                .setValue(this.plugin.settings.prefillFind)
                .onChange(async (value) => {
                    logger('Settings update: prefillFind: ' + value);
                    this.plugin.settings.prefillFind = value;
                    await this.plugin.saveSettings();
                }));
    }
}
