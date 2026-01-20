/**
 * Icons Component Tests
 *
 * Tests for the centralized SVG icon system.
 */

import { describe, it, expect } from 'vitest';
import { createIcon, getIconSvg, ICONS, IconName, IconSize } from './Icons';

describe('createIcon', () => {
  describe('basic creation', () => {
    it('ICON-U001: creates SVG element', () => {
      const icon = createIcon('play');
      expect(icon).toBeInstanceOf(SVGSVGElement);
    });

    it('ICON-U002: SVG has viewBox 0 0 24 24', () => {
      const icon = createIcon('play');
      expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
    });

    it('ICON-U003: SVG has fill none', () => {
      const icon = createIcon('play');
      expect(icon.getAttribute('fill')).toBe('none');
    });

    it('ICON-U004: SVG has stroke currentColor', () => {
      const icon = createIcon('play');
      expect(icon.getAttribute('stroke')).toBe('currentColor');
    });

    it('ICON-U005: SVG has stroke-width 2', () => {
      const icon = createIcon('play');
      expect(icon.getAttribute('stroke-width')).toBe('2');
    });

    it('ICON-U006: SVG has stroke-linecap round', () => {
      const icon = createIcon('play');
      expect(icon.getAttribute('stroke-linecap')).toBe('round');
    });

    it('ICON-U007: SVG has stroke-linejoin round', () => {
      const icon = createIcon('play');
      expect(icon.getAttribute('stroke-linejoin')).toBe('round');
    });

    it('ICON-U008: SVG has inline-block display', () => {
      const icon = createIcon('play');
      expect(icon.style.display).toBe('inline-block');
    });
  });

  describe('sizes', () => {
    it('ICON-U010: sm size is 14x14', () => {
      const icon = createIcon('play', 'sm');
      expect(icon.getAttribute('width')).toBe('14');
      expect(icon.getAttribute('height')).toBe('14');
    });

    it('ICON-U011: md size is 16x16', () => {
      const icon = createIcon('play', 'md');
      expect(icon.getAttribute('width')).toBe('16');
      expect(icon.getAttribute('height')).toBe('16');
    });

    it('ICON-U012: lg size is 20x20', () => {
      const icon = createIcon('play', 'lg');
      expect(icon.getAttribute('width')).toBe('20');
      expect(icon.getAttribute('height')).toBe('20');
    });

    it('ICON-U013: default size is md', () => {
      const icon = createIcon('play');
      expect(icon.getAttribute('width')).toBe('16');
      expect(icon.getAttribute('height')).toBe('16');
    });
  });

  describe('icon content', () => {
    it('ICON-U020: play icon has polygon', () => {
      const icon = createIcon('play');
      expect(icon.innerHTML).toContain('polygon');
    });

    it('ICON-U021: pause icon has rect elements', () => {
      const icon = createIcon('pause');
      expect(icon.innerHTML).toContain('rect');
    });

    it('ICON-U022: undo icon has path', () => {
      const icon = createIcon('undo');
      expect(icon.innerHTML).toContain('path');
    });

    it('ICON-U023: unknown icon has empty content', () => {
      // TypeScript would prevent this at compile time, but test runtime behavior
      const icon = createIcon('nonexistent-icon' as IconName);
      expect(icon.innerHTML).toBe('');
    });
  });
});

describe('getIconSvg', () => {
  describe('basic output', () => {
    it('ICON-U030: returns SVG string', () => {
      const svg = getIconSvg('play');
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    it('ICON-U031: includes viewBox attribute', () => {
      const svg = getIconSvg('play');
      expect(svg).toContain('viewBox="0 0 24 24"');
    });

    it('ICON-U032: includes stroke currentColor', () => {
      const svg = getIconSvg('play');
      expect(svg).toContain('stroke="currentColor"');
    });

    it('ICON-U033: includes icon path content', () => {
      const svg = getIconSvg('play');
      expect(svg).toContain('polygon');
    });
  });

  describe('sizes', () => {
    it('ICON-U040: sm size outputs width/height 14', () => {
      const svg = getIconSvg('play', 'sm');
      expect(svg).toContain('width="14"');
      expect(svg).toContain('height="14"');
    });

    it('ICON-U041: md size outputs width/height 16', () => {
      const svg = getIconSvg('play', 'md');
      expect(svg).toContain('width="16"');
      expect(svg).toContain('height="16"');
    });

    it('ICON-U042: lg size outputs width/height 20', () => {
      const svg = getIconSvg('play', 'lg');
      expect(svg).toContain('width="20"');
      expect(svg).toContain('height="20"');
    });

    it('ICON-U043: default size is md', () => {
      const svg = getIconSvg('play');
      expect(svg).toContain('width="16"');
    });
  });

  describe('unknown icons', () => {
    it('ICON-U050: unknown icon returns empty path', () => {
      const svg = getIconSvg('unknown-icon' as IconName);
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });
  });
});

describe('ICONS constant', () => {
  describe('icon categories', () => {
    it('ICON-U060: has file operation icons', () => {
      expect(ICONS['folder-open']).toBeDefined();
      expect(ICONS['save']).toBeDefined();
      expect(ICONS['download']).toBeDefined();
      expect(ICONS['upload']).toBeDefined();
    });

    it('ICON-U061: has playback icons', () => {
      expect(ICONS['play']).toBeDefined();
      expect(ICONS['pause']).toBeDefined();
      expect(ICONS['stop']).toBeDefined();
      expect(ICONS['skip-back']).toBeDefined();
      expect(ICONS['skip-forward']).toBeDefined();
    });

    it('ICON-U062: has audio icons', () => {
      expect(ICONS['volume']).toBeDefined();
      expect(ICONS['volume-high']).toBeDefined();
      expect(ICONS['volume-low']).toBeDefined();
      expect(ICONS['volume-mute']).toBeDefined();
    });

    it('ICON-U063: has text formatting icons', () => {
      expect(ICONS['bold']).toBeDefined();
      expect(ICONS['italic']).toBeDefined();
      expect(ICONS['underline']).toBeDefined();
    });

    it('ICON-U064: has paint tool icons', () => {
      expect(ICONS['hand']).toBeDefined();
      expect(ICONS['pen']).toBeDefined();
      expect(ICONS['pencil']).toBeDefined();
      expect(ICONS['brush']).toBeDefined();
      expect(ICONS['eraser']).toBeDefined();
    });

    it('ICON-U065: has action icons', () => {
      expect(ICONS['undo']).toBeDefined();
      expect(ICONS['redo']).toBeDefined();
      expect(ICONS['trash']).toBeDefined();
      expect(ICONS['x']).toBeDefined();
      expect(ICONS['check']).toBeDefined();
      expect(ICONS['plus']).toBeDefined();
      expect(ICONS['minus']).toBeDefined();
    });

    it('ICON-U066: has view icons', () => {
      expect(ICONS['zoom-in']).toBeDefined();
      expect(ICONS['zoom-out']).toBeDefined();
      expect(ICONS['maximize']).toBeDefined();
      expect(ICONS['minimize']).toBeDefined();
      expect(ICONS['fit']).toBeDefined();
      expect(ICONS['eye']).toBeDefined();
      expect(ICONS['eye-off']).toBeDefined();
    });

    it('ICON-U067: has transform icons', () => {
      expect(ICONS['rotate-ccw']).toBeDefined();
      expect(ICONS['rotate-cw']).toBeDefined();
      expect(ICONS['flip-horizontal']).toBeDefined();
      expect(ICONS['flip-vertical']).toBeDefined();
      expect(ICONS['crop']).toBeDefined();
      expect(ICONS['move']).toBeDefined();
    });

    it('ICON-U068: has effects icons', () => {
      expect(ICONS['sliders']).toBeDefined();
      expect(ICONS['adjustments']).toBeDefined();
      expect(ICONS['filter']).toBeDefined();
      expect(ICONS['sparkles']).toBeDefined();
    });

    it('ICON-U069: has color icons', () => {
      expect(ICONS['palette']).toBeDefined();
      expect(ICONS['droplet']).toBeDefined();
      expect(ICONS['sun']).toBeDefined();
      expect(ICONS['moon']).toBeDefined();
      expect(ICONS['contrast']).toBeDefined();
      expect(ICONS['eyedropper']).toBeDefined();
    });

    it('ICON-U070: has scope icons', () => {
      expect(ICONS['histogram']).toBeDefined();
      expect(ICONS['waveform']).toBeDefined();
      expect(ICONS['vectorscope']).toBeDefined();
    });

    it('ICON-U071: has navigation icons', () => {
      expect(ICONS['chevron-left']).toBeDefined();
      expect(ICONS['chevron-right']).toBeDefined();
      expect(ICONS['chevron-up']).toBeDefined();
      expect(ICONS['chevron-down']).toBeDefined();
      expect(ICONS['arrow-left']).toBeDefined();
      expect(ICONS['arrow-right']).toBeDefined();
    });

    it('ICON-U072: has misc icons', () => {
      expect(ICONS['help']).toBeDefined();
      expect(ICONS['info']).toBeDefined();
      expect(ICONS['settings']).toBeDefined();
      expect(ICONS['menu']).toBeDefined();
      expect(ICONS['keyboard']).toBeDefined();
    });

    it('ICON-U073: has timeline marker icons', () => {
      expect(ICONS['marker']).toBeDefined();
      expect(ICONS['flag']).toBeDefined();
    });

    it('ICON-U074: has in/out point icons', () => {
      expect(ICONS['bracket-left']).toBeDefined();
      expect(ICONS['bracket-right']).toBeDefined();
    });

    it('ICON-U075: has guide icons', () => {
      expect(ICONS['grid']).toBeDefined();
      expect(ICONS['crosshair']).toBeDefined();
      expect(ICONS['stripes']).toBeDefined();
    });
  });

  describe('icon content validity', () => {
    const iconNames = Object.keys(ICONS) as IconName[];

    iconNames.forEach((name) => {
      it(`ICON-U100-${name}: ${name} icon has valid SVG content`, () => {
        const content = ICONS[name];
        expect(content).toBeDefined();
        expect(typeof content).toBe('string');
        expect(content.length).toBeGreaterThan(0);
      });
    });
  });
});

describe('Icon sizes work with functions', () => {
  it('ICON-U110: sm size produces correct dimensions in createIcon', () => {
    const icon = createIcon('play', 'sm');
    expect(icon.getAttribute('width')).toBe('14');
    expect(icon.getAttribute('height')).toBe('14');
  });

  it('ICON-U111: md size produces correct dimensions in getIconSvg', () => {
    const svg = getIconSvg('pause', 'md');
    expect(svg).toContain('width="16"');
    expect(svg).toContain('height="16"');
  });

  it('ICON-U112: lg size produces correct dimensions in createIcon', () => {
    const icon = createIcon('stop', 'lg');
    expect(icon.getAttribute('width')).toBe('20');
    expect(icon.getAttribute('height')).toBe('20');
  });

  it('ICON-U113: all sizes produce valid SVG elements', () => {
    const sizes: IconSize[] = ['sm', 'md', 'lg'];
    for (const size of sizes) {
      const icon = createIcon('play', size);
      expect(icon).toBeInstanceOf(SVGSVGElement);
      expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
    }
  });
});
