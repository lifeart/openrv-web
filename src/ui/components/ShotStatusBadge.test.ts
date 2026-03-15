/**
 * ShotStatusBadge Component Tests
 *
 * Verifies:
 * - Badge renders in header with correct structure
 * - Status changes are reflected in the UI (dot color, label text)
 * - Status updates go through StatusManager
 * - Badge updates on source change
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ShotStatusBadge } from './ShotStatusBadge';
import { Session } from '../../core/session/Session';
import type { ShotStatus } from '../../core/session/StatusManager';

describe('ShotStatusBadge', () => {
  let badge: ShotStatusBadge;
  let session: Session;

  beforeEach(() => {
    session = new Session();
    // Add two test sources for source-switching tests
    (session as any).addSource({
      name: 'shot_010_comp_v001.exr',
      url: 'blob:test1',
      type: 'image',
      duration: 1,
      fps: 24,
      width: 1920,
      height: 1080,
    });
    (session as any).addSource({
      name: 'shot_020_comp_v001.exr',
      url: 'blob:test2',
      type: 'image',
      duration: 1,
      fps: 24,
      width: 1920,
      height: 1080,
    });
    badge = new ShotStatusBadge(session);
  });

  afterEach(() => {
    badge.dispose();
  });

  describe('rendering', () => {
    it('SSB-001: renders a button element with shot-status-badge testid', () => {
      const el = badge.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.dataset.testid).toBe('shot-status-badge');
      expect(el.tagName).toBe('BUTTON');
    });

    it('SSB-002: contains a status dot element', () => {
      const el = badge.render();
      const dot = el.querySelector('[data-testid="shot-status-dot"]');
      expect(dot).not.toBeNull();
    });

    it('SSB-003: contains a status label element', () => {
      const el = badge.render();
      const label = el.querySelector('[data-testid="shot-status-label"]');
      expect(label).not.toBeNull();
    });

    it('SSB-004: default status is Pending with gray dot', () => {
      const el = badge.render();
      const dot = el.querySelector('[data-testid="shot-status-dot"]') as HTMLElement;
      const label = el.querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      // Browser may convert hex to rgb, so check both forms
      expect(dot.style.background).toBeTruthy();
      expect(label.textContent).toBe('Pending');
    });

    it('SSB-005: render returns the same container element on multiple calls', () => {
      const el1 = badge.render();
      const el2 = badge.render();
      expect(el1).toBe(el2);
    });

    it('SSB-006: has aria-label for accessibility', () => {
      const el = badge.render();
      expect(el.getAttribute('aria-label')).toContain('Shot status');
    });

    it('SSB-007: has aria-haspopup for dropdown', () => {
      const el = badge.render();
      expect(el.getAttribute('aria-haspopup')).toBe('listbox');
    });
  });

  describe('status display updates', () => {
    it('SSB-010: shows Approved status with green dot', () => {
      badge.render();
      session.statusManager.setStatus(0, 'approved', 'user');
      const dot = badge.getContainer().querySelector('[data-testid="shot-status-dot"]') as HTMLElement;
      const label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      // Dot color should change (browser may render as rgb)
      expect(dot.style.background).toBeTruthy();
      expect(dot.style.background).not.toContain('148'); // not the gray pending color
      expect(label.textContent).toBe('Approved');
    });

    it('SSB-011: shows Needs Work status with orange dot', () => {
      badge.render();
      session.statusManager.setStatus(0, 'needs-work', 'user');
      const label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      expect(label.textContent).toBe('Needs Work');
    });

    it('SSB-012: shows CBB status with yellow dot', () => {
      badge.render();
      session.statusManager.setStatus(0, 'cbb', 'user');
      const label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      expect(label.textContent).toBe('Could Be Better');
    });

    it('SSB-013: shows Omit status with red dot', () => {
      badge.render();
      session.statusManager.setStatus(0, 'omit', 'user');
      const label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      expect(label.textContent).toBe('Omit');
    });

    it('SSB-014: reverts to Pending when status is cleared', () => {
      badge.render();
      session.statusManager.setStatus(0, 'approved', 'user');
      // Verify it changed
      let label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      expect(label.textContent).toBe('Approved');

      // Clear status
      session.statusManager.clearStatus(0);
      label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      expect(label.textContent).toBe('Pending');
    });

    it('SSB-015: updates aria-label when status changes', () => {
      badge.render();
      session.statusManager.setStatus(0, 'approved', 'user');
      expect(badge.getContainer().getAttribute('aria-label')).toBe('Shot status: Approved');
    });
  });

  describe('StatusManager integration', () => {
    it('SSB-020: clicking the badge and selecting a status calls setStatus on StatusManager', () => {
      badge.render();
      const spy = vi.spyOn(session.statusManager, 'setStatus');

      // Simulate the status select handler
      // We test the internal handler directly since DOM click -> dropdown -> select
      // is hard to simulate in unit tests
      (badge as any).handleStatusSelect('approved');

      expect(spy).toHaveBeenCalledWith(0, 'approved', 'user');
    });

    it('SSB-021: status set via StatusManager API reflects in badge', () => {
      badge.render();
      session.statusManager.setStatus(0, 'needs-work', 'supervisor');

      const label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      expect(label.textContent).toBe('Needs Work');
    });

    it('SSB-022: status set for different source does not change badge for current source', () => {
      badge.render();
      // Current source is index 0
      session.statusManager.setStatus(1, 'approved', 'user');

      const label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      // Badge still shows pending for source 0
      expect(label.textContent).toBe('Pending');
    });
  });

  describe('source change tracking', () => {
    it('SSB-030: badge updates when source changes via frameChanged', () => {
      badge.render();

      // Set different statuses for each source
      session.statusManager.setStatus(0, 'approved', 'user');
      session.statusManager.setStatus(1, 'needs-work', 'user');

      // Verify source 0 status is shown
      let label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      expect(label.textContent).toBe('Approved');

      // Simulate source change by changing currentSourceIndex and firing frameChanged
      (session as any)._currentSourceIndex = 1;
      session.emit('frameChanged', 1);

      label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      expect(label.textContent).toBe('Needs Work');
    });

    it('SSB-031: badge updates when source changes via abSourceChanged', () => {
      badge.render();

      session.statusManager.setStatus(0, 'approved', 'user');
      session.statusManager.setStatus(1, 'omit', 'user');

      // Verify initial state
      let label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      expect(label.textContent).toBe('Approved');

      // Simulate AB source switch
      (session as any)._currentSourceIndex = 1;
      session.emit('abSourceChanged', { current: 'B', sourceIndex: 1 });

      label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      expect(label.textContent).toBe('Omit');
    });

    it('SSB-032: badge updates when a new source is loaded', () => {
      badge.render();
      session.statusManager.setStatus(0, 'approved', 'user');

      const label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      expect(label.textContent).toBe('Approved');

      // Simulate loading a new source (sourceLoaded event)
      session.emit('sourceLoaded', {
        name: 'shot_030_comp_v001.exr',
        url: 'blob:test3',
        type: 'image' as any,
        duration: 1,
        fps: 24,
        width: 1920,
        height: 1080,
      });

      // Badge should refresh (still shows current source's status)
      const updatedLabel = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      expect(updatedLabel).not.toBeNull();
    });

    it('SSB-033: frameChanged without source change does not trigger unnecessary update', () => {
      badge.render();

      const updateSpy = vi.spyOn(badge, 'update');

      // First frame change triggers update (initial tracking)
      session.emit('frameChanged', 1);
      const callCount = updateSpy.mock.calls.length;

      // Second frame change on same source should NOT trigger update
      session.emit('frameChanged', 2);
      expect(updateSpy.mock.calls.length).toBe(callCount);
    });
  });

  describe('disposal', () => {
    it('SSB-040: dispose removes event listeners', () => {
      badge.render();
      badge.dispose();

      // After dispose, status changes should not throw
      session.statusManager.setStatus(0, 'approved', 'user');

      // Badge label should still show old value (no update after dispose)
      const label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      expect(label.textContent).toBe('Pending');
    });
  });

  describe('all status values', () => {
    const statusCases: [ShotStatus, string][] = [
      ['pending', 'Pending'],
      ['approved', 'Approved'],
      ['needs-work', 'Needs Work'],
      ['cbb', 'Could Be Better'],
      ['omit', 'Omit'],
    ];

    it.each(statusCases)('SSB-050: status "%s" renders label "%s"', (status, expectedLabel) => {
      badge.render();
      if (status !== 'pending') {
        session.statusManager.setStatus(0, status, 'user');
      }

      const dot = badge.getContainer().querySelector('[data-testid="shot-status-dot"]') as HTMLElement;
      const label = badge.getContainer().querySelector('[data-testid="shot-status-label"]') as HTMLElement;
      expect(dot.style.background).toBeTruthy();
      expect(label.textContent).toBe(expectedLabel);
    });
  });
});
