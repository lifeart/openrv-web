import { SimpleWriter } from 'gto-js';
import type { GTOData, ObjectData, ComponentData, PropertyData } from 'gto-js';
import type { Session } from './Session';
import type { PaintEngine } from '../../paint/PaintEngine';
import type { Viewer } from '../../ui/components/Viewer';
import type { ScopesState } from '../../ui/components/ScopesControl';
import { SessionGTOExporter } from './SessionGTOExporter';
import type { ColorAdjustments } from '../../ui/components/ColorControls';
import { DEFAULT_TRANSFORM } from '../../ui/components/TransformControl';
import { DEFAULT_CROP_STATE } from '../../ui/components/CropControl';
import { isDefaultLensParams } from '../../transform/LensDistortion';
import type { ChannelMode } from '../../ui/components/ChannelSelect';
import type { StereoState } from '../../stereo/StereoRenderer';

interface UpdateContext {
  session: Session;
  viewer: Viewer;
  paintEngine: PaintEngine;
  scopesState?: ScopesState;
}

export class SessionGTOStore {
  private data: GTOData;

  constructor(baseData: GTOData) {
    this.data = SessionGTOStore.cloneData(baseData);
  }

  updateFromState(context: UpdateContext): void {
    const { session, viewer, paintEngine, scopesState } = context;

    this.updateSessionObject(session);
    this.updatePaintObject(session, paintEngine);
    this.updateColorAdjustments(viewer.getColorAdjustments());
    this.updateCDL(viewer.getCDL());
    this.updateTransform(viewer.getTransform());
    this.updateLens(viewer.getLensParams());
    this.updateCrop(session, viewer.getCropState());
    this.updateChannelMode(viewer.getChannelMode());
    this.updateStereo(viewer.getStereoState());
    if (scopesState) {
      this.updateScopes(scopesState);
    }
  }

  toGTOData(): GTOData {
    return this.data;
  }

  toText(): string {
    return SimpleWriter.write(this.data) as string;
  }

  toBinary(): ArrayBuffer {
    return SimpleWriter.write(this.data, { binary: true }) as ArrayBuffer;
  }

  async saveToFile(filename: string, options: { binary?: boolean } = {}): Promise<void> {
    const isBinary = options.binary ?? filename.endsWith('.gto');
    const payload = isBinary ? this.toBinary() : this.toText();
    const blob = new Blob([payload], { type: isBinary ? 'application/octet-stream' : 'text/plain' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    const extension = isBinary ? '.gto' : '.rv';
    link.download = filename.endsWith(extension) ? filename : `${filename.replace(/\.(rv|gto)$/i, '')}${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private updateSessionObject(session: Session): void {
    const existing = this.findObject('RVSession');
    const name = existing?.obj.name ?? 'rv';
    const viewNode = this.getStringProperty(existing?.obj, 'session', 'viewNode') ?? 'defaultSequence';
    const nextObject = SessionGTOExporter.buildSessionObject(session, name, viewNode);
    this.mergeObject(nextObject, 'RVSession');
  }

  private updatePaintObject(session: Session, paintEngine: PaintEngine): void {
    const existing = this.findObject('RVPaint');
    const name = existing?.obj.name ?? 'annotations';
    const nextObject = SessionGTOExporter.buildPaintObject(session, paintEngine, name);
    this.replaceObject(nextObject, 'RVPaint');
  }

  private updateColorAdjustments(adjustments: ColorAdjustments): void {
    const colorObject = this.ensureObject('RVColor', 'rvColor');
    const colorComponent = this.ensureComponent(colorObject, 'color');

    this.setProperty(colorComponent, 'exposure', 'float', 1, adjustments.exposure);
    this.setProperty(colorComponent, 'gamma', 'float', 1, adjustments.gamma);
    this.setProperty(colorComponent, 'contrast', 'float', 1, adjustments.contrast);
    this.setProperty(colorComponent, 'saturation', 'float', 1, adjustments.saturation);
    this.setProperty(colorComponent, 'offset', 'float', 1, adjustments.brightness);

    const displayObject = this.findObject('RVDisplayColor')?.obj;
    if (displayObject) {
      const displayComponent = this.ensureComponent(displayObject, 'color');
      this.setProperty(displayComponent, 'brightness', 'float', 1, adjustments.brightness);
      this.setProperty(displayComponent, 'gamma', 'float', 1, adjustments.gamma);
    }
  }

  private updateCDL(values: { slope: { r: number; g: number; b: number }; offset: { r: number; g: number; b: number }; power: { r: number; g: number; b: number }; saturation: number }): void {
    const target = this.findObject('RVColor')?.obj ?? this.findObject('RVLinearize')?.obj ?? this.ensureObject('RVColor', 'rvColor');
    const cdlComponent = this.ensureComponent(target, 'CDL');

    this.setProperty(cdlComponent, 'active', 'int', 1, 1);
    this.setProperty(cdlComponent, 'slope', 'float', 3, [[values.slope.r, values.slope.g, values.slope.b]]);
    this.setProperty(cdlComponent, 'offset', 'float', 3, [[values.offset.r, values.offset.g, values.offset.b]]);
    this.setProperty(cdlComponent, 'power', 'float', 3, [[values.power.r, values.power.g, values.power.b]]);
    this.setProperty(cdlComponent, 'saturation', 'float', 1, values.saturation);
  }

  private updateTransform(transform: { rotation: 0 | 90 | 180 | 270; flipH: boolean; flipV: boolean }): void {
    const target = this.ensureObject('RVTransform2D', 'rvTransform');
    const component = this.ensureComponent(target, 'transform');
    const isDefault = transform.rotation === DEFAULT_TRANSFORM.rotation && transform.flipH === DEFAULT_TRANSFORM.flipH && transform.flipV === DEFAULT_TRANSFORM.flipV;

    this.setProperty(component, 'active', 'int', 1, isDefault ? 0 : 1);
    this.setProperty(component, 'rotate', 'float', 1, transform.rotation);
    this.setProperty(component, 'flip', 'int', 1, transform.flipV ? 1 : 0);
    this.setProperty(component, 'flop', 'int', 1, transform.flipH ? 1 : 0);
  }

  private updateLens(params: { k1: number; k2: number; centerX: number; centerY: number; scale: number }): void {
    const target = this.ensureObject('RVLensWarp', 'rvLensWarp');
    const nodeComponent = this.ensureComponent(target, 'node');
    const warpComponent = this.ensureComponent(target, 'warp');
    const isDefault = isDefaultLensParams(params);

    this.setProperty(nodeComponent, 'active', 'int', 1, isDefault ? 0 : 1);
    this.setProperty(warpComponent, 'k1', 'float', 1, params.k1);
    this.setProperty(warpComponent, 'k2', 'float', 1, params.k2);
    this.setProperty(warpComponent, 'center', 'float', 2, [[params.centerX + 0.5, params.centerY + 0.5]]);
  }

  private updateCrop(session: Session, crop: { enabled: boolean; region: { x: number; y: number; width: number; height: number } }): void {
    const target = this.ensureObject('RVFormat', 'rvFormat');
    const component = this.ensureComponent(target, 'crop');

    const source = session.currentSource;
    const width = source?.width ?? 0;
    const height = source?.height ?? 0;

    const region = crop.region ?? DEFAULT_CROP_STATE.region;
    const xmin = width > 0 ? region.x * width : 0;
    const ymin = height > 0 ? region.y * height : 0;
    const xmax = width > 0 ? (region.x + region.width) * width : width;
    const ymax = height > 0 ? (region.y + region.height) * height : height;

    this.setProperty(component, 'active', 'int', 1, crop.enabled ? 1 : 0);
    this.setProperty(component, 'xmin', 'float', 1, xmin);
    this.setProperty(component, 'ymin', 'float', 1, ymin);
    this.setProperty(component, 'xmax', 'float', 1, xmax);
    this.setProperty(component, 'ymax', 'float', 1, ymax);
  }

  private updateChannelMode(channel: ChannelMode): void {
    const channelMap: Record<ChannelMode, number> = {
      red: 0,
      green: 1,
      blue: 2,
      alpha: 3,
      rgb: 4,
      luminance: 5,
    };

    const target = this.ensureObject('ChannelSelect', 'channelSelect');
    const nodeComponent = this.ensureComponent(target, 'node');
    const paramsComponent = this.ensureComponent(target, 'parameters');

    this.setProperty(nodeComponent, 'active', 'int', 1, 1);
    this.setProperty(paramsComponent, 'channel', 'int', 1, channelMap[channel] ?? 4);
  }

  private updateStereo(stereo: StereoState): void {
    const target = this.ensureObject('RVDisplayStereo', 'rvStereo');
    const component = this.ensureComponent(target, 'stereo');

    const typeMap: Record<StereoState['mode'], string> = {
      off: 'off',
      'side-by-side': 'pair',
      mirror: 'mirror',
      'over-under': 'vsqueezed',
      anaglyph: 'anaglyph',
      'anaglyph-luminance': 'lumanaglyph',
      checkerboard: 'checker',
      scanline: 'scanline',
    };

    this.setProperty(component, 'type', 'string', 1, typeMap[stereo.mode] ?? 'off');
    this.setProperty(component, 'swap', 'int', 1, stereo.eyeSwap ? 1 : 0);
    this.setProperty(component, 'relativeOffset', 'float', 1, stereo.offset / 100);
  }

  private updateScopes(scopes: ScopesState): void {
    const mappings: Array<{ protocol: string; key: keyof ScopesState; name: string }> = [
      { protocol: 'RVHistogram', key: 'histogram', name: 'histNode' },
      { protocol: 'RVWaveform', key: 'waveform', name: 'waveNode' },
      { protocol: 'RVVectorscope', key: 'vectorscope', name: 'vectorNode' },
    ];

    for (const { protocol, key, name } of mappings) {
      if (!scopes[key]) {
        const existing = this.findObject(protocol)?.obj;
        if (existing) {
          const nodeComponent = this.ensureComponent(existing, 'node');
          this.setProperty(nodeComponent, 'active', 'int', 1, 0);
        }
        continue;
      }

      const target = this.findObject(protocol)?.obj ?? this.ensureObject(protocol, name);
      const nodeComponent = this.ensureComponent(target, 'node');
      this.setProperty(nodeComponent, 'active', 'int', 1, 1);
    }
  }

  private findObject(protocol: string): { obj: ObjectData; index: number } | null {
    const index = this.data.objects.findIndex((obj) => obj.protocol === protocol);
    if (index === -1) return null;
    return { obj: this.data.objects[index]!, index };
  }

  private ensureObject(protocol: string, name: string): ObjectData {
    const found = this.findObject(protocol);
    if (found) return found.obj;

    const obj: ObjectData = {
      name,
      protocol,
      protocolVersion: 1,
      components: {},
    };

    this.data.objects.push(obj);
    return obj;
  }

  private mergeObject(nextObject: ObjectData, protocol: string): void {
    const found = this.findObject(protocol);
    if (!found) {
      this.data.objects.push(nextObject);
      return;
    }

    found.obj.components = { ...found.obj.components, ...nextObject.components };
    found.obj.protocolVersion = nextObject.protocolVersion;
    found.obj.name = nextObject.name;
  }

  private replaceObject(nextObject: ObjectData, protocol: string): void {
    const found = this.findObject(protocol);
    if (!found) {
      this.data.objects.push(nextObject);
      return;
    }

    this.data.objects[found.index] = nextObject;
  }

  private ensureComponent(object: ObjectData, name: string, interpretation = ''): ComponentData {
    if (!object.components[name]) {
      object.components[name] = { interpretation, properties: {} };
    }
    if (!object.components[name].interpretation) {
      object.components[name].interpretation = interpretation;
    }
    return object.components[name];
  }

  private setProperty(component: ComponentData, name: string, type: string, width: number, data: unknown, interpretation = ''): void {
    component.properties[name] = this.createProperty(type, width, data, interpretation);
  }

  private createProperty(type: string, width: number, data: unknown, interpretation: string): PropertyData {
    const normalized = this.normalizeData(data, width);
    const size = Array.isArray(normalized) ? normalized.length : 1;

    return {
      type,
      size,
      width,
      interpretation,
      data: normalized,
    };
  }

  private normalizeData(data: unknown, width: number): unknown[] {
    if (Array.isArray(data)) {
      if (data.length === 0) return [];
      if (Array.isArray(data[0])) return data as unknown[];
      if (width > 1) {
        const grouped: unknown[] = [];
        for (let i = 0; i < data.length; i += width) {
          grouped.push((data as unknown[]).slice(i, i + width));
        }
        return grouped;
      }
      return data as unknown[];
    }

    return [data];
  }

  private getStringProperty(object: ObjectData | undefined, componentName: string, propertyName: string): string | null {
    if (!object) return null;
    const component = object.components[componentName];
    const property = component?.properties[propertyName];
    if (!property) return null;

    const value = property.data?.[0];
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return null;
  }

  private static cloneData(data: GTOData): GTOData {
    return JSON.parse(JSON.stringify(data)) as GTOData;
  }
}
