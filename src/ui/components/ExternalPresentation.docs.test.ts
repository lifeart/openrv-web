/**
 * Regression tests: ExternalPresentation documentation accuracy
 *
 * These tests verify that the documentation claims about the External
 * Presentation feature match the actual code behavior. They guard against
 * documentation drifting out of sync with the implementation.
 *
 * Related docs:
 * - docs/getting-started/browser-requirements.md (BroadcastChannel section)
 * - docs/reference/browser-compatibility.md (Advanced Features table)
 * Related issue: #460, #29
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-ignore -- Node modules available in test environment
import { readFileSync } from 'fs';
// @ts-ignore -- Node modules available in test environment
import { resolve } from 'path';
import {
  ExternalPresentation,
  generatePresentationHTML,
  type SyncFrameMsg,
  type SyncPlaybackMsg,
  type SyncColorMsg,
} from './ExternalPresentation';

// ---------------------------------------------------------------------------
// Mock BroadcastChannel (minimal)
// ---------------------------------------------------------------------------

class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private closed = false;
  static instances: MockBroadcastChannel[] = [];

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    if (this.closed) throw new Error('Channel closed');
    for (const instance of MockBroadcastChannel.instances) {
      if (instance !== this && instance.name === this.name && !instance.closed && instance.onmessage) {
        instance.onmessage({ data } as MessageEvent);
      }
    }
  }

  close(): void {
    this.closed = true;
    const idx = MockBroadcastChannel.instances.indexOf(this);
    if (idx >= 0) MockBroadcastChannel.instances.splice(idx, 1);
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  MockBroadcastChannel.instances = [];
  vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  MockBroadcastChannel.instances = [];
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Documentation content tests
// ---------------------------------------------------------------------------

describe('ExternalPresentation documentation accuracy', () => {
  // @ts-ignore -- __dirname available in test environment
  const docsRoot = resolve(__dirname, '../../../docs');

  describe('browser-requirements.md', () => {
    const filePath = resolve(docsRoot, 'getting-started/browser-requirements.md');
    let content: string;

    beforeEach(() => {
      content = readFileSync(filePath, 'utf-8');
    });

    it('should describe BroadcastChannel as enabling External Presentation', () => {
      expect(content).toContain('BroadcastChannel');
      expect(content).toContain('External Presentation');
    });

    it('should NOT claim full synchronization of frame, playback, and color state without qualification', () => {
      // The old docs said "synchronizes frame, playback, and color state" implying full sync.
      // The corrected docs should qualify that it is text/metadata only.
      expect(content).not.toMatch(
        /which synchronizes frame,\s*playback,\s*and color state between/,
      );
    });

    it('should mention that the presentation window does not render the viewer image', () => {
      expect(content).toMatch(/does not render the actual viewer image/i);
    });

    it('should mention the limitation is text-only', () => {
      expect(content).toMatch(/text only|text-only|text overlays/i);
    });

    it('should reference issue #29 for the missing full viewer sync', () => {
      expect(content).toMatch(/issue\s*#?29/i);
    });
  });

  describe('review-workflow.md', () => {
    const filePath = resolve(docsRoot, 'advanced/review-workflow.md');
    let content: string;

    beforeEach(() => {
      content = readFileSync(filePath, 'utf-8');
    });

    it('should NOT claim the secondary window mirrors the viewer output', () => {
      expect(content).not.toMatch(/mirrors the viewer output/i);
    });

    it('should NOT claim clean full-frame presentation', () => {
      expect(content).not.toMatch(/clean full-frame presentation/i);
    });

    it('should describe the secondary window as text-only status information', () => {
      expect(content).toMatch(/text-only status information/i);
    });

    it('should state it does not render the actual viewer image', () => {
      expect(content).toMatch(/does not render the actual viewer image/i);
    });

    it('should reference issue #29 for full viewer mirroring', () => {
      expect(content).toMatch(/issue\s*#?29/i);
    });
  });

  describe('ui-overview.md', () => {
    const filePath = resolve(docsRoot, 'getting-started/ui-overview.md');
    let content: string;

    beforeEach(() => {
      content = readFileSync(filePath, 'utf-8');
    });

    it('should describe External Presentation as text-only status information', () => {
      expect(content).toMatch(/text-only status information/i);
    });

    it('should state it does not render the actual viewer image', () => {
      expect(content).toMatch(/does not render the actual viewer image/i);
    });

    it('should reference issue #29 for full viewer mirroring', () => {
      expect(content).toMatch(/issue\s*#?29/i);
    });
  });

  describe('browser-compatibility.md', () => {
    const filePath = resolve(docsRoot, 'reference/browser-compatibility.md');
    let content: string;

    beforeEach(() => {
      content = readFileSync(filePath, 'utf-8');
    });

    it('should list BroadcastChannel in the advanced features table', () => {
      expect(content).toContain('BroadcastChannel');
    });

    it('should indicate that external presentation is text-only or partial', () => {
      // The compatibility matrix entry should indicate the limitation
      expect(content).toMatch(/text-only|partial|limited/i);
    });

    it('should include External Presentation in the known issues table', () => {
      expect(content).toMatch(/External Presentation/);
      expect(content).toMatch(/text-only status|no viewer rendering|partial/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Code behavior tests: verify docs claims match runtime reality
// ---------------------------------------------------------------------------

describe('ExternalPresentation runtime behavior matches documentation claims', () => {
  let presenter: ExternalPresentation;

  beforeEach(() => {
    presenter = new ExternalPresentation();
    const mockWindow = { closed: false, close: vi.fn() } as unknown as Window;
    presenter.setWindowOpenFn(() => mockWindow);
    presenter.initialize();
  });

  afterEach(() => {
    presenter.dispose();
  });

  describe('BroadcastChannel usage', () => {
    it('uses BroadcastChannel for communication (not WebSocket or WebRTC)', () => {
      // Docs claim: "BroadcastChannel-based message passing (no server required)"
      // Verify that initialize() creates a BroadcastChannel instance
      expect(MockBroadcastChannel.instances.length).toBeGreaterThanOrEqual(1);
      expect(MockBroadcastChannel.instances[0]!.name).toBe('openrv-presentation');
    });

    it('broadcasts syncFrame messages with frame and totalFrames only', () => {
      // Docs claim: synchronizes "frame number" as text.
      // The message only contains numeric metadata, not pixel data.
      const posted: unknown[] = [];
      const channel = MockBroadcastChannel.instances[0]!;
      const origPost = channel.postMessage.bind(channel);
      channel.postMessage = (data: unknown) => {
        posted.push(data);
        origPost(data);
      };

      presenter.syncFrame(42, 100);

      expect(posted.length).toBe(1);
      const msg = posted[0] as SyncFrameMsg;
      expect(msg.type).toBe('syncFrame');
      expect(msg.frame).toBe(42);
      expect(msg.totalFrames).toBe(100);
      // Crucially: no image data, no pixel buffer, no texture reference
      expect(msg).not.toHaveProperty('imageData');
      expect(msg).not.toHaveProperty('pixels');
      expect(msg).not.toHaveProperty('texture');
      expect(msg).not.toHaveProperty('canvas');
    });

    it('broadcasts syncPlayback messages with metadata only (no audio or stream)', () => {
      const posted: unknown[] = [];
      const channel = MockBroadcastChannel.instances[0]!;
      const origPost = channel.postMessage.bind(channel);
      channel.postMessage = (data: unknown) => {
        posted.push(data);
        origPost(data);
      };

      presenter.syncPlayback(true, 1.5, 10);

      expect(posted.length).toBe(1);
      const msg = posted[0] as SyncPlaybackMsg;
      expect(msg.type).toBe('syncPlayback');
      expect(msg.playing).toBe(true);
      expect(msg.playbackRate).toBe(1.5);
      expect(msg.frame).toBe(10);
      // No actual media stream or audio data
      expect(msg).not.toHaveProperty('stream');
      expect(msg).not.toHaveProperty('audioData');
    });

    it('broadcasts syncColor messages with numeric values only (no shader/render state)', () => {
      const posted: unknown[] = [];
      const channel = MockBroadcastChannel.instances[0]!;
      const origPost = channel.postMessage.bind(channel);
      channel.postMessage = (data: unknown) => {
        posted.push(data);
        origPost(data);
      };

      presenter.syncColor({ exposure: 1.5, gamma: 2.2 });

      expect(posted.length).toBe(1);
      const msg = posted[0] as SyncColorMsg;
      expect(msg.type).toBe('syncColor');
      expect(msg.exposure).toBe(1.5);
      expect(msg.gamma).toBe(2.2);
      // No WebGL state, no shader uniforms, no rendered output
      expect(msg).not.toHaveProperty('shaderState');
      expect(msg).not.toHaveProperty('uniformValues');
    });
  });

  describe('presentation window is text-only (no viewer rendering)', () => {
    it('generates HTML with a canvas element but no WebGL rendering code', () => {
      const html = generatePresentationHTML('test-win', 'test-channel', 'test-session');

      // Has a canvas element
      expect(html).toContain('<canvas id="viewer">');

      // But no WebGL context creation
      expect(html).not.toContain('getContext(\'webgl');
      expect(html).not.toContain('getContext("webgl');
      expect(html).not.toContain('getContext(`webgl');
      expect(html).not.toContain('getContext(\'2d');
      expect(html).not.toContain('getContext("2d');

      // No drawImage, texImage2D, or other rendering calls
      expect(html).not.toContain('drawImage');
      expect(html).not.toContain('texImage2D');
      expect(html).not.toContain('gl.');
    });

    it('syncFrame handler in presentation HTML only updates text content', () => {
      const html = generatePresentationHTML('test-win', 'test-channel', 'test-session');

      // The syncFrame case updates textContent of the info element
      expect(html).toContain("case 'syncFrame':");
      expect(html).toContain("document.getElementById('info').textContent");

      // It does NOT draw anything to the canvas
      expect(html).not.toContain('viewer.getContext');
    });

    it('syncColor handler in presentation HTML logs a warning about missing WebGL viewer', () => {
      const html = generatePresentationHTML('test-win', 'test-channel', 'test-session');

      // The color handler explicitly warns that it cannot apply color without WebGL
      expect(html).toContain(
        'Color settings received but cannot be applied without WebGL viewer',
      );
    });

    it('presentation HTML has no image rendering pipeline', () => {
      const html = generatePresentationHTML('test-win', 'test-channel', 'test-session');

      // No shader code
      expect(html).not.toContain('createShader');
      expect(html).not.toContain('createProgram');
      expect(html).not.toContain('createTexture');

      // No image loading
      expect(html).not.toContain('new Image(');
      expect(html).not.toContain('createImageBitmap');

      // No video element
      expect(html).not.toContain('<video');
    });
  });

  describe('source code JSDoc matches corrected documentation', () => {
    it('ExternalPresentation source file documents the text-only limitation', () => {
      // @ts-ignore -- __dirname available in test environment
      const sourcePath = resolve(__dirname, './ExternalPresentation.ts');
      const source = readFileSync(sourcePath, 'utf-8');

      // The class-level JSDoc should mention the limitation
      expect(source).toMatch(/does not\s*\n?\s*\*?\s*render the actual viewer image/i);
      expect(source).toMatch(/text.*(status|overlays|information)/i);
      expect(source).toMatch(/issue\s*#?29/i);
    });
  });
});
