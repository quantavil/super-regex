import { expect, test, describe, mock, beforeEach } from 'bun:test';
import { DEFAULT_SETTINGS, RegexFindReplaceSettings } from '../src/types';
import * as obsidian from 'obsidian';

// The 'obsidian' module is mocked by setup.ts, which delegates requestUrl to globalThis.mockRequestUrl
const mockRequestUrl = mock();
(globalThis as any).mockRequestUrl = mockRequestUrl;

const { generateRegex } = await import('../src/ai');

describe('generateRegex', () => {
    const baseSettings: RegexFindReplaceSettings = {
        ...DEFAULT_SETTINGS,
        aiApiKey: 'test-key'
    };

    test('throws error when API key is missing', async () => {
        const settings = { ...baseSettings, aiApiKey: '' };
        await expect(generateRegex('test text', settings)).rejects.toThrow('API Key is missing');
    });

    test('sanitizes AI response by stripping markdown and whitespace', async () => {
        mockRequestUrl.mockResolvedValueOnce({
            status: 200,
            json: {
                choices: [{
                    message: { content: '```regexp\n  [a-z]+  \n```' }
                }]
            }
        });

        const regex = await generateRegex('test text', baseSettings);
        expect(regex).toBe('[a-z]+');
    });

    test('strips leading and trailing slashes if AI accidentally includes them', async () => {
        mockRequestUrl.mockResolvedValueOnce({
            status: 200,
            json: {
                choices: [{
                    message: { content: '/([0-9]{4})/' }
                }]
            }
        });

        const regex = await generateRegex('test text', baseSettings);
        expect(regex).toBe('([0-9]{4})');
    });

    test('handles API errors gracefully', async () => {
        mockRequestUrl.mockResolvedValueOnce({
            status: 400,
            text: 'Bad Request'
        });

        await expect(generateRegex('test text', baseSettings)).rejects.toThrow('API Error 400: Bad Request');
    });

    test('handles unexpected JSON format', async () => {
        mockRequestUrl.mockResolvedValueOnce({
            status: 200,
            json: { wrong_schema: true }
        });

        await expect(generateRegex('test text', baseSettings)).rejects.toThrow('Unexpected response format');
    });
});
