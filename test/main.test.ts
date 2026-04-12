import { expect, test, describe } from 'bun:test';

// obsidian mock is handled by preloaded setup.ts
const { default: RegexFindReplacePlugin } = await import('../src/main');

describe('RegexFindReplacePlugin', () => {
    test('getHistoryCharCount works correctly', () => {
        const proto = RegexFindReplacePlugin.prototype;
        
        const context = {
            history: [
                { changes: [{ before: '123', after: '4567' }, { before: 'a', after: 'b' }] },
                { changes: [{ before: '1', after: '' }] }
            ]
        };
        
        const count = proto.getHistoryCharCount.call(context);
        // 3+4 + 1+1 + 1+0 = 10
        expect(count).toBe(10);
    });
});
