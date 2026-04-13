import { requestUrl } from 'obsidian';
import { logger, LogLevel } from './utils';
import { RegexFindReplaceSettings, DEFAULT_SETTINGS } from './types';

export async function generateRegex(prompt: string, settings: RegexFindReplaceSettings): Promise<string> {
    const { aiApiKey, aiModel, aiBaseUrl } = settings;

    if (!aiApiKey) {
        throw new Error('API Key is missing. Please configure it in settings.');
    }

    const systemPrompt = `You are an expert regex generator.
The user will provide a natural language description of what they want to find.
Your job is to output ONLY the raw, valid JavaScript Regular Expression that matches their description.
CRITICAL: DO NOT include any explanations, markdown formatting, slashes at the start/end, or flags. Output nothing but the raw regex string itself.`;

    const body = {
        model: aiModel || DEFAULT_SETTINGS.aiModel,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ],
        temperature: 0.0,
        max_tokens: 150
    };

    try {
        logger(`Generating regex via ${aiBaseUrl || DEFAULT_SETTINGS.aiBaseUrl} for model ${body.model}`, LogLevel.DEBUG);
        
        const response = await requestUrl({
            url: aiBaseUrl || DEFAULT_SETTINGS.aiBaseUrl,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${aiApiKey}`
            },
            body: JSON.stringify(body)
        });

        if (response.status !== 200) {
            throw new Error(`API Error ${response.status}: ${response.text}`);
        }

        const data = response.json;
        if (data.choices && data.choices.length > 0 && data.choices[0].message) {
            let regexStr = data.choices[0].message.content.trim();
            // remove <thought>...</thought> or <think>...</think> blocks if present
            regexStr = regexStr.replace(/<(thought|think)>[\s\S]*?<\/\1>/gi, '').trim();
            // remove surrounding backticks if present
            regexStr = regexStr.replace(/^`+|`+$/g, '');
            // remove surrounding js regex block format if present
            regexStr = regexStr.replace(/^(regex|javascript|js|regexp)\s*\n/i, '');
            // remove leading/trailing slashes if the LLM adds them
            if (regexStr.startsWith('/') && regexStr.lastIndexOf('/') > 0) {
                regexStr = regexStr.substring(1, regexStr.lastIndexOf('/'));
            }
            return regexStr.trim();
        } else {
            throw new Error('Unexpected response format from API');
        }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logger(`Failed to generate regex: ${message}`, LogLevel.ERROR);
        throw e;
    }
}
