/**
 * getCSSColor Utility Tests
 *
 * Tests for the shared CSS variable resolution utility used by
 * canvas-based components for theme-aware drawing.
 */

import { describe, it, expect } from 'vitest';
import { getCSSColor } from './getCSSColor';

describe('getCSSColor', () => {
  describe('basic functionality', () => {
    it('CSS-U001: should return CSS variable value when defined', () => {
      // Set a CSS variable on document root
      document.documentElement.style.setProperty('--test-color', '#ff0000');

      const result = getCSSColor('--test-color', '#000000');
      expect(result).toBe('#ff0000');

      // Cleanup
      document.documentElement.style.removeProperty('--test-color');
    });

    it('CSS-U002: should return fallback when variable is not defined', () => {
      const result = getCSSColor('--nonexistent-variable', '#fallback');
      expect(result).toBe('#fallback');
    });

    it('CSS-U003: should return fallback when variable value is empty', () => {
      document.documentElement.style.setProperty('--empty-var', '');

      const result = getCSSColor('--empty-var', '#default');
      expect(result).toBe('#default');

      document.documentElement.style.removeProperty('--empty-var');
    });

    it('CSS-U004: should trim whitespace from CSS variable value', () => {
      document.documentElement.style.setProperty('--spaced-color', '  #aabbcc  ');

      const result = getCSSColor('--spaced-color', '#000000');
      expect(result).toBe('#aabbcc');

      document.documentElement.style.removeProperty('--spaced-color');
    });
  });

  describe('color formats', () => {
    it('CSS-U010: should handle hex color values', () => {
      document.documentElement.style.setProperty('--hex-color', '#4a9eff');

      const result = getCSSColor('--hex-color', '#000');
      expect(result).toBe('#4a9eff');

      document.documentElement.style.removeProperty('--hex-color');
    });

    it('CSS-U011: should handle rgb color values', () => {
      document.documentElement.style.setProperty('--rgb-color', 'rgb(255, 128, 64)');

      const result = getCSSColor('--rgb-color', '#000');
      expect(result).toBe('rgb(255, 128, 64)');

      document.documentElement.style.removeProperty('--rgb-color');
    });

    it('CSS-U012: should handle rgba color values', () => {
      document.documentElement.style.setProperty('--rgba-color', 'rgba(100, 150, 200, 0.5)');

      const result = getCSSColor('--rgba-color', '#000');
      expect(result).toBe('rgba(100, 150, 200, 0.5)');

      document.documentElement.style.removeProperty('--rgba-color');
    });

    it('CSS-U013: should handle named colors', () => {
      document.documentElement.style.setProperty('--named-color', 'red');

      const result = getCSSColor('--named-color', '#000');
      expect(result).toBe('red');

      document.documentElement.style.removeProperty('--named-color');
    });
  });

  describe('theme integration', () => {
    it('CSS-U020: should resolve --bg-primary variable', () => {
      document.documentElement.style.setProperty('--bg-primary', '#1a1a1a');

      const result = getCSSColor('--bg-primary', '#000');
      expect(result).toBe('#1a1a1a');

      document.documentElement.style.removeProperty('--bg-primary');
    });

    it('CSS-U021: should resolve --accent-primary variable', () => {
      document.documentElement.style.setProperty('--accent-primary', '#4a9eff');

      const result = getCSSColor('--accent-primary', '#0066cc');
      expect(result).toBe('#4a9eff');

      document.documentElement.style.removeProperty('--accent-primary');
    });

    it('CSS-U022: should resolve --text-secondary variable', () => {
      document.documentElement.style.setProperty('--text-secondary', '#b0b0b0');

      const result = getCSSColor('--text-secondary', '#666');
      expect(result).toBe('#b0b0b0');

      document.documentElement.style.removeProperty('--text-secondary');
    });

    it('CSS-U023: should resolve --error variable', () => {
      document.documentElement.style.setProperty('--error', '#f87171');

      const result = getCSSColor('--error', '#ff0000');
      expect(result).toBe('#f87171');

      document.documentElement.style.removeProperty('--error');
    });

    it('CSS-U024: should resolve --info variable', () => {
      document.documentElement.style.setProperty('--info', '#60a5fa');

      const result = getCSSColor('--info', '#0000ff');
      expect(result).toBe('#60a5fa');

      document.documentElement.style.removeProperty('--info');
    });
  });

  describe('edge cases', () => {
    it('CSS-U030: should handle variable names without -- prefix gracefully', () => {
      // This tests that the function doesn't crash with invalid input
      const result = getCSSColor('invalid-name', '#fallback');
      expect(result).toBe('#fallback');
    });

    it('CSS-U031: should handle empty variable name', () => {
      const result = getCSSColor('', '#fallback');
      expect(result).toBe('#fallback');
    });

    it('CSS-U032: should work when called multiple times for same variable', () => {
      document.documentElement.style.setProperty('--repeated-var', '#123456');

      const result1 = getCSSColor('--repeated-var', '#000');
      const result2 = getCSSColor('--repeated-var', '#000');
      const result3 = getCSSColor('--repeated-var', '#000');

      expect(result1).toBe('#123456');
      expect(result2).toBe('#123456');
      expect(result3).toBe('#123456');

      document.documentElement.style.removeProperty('--repeated-var');
    });

    it('CSS-U033: should reflect runtime changes to CSS variables', () => {
      document.documentElement.style.setProperty('--dynamic-var', '#initial');
      expect(getCSSColor('--dynamic-var', '#000')).toBe('#initial');

      // Change the variable
      document.documentElement.style.setProperty('--dynamic-var', '#updated');
      expect(getCSSColor('--dynamic-var', '#000')).toBe('#updated');

      document.documentElement.style.removeProperty('--dynamic-var');
    });
  });
});
