import { formatHours } from './formatHours';

describe('formatHours', () => {
    it('formats whole hours correctly', () => {
        expect(formatHours(1)).toBe('1:00');
        expect(formatHours(5)).toBe('5:00');
        expect(formatHours(0)).toBe('0:00');
    });

    it('formats partial hours correctly', () => {
        expect(formatHours(1.5)).toBe('1:30');
        expect(formatHours(0.25)).toBe('0:15');
        expect(formatHours(1.333333)).toBe('1:20');
        expect(formatHours(1.1)).toBe('1:06');
    });

    it('rounds minutes to the nearest whole number', () => {
        expect(formatHours(1.016666)).toBe('1:01');
        expect(formatHours(1.008)).toBe('1:00');
        expect(formatHours(1.009)).toBe('1:01');
    });

    it('handles large hour values', () => {
        expect(formatHours(123.45)).toBe('123:27');
    });
});
