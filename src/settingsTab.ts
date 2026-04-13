import { App, PluginSettingTab, Setting } from 'obsidian';
import type RegexFindReplacePlugin from './main';

export class RegexFindReplaceSettingTab extends PluginSettingTab {
    plugin: RegexFindReplacePlugin;

    constructor(app: App, plugin: RegexFindReplacePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('super-regex-settings');

        new Setting(containerEl).setName('Regular expressions').setHeading();

        new Setting(containerEl)
            .setName('Case insensitive')
            .setDesc('When using regular expressions, apply the \'i\' modifier for case insensitive search')
            .addToggle(t => t
                .setValue(this.plugin.settings.caseInsensitive)
                .onChange(async (value) => {
                    this.plugin.settings.caseInsensitive = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName('AI configuration').setHeading();

        new Setting(containerEl)
            .setName('API base URL')
            .setDesc('Base URL for chat completions API')
            .addText(t => t
                .setValue(this.plugin.settings.aiBaseUrl)
                .onChange(async (value) => {
                    this.plugin.settings.aiBaseUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('API key')
            .setDesc('Your API key for the selected provider')
            .addText(t => {
                t.inputEl.type = 'password';
                t.setValue(this.plugin.settings.aiApiKey)
                 .onChange(async (value) => {
                     this.plugin.settings.aiApiKey = value;
                     await this.plugin.saveSettings();
                 });
            });

        new Setting(containerEl)
            .setName('Model')
            .setDesc('Model to use for generating regular expressions')
            .addText(t => t
                .setValue(this.plugin.settings.aiModel)
                .onChange(async (value) => {
                    this.plugin.settings.aiModel = value;
                    await this.plugin.saveSettings();
                }));

        const verifyContainer = containerEl.createDiv('ai-verify-btn-container');
        const verifyBtn = verifyContainer.createEl('button', { text: 'Verify API configuration' });
        const verifyStatus = verifyContainer.createEl('span', { cls: 'verify-status', text: '' });

        verifyBtn.onclick = async () => {
            verifyBtn.disabled = true;
            verifyStatus.setText('Verifying...');
            verifyStatus.className = 'verify-status verify-checking';
            try {
                const { generateRegex } = await import('./ai');
                await generateRegex('match email', this.plugin.settings);
                verifyStatus.setText('Connection successful');
                verifyStatus.className = 'verify-status verify-ok';
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                verifyStatus.setText(`Error: ${message}`);
                verifyStatus.className = 'verify-status verify-error';
            } finally {
                verifyBtn.disabled = false;
            }
        };
    }
}
