import { describe, it, expect } from 'vitest';
// @ts-ignore -- Node modules available in test environment
import { readFileSync } from 'fs';
// @ts-ignore -- Node modules available in test environment
import { resolve } from 'path';

/**
 * Regression tests for Issue #454: documentation must accurately describe
 * the signaling server requirement for collaborative review sessions.
 *
 * The core viewer is fully static, but collaboration needs a WebSocket
 * signaling server. These tests ensure the docs communicate that clearly.
 */
describe('Documentation: collaboration signaling requirements (Issue #454)', () => {
  // @ts-ignore -- __dirname available in test environment
  const docsRoot = resolve(__dirname, '..', 'docs');

  const faqPath = resolve(docsRoot, 'reference', 'faq.md');
  const installPath = resolve(docsRoot, 'getting-started', 'installation.md');

  const faq = readFileSync(faqPath, 'utf-8');
  const install = readFileSync(installPath, 'utf-8');

  describe('FAQ (docs/reference/faq.md)', () => {
    it('should mention that collaboration requires a signaling server', () => {
      expect(faq).toMatch(/collaborat\w*.*signaling server/is);
    });

    it('should mention VITE_NETWORK_SIGNALING_SERVERS in the self-hosting answer', () => {
      expect(faq).toContain('VITE_NETWORK_SIGNALING_SERVERS');
    });

    it('should still describe the core viewer as static / no server required', () => {
      expect(faq).toMatch(/static files/i);
    });
  });

  describe('Installation guide (docs/getting-started/installation.md)', () => {
    it('should mention signaling server dependency for collaboration', () => {
      expect(install).toMatch(/signaling server/i);
    });

    it('should document the VITE_NETWORK_SIGNALING_SERVERS environment variable', () => {
      expect(install).toContain('VITE_NETWORK_SIGNALING_SERVERS');
    });

    it('should mention the default signaling URL wss://sync.openrv.local', () => {
      expect(install).toContain('wss://sync.openrv.local');
    });

    it('should explain that collaboration requires WebSocket infrastructure', () => {
      expect(install).toMatch(/WebSocket/);
    });

    it('should clarify the core viewer works without server-side runtime', () => {
      expect(install).toMatch(/no server-side runtime/i);
    });

    it('should explain what the signaling server does (room management and message relay)', () => {
      expect(install).toMatch(/room/i);
      expect(install).toMatch(/relay/i);
    });

    it('should mention WebRTC session negotiation as a signaling server responsibility', () => {
      expect(install).toMatch(/WebRTC.*negotiat/is);
    });
  });
});
