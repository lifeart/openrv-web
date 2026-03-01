import { describe, it, expect } from 'vitest';
import {
  KB, MB, GB,
  CACHE_MODE_LABELS,
  CACHE_MODE_TOOLTIPS,
  DEFAULT_CACHE_CONFIG,
  CACHE_MODE_CYCLE,
  detectDefaultBudget,
} from './CacheConfig';

describe('CacheConfig', () => {
  describe('byte constants', () => {
    it('CC-001: KB is 1024', () => {
      expect(KB).toBe(1024);
    });

    it('CC-002: MB is 1024*1024', () => {
      expect(MB).toBe(1024 * 1024);
    });

    it('CC-003: GB is 1024*1024*1024', () => {
      expect(GB).toBe(1024 * 1024 * 1024);
    });
  });

  describe('CACHE_MODE_LABELS', () => {
    it('CC-004: has label for each mode', () => {
      expect(CACHE_MODE_LABELS.off).toBe('None');
      expect(CACHE_MODE_LABELS.region).toBe('Nearby Frames');
      expect(CACHE_MODE_LABELS.lookahead).toBe('Playback Buffer');
    });
  });

  describe('CACHE_MODE_TOOLTIPS', () => {
    it('CC-005: has tooltip for each mode', () => {
      expect(CACHE_MODE_TOOLTIPS.off).toBeDefined();
      expect(CACHE_MODE_TOOLTIPS.region).toBeDefined();
      expect(CACHE_MODE_TOOLTIPS.lookahead).toBeDefined();
    });
  });

  describe('DEFAULT_CACHE_CONFIG', () => {
    it('CC-006: has sensible defaults', () => {
      expect(DEFAULT_CACHE_CONFIG.mode).toBe('lookahead');
      expect(DEFAULT_CACHE_CONFIG.memoryBudgetBytes).toBe(512 * MB);
      expect(DEFAULT_CACHE_CONFIG.highWaterMark).toBe(0.8);
      expect(DEFAULT_CACHE_CONFIG.criticalMark).toBe(0.95);
      expect(DEFAULT_CACHE_CONFIG.minPrerollFrames).toBe(8);
      expect(DEFAULT_CACHE_CONFIG.minEvictionGuard).toBe(2);
    });

    it('CC-007: highWaterMark is less than criticalMark', () => {
      expect(DEFAULT_CACHE_CONFIG.highWaterMark).toBeLessThan(DEFAULT_CACHE_CONFIG.criticalMark);
    });
  });

  describe('CACHE_MODE_CYCLE', () => {
    it('CC-008: contains all three modes', () => {
      expect(CACHE_MODE_CYCLE).toContain('off');
      expect(CACHE_MODE_CYCLE).toContain('region');
      expect(CACHE_MODE_CYCLE).toContain('lookahead');
      expect(CACHE_MODE_CYCLE).toHaveLength(3);
    });
  });

  describe('detectDefaultBudget', () => {
    it('CC-009: returns 512 MB when navigator.deviceMemory is not available', () => {
      // In test environment, navigator.deviceMemory is typically not available
      const budget = detectDefaultBudget();
      expect(budget).toBe(512 * MB);
    });

    it('CC-010: returns a positive number', () => {
      expect(detectDefaultBudget()).toBeGreaterThan(0);
    });
  });
});
