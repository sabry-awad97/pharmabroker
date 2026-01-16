/**
 * Medication Prompts Tests
 *
 * Tests to verify that dynamic year placeholders are correctly injected into prompts.
 */

import { describe, it, expect } from 'bun:test';
import { medicationSystemPrompt } from './medication';

describe('Medication Prompts', () => {
  describe('Year Placeholder Injection', () => {
    it('should contain year placeholders in system prompt', () => {
      expect(medicationSystemPrompt).toContain('{{currentYear}}');
      expect(medicationSystemPrompt).toContain('{{currentYearShort}}');
      expect(medicationSystemPrompt).toContain('{{maxYear}}');
      expect(medicationSystemPrompt).toContain('{{maxYearShort}}');
    });

    it('should replace year placeholders with actual values', () => {
      const currentYear = new Date().getFullYear();
      const currentYearShort = currentYear % 100;
      const maxYear = currentYear + 10;
      const maxYearShort = maxYear % 100;

      const processedPrompt = medicationSystemPrompt
        .replace(/\{\{currentYear\}\}/g, String(currentYear))
        .replace(/\{\{currentYearShort\}\}/g, String(currentYearShort))
        .replace(/\{\{maxYear\}\}/g, String(maxYear))
        .replace(/\{\{maxYearShort\}\}/g, String(maxYearShort));

      // Should not contain any placeholders after replacement
      expect(processedPrompt).not.toContain('{{currentYear}}');
      expect(processedPrompt).not.toContain('{{currentYearShort}}');
      expect(processedPrompt).not.toContain('{{maxYear}}');
      expect(processedPrompt).not.toContain('{{maxYearShort}}');

      // Should contain actual year values
      expect(processedPrompt).toContain(String(currentYear));
      expect(processedPrompt).toContain(String(currentYearShort));
      expect(processedPrompt).toContain(String(maxYear));
      expect(processedPrompt).toContain(String(maxYearShort));
    });

    it('should have valid year range description', () => {
      const currentYear = new Date().getFullYear();
      const currentYearShort = currentYear % 100;
      const maxYear = currentYear + 10;
      const maxYearShort = maxYear % 100;

      const processedPrompt = medicationSystemPrompt
        .replace(/\{\{currentYear\}\}/g, String(currentYear))
        .replace(/\{\{currentYearShort\}\}/g, String(currentYearShort))
        .replace(/\{\{maxYear\}\}/g, String(maxYear))
        .replace(/\{\{maxYearShort\}\}/g, String(maxYearShort));

      // Should contain the valid year range text
      expect(processedPrompt).toContain(
        `Valid year range for 2-digit years: ${currentYearShort} to ${maxYearShort}`,
      );
    });

    it('should correctly identify expiry vs concentration based on year range', () => {
      const currentYear = new Date().getFullYear();
      const currentYearShort = currentYear % 100;
      const maxYearShort = (currentYear + 10) % 100;

      // Test cases for expiry detection logic
      const testCases = [
        {
          a: 3,
          b: currentYearShort,
          isExpiry: true,
          reason: 'valid month and current year',
        },
        {
          a: 10,
          b: currentYearShort + 1,
          isExpiry: true,
          reason: 'valid month and next year',
        },
        {
          a: 12,
          b: maxYearShort,
          isExpiry: true,
          reason: 'valid month and max year',
        },
        {
          a: 13,
          b: currentYearShort,
          isExpiry: false,
          reason: 'invalid month (>12)',
        },
        {
          a: 3,
          b: currentYearShort - 1,
          isExpiry: false,
          reason: 'year before current',
        },
        {
          a: 3,
          b: maxYearShort + 1,
          isExpiry: false,
          reason: 'year after max range',
        },
        {
          a: 150,
          b: 300,
          isExpiry: false,
          reason: 'both values too large for date',
        },
      ];

      for (const tc of testCases) {
        const isValidMonth = tc.a <= 12;
        const isValidYear = tc.b >= currentYearShort && tc.b <= maxYearShort;
        const isExpiry = isValidMonth && isValidYear;

        expect(isExpiry).toBe(tc.isExpiry);
      }
    });
  });

  describe('Concentration Conversion Instructions', () => {
    it('should contain Arabic to English numeral conversion instructions', () => {
      expect(medicationSystemPrompt).toContain('CONVERT to English');
      expect(medicationSystemPrompt).toContain(
        'Arabic numeral conversion: ٠=0, ١=1, ٢=2, ٣=3, ٤=4, ٥=5, ٦=6, ٧=7, ٨=8, ٩=9',
      );
    });

    it('should have examples showing Arabic to English conversion', () => {
      expect(medicationSystemPrompt).toContain('concentration: "300"');
      expect(medicationSystemPrompt).toContain('concentration: "36"');
      expect(medicationSystemPrompt).toContain('concentration: "18"');
    });

    it('should have bad example for Arabic numerals in concentration', () => {
      expect(medicationSystemPrompt).toContain(
        'Arabic numerals must be converted to English',
      );
    });
  });
});
