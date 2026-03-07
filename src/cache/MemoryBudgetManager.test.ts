import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryBudgetManager, type BudgetCacheLayer } from './MemoryBudgetManager';
import { MB, GB } from '../config/CacheConfig';

describe('MemoryBudgetManager', () => {
  let manager: MemoryBudgetManager;

  beforeEach(() => {
    manager = new MemoryBudgetManager({
      totalBudget: 512 * MB,
      highWaterMark: 0.8,
      criticalMark: 0.95,
      auditIntervalMs: 0, // Disable auto-audit in tests
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  // -------------------------------------------------------------------
  // Constructor / Configuration
  // -------------------------------------------------------------------

  describe('constructor', () => {
    it('MBM-001: initializes with default config when none provided', () => {
      const m = new MemoryBudgetManager();
      expect(m.getTotalBudget()).toBe(512 * MB);
      expect(m.getCurrentUsage()).toBe(0);
      expect(m.getPressureLevel()).toBe('normal');
      m.dispose();
    });

    it('MBM-002: accepts custom config', () => {
      const m = new MemoryBudgetManager({ totalBudget: 1 * GB });
      expect(m.getTotalBudget()).toBe(1 * GB);
      m.dispose();
    });
  });

  describe('setTotalBudget', () => {
    it('MBM-003: updates the total budget', () => {
      manager.setTotalBudget(1 * GB);
      expect(manager.getTotalBudget()).toBe(1 * GB);
    });

    it('MBM-004: clamps minimum budget to 256 MB', () => {
      manager.setTotalBudget(100 * MB);
      expect(manager.getTotalBudget()).toBe(256 * MB);
    });

    it('MBM-005: clamps maximum budget to 4 GB', () => {
      manager.setTotalBudget(8 * GB);
      expect(manager.getTotalBudget()).toBe(4 * GB);
    });

    it('MBM-006: emits allocationChanged on budget update', () => {
      const listener = vi.fn();
      manager.on('allocationChanged', listener);
      manager.setTotalBudget(1 * GB);
      expect(listener).toHaveBeenCalledWith({
        currentUsage: 0,
        totalBudget: 1 * GB,
      });
    });
  });

  // -------------------------------------------------------------------
  // Allocation tracking
  // -------------------------------------------------------------------

  describe('reportAllocation', () => {
    it('MBM-007: increases current usage', () => {
      manager.reportAllocation(100 * MB);
      expect(manager.getCurrentUsage()).toBe(100 * MB);
    });

    it('MBM-008: accumulates multiple allocations', () => {
      manager.reportAllocation(100 * MB);
      manager.reportAllocation(50 * MB);
      expect(manager.getCurrentUsage()).toBe(150 * MB);
    });

    it('MBM-009: emits allocationChanged event', () => {
      const listener = vi.fn();
      manager.on('allocationChanged', listener);
      manager.reportAllocation(100 * MB);
      expect(listener).toHaveBeenCalledWith({
        currentUsage: 100 * MB,
        totalBudget: 512 * MB,
      });
    });
  });

  describe('reportDeallocation', () => {
    it('MBM-010: decreases current usage', () => {
      manager.reportAllocation(100 * MB);
      manager.reportDeallocation(30 * MB);
      expect(manager.getCurrentUsage()).toBe(70 * MB);
    });

    it('MBM-011: does not go below zero', () => {
      manager.reportAllocation(10 * MB);
      manager.reportDeallocation(20 * MB);
      expect(manager.getCurrentUsage()).toBe(0);
    });

    it('MBM-012: emits allocationChanged event', () => {
      manager.reportAllocation(100 * MB);
      const listener = vi.fn();
      manager.on('allocationChanged', listener);
      manager.reportDeallocation(30 * MB);
      expect(listener).toHaveBeenCalledWith({
        currentUsage: 70 * MB,
        totalBudget: 512 * MB,
      });
    });
  });

  describe('canAllocate', () => {
    it('MBM-013: returns true when within budget', () => {
      expect(manager.canAllocate(100 * MB)).toBe(true);
    });

    it('MBM-014: returns false when exceeding budget', () => {
      manager.reportAllocation(500 * MB);
      expect(manager.canAllocate(100 * MB)).toBe(false);
    });

    it('MBM-015: returns true for exact budget match', () => {
      expect(manager.canAllocate(512 * MB)).toBe(true);
    });
  });

  describe('resetUsage', () => {
    it('MBM-016: resets usage to zero', () => {
      manager.reportAllocation(200 * MB);
      manager.resetUsage();
      expect(manager.getCurrentUsage()).toBe(0);
    });

    it('MBM-017: emits allocationChanged event', () => {
      manager.reportAllocation(200 * MB);
      const listener = vi.fn();
      manager.on('allocationChanged', listener);
      manager.resetUsage();
      expect(listener).toHaveBeenCalledWith({
        currentUsage: 0,
        totalBudget: 512 * MB,
      });
    });
  });

  // -------------------------------------------------------------------
  // Pressure management
  // -------------------------------------------------------------------

  describe('pressure levels', () => {
    it('MBM-018: starts at normal pressure', () => {
      expect(manager.getPressureLevel()).toBe('normal');
    });

    it('MBM-019: transitions to high pressure at 80%', () => {
      const listener = vi.fn();
      manager.on('pressureChanged', listener);

      manager.reportAllocation(Math.ceil(512 * MB * 0.8));
      expect(manager.getPressureLevel()).toBe('high');
      expect(listener).toHaveBeenCalledWith('high');
    });

    it('MBM-020: transitions to critical pressure at 95%', () => {
      const listener = vi.fn();
      manager.on('pressureChanged', listener);

      manager.reportAllocation(Math.ceil(512 * MB * 0.95));
      expect(manager.getPressureLevel()).toBe('critical');
      expect(listener).toHaveBeenCalledWith('critical');
    });

    it('MBM-021: transitions back to normal on deallocation', () => {
      manager.reportAllocation(500 * MB);
      expect(manager.getPressureLevel()).toBe('critical');

      manager.reportDeallocation(400 * MB);
      expect(manager.getPressureLevel()).toBe('normal');
    });

    it('MBM-022: emits pressureChanged only when level changes', () => {
      const listener = vi.fn();
      manager.on('pressureChanged', listener);

      // Multiple allocations staying in normal range
      manager.reportAllocation(10 * MB);
      manager.reportAllocation(10 * MB);
      expect(listener).not.toHaveBeenCalled();

      // Cross into high
      manager.reportAllocation(400 * MB);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUsageFraction', () => {
    it('MBM-023: returns 0 for empty cache', () => {
      expect(manager.getUsageFraction()).toBe(0);
    });

    it('MBM-024: returns correct fraction', () => {
      manager.reportAllocation(256 * MB);
      expect(manager.getUsageFraction()).toBeCloseTo(0.5);
    });
  });

  describe('getBytesToFree', () => {
    it('MBM-025: returns 0 when below normal threshold', () => {
      manager.reportAllocation(100 * MB);
      expect(manager.getBytesToFree('normal')).toBe(0);
    });

    it('MBM-026: returns positive value when above threshold', () => {
      manager.reportAllocation(500 * MB);
      const toFree = manager.getBytesToFree('normal');
      expect(toFree).toBeGreaterThan(0);
    });
  });

  describe('isAtOrAbove', () => {
    it('MBM-027: normal is at or above normal', () => {
      expect(manager.isAtOrAbove('normal')).toBe(true);
    });

    it('MBM-028: normal is not at or above high', () => {
      expect(manager.isAtOrAbove('high')).toBe(false);
    });

    it('MBM-029: high is at or above normal and high', () => {
      manager.reportAllocation(Math.ceil(512 * MB * 0.85));
      expect(manager.isAtOrAbove('normal')).toBe(true);
      expect(manager.isAtOrAbove('high')).toBe(true);
      expect(manager.isAtOrAbove('critical')).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // Layer registration
  // -------------------------------------------------------------------

  describe('register / unregister', () => {
    it('MBM-030: registers a cache layer', () => {
      const layer: BudgetCacheLayer = {
        layerId: 'test-layer',
        getEstimatedMemoryUsage: () => 100 * MB,
      };
      manager.register(layer);
      expect(manager.getRegisteredLayers()).toContain('test-layer');
    });

    it('MBM-031: unregisters a cache layer', () => {
      const layer: BudgetCacheLayer = {
        layerId: 'test-layer',
        getEstimatedMemoryUsage: () => 0,
      };
      manager.register(layer);
      manager.unregister('test-layer');
      expect(manager.getRegisteredLayers()).not.toContain('test-layer');
    });
  });

  // -------------------------------------------------------------------
  // Audit
  // -------------------------------------------------------------------

  describe('runAudit', () => {
    it('MBM-032: returns discrepancy between tracked and actual usage', () => {
      const layer: BudgetCacheLayer = {
        layerId: 'test-layer',
        getEstimatedMemoryUsage: () => 100 * MB,
      };
      manager.register(layer);
      manager.reportAllocation(120 * MB); // Over-counted by 20 MB

      const discrepancy = manager.runAudit();
      expect(discrepancy).toBe(20 * MB);
    });

    it('MBM-033: corrects usage when discrepancy exceeds 5% of budget', () => {
      const layer: BudgetCacheLayer = {
        layerId: 'test-layer',
        getEstimatedMemoryUsage: () => 100 * MB,
      };
      manager.register(layer);

      // Set tracked usage way off (>5% discrepancy)
      manager.reportAllocation(200 * MB);
      manager.runAudit();

      expect(manager.getCurrentUsage()).toBe(100 * MB);
    });

    it('MBM-034: does not correct usage when discrepancy is within 5%', () => {
      const layer: BudgetCacheLayer = {
        layerId: 'test-layer',
        getEstimatedMemoryUsage: () => 100 * MB,
      };
      manager.register(layer);

      // Small discrepancy (within 5% of 512MB = 25.6 MB)
      manager.reportAllocation(110 * MB);
      manager.runAudit();

      expect(manager.getCurrentUsage()).toBe(110 * MB);
    });
  });

  describe('startAudit / stopAudit', () => {
    it('MBM-035: starts and stops audit timer', () => {
      const m = new MemoryBudgetManager({ auditIntervalMs: 1000 });
      m.startAudit();
      // Should not throw
      m.stopAudit();
      m.dispose();
    });

    it('MBM-036: does not start audit when interval is 0', () => {
      // Our default test manager has auditIntervalMs: 0
      manager.startAudit();
      // Should be a no-op, not throw
      manager.stopAudit();
    });
  });

  // -------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------

  describe('dispose', () => {
    it('MBM-037: clears all state on dispose', () => {
      manager.reportAllocation(100 * MB);
      manager.register({
        layerId: 'test',
        getEstimatedMemoryUsage: () => 0,
      });

      manager.dispose();

      expect(manager.getCurrentUsage()).toBe(0);
      expect(manager.getRegisteredLayers()).toHaveLength(0);
      expect(manager.getPressureLevel()).toBe('normal');
    });
  });
});
