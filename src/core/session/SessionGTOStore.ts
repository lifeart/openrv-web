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

    this.updateSessionObject(session, paintEngine);
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

  private updateSessionObject(session: Session, paintEngine: PaintEngine): void {
    const existing = this.findObject('RVSession');
    const name = existing?.obj.name ?? 'rv';
    const viewNode = this.getStringProperty(existing?.obj, 'session', 'viewNode') ?? 'defaultSequence';
    const nextObject = SessionGTOExporter.buildSessionObject(session, paintEngine, name, viewNode);
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

  private updateTransform(transform: {
    rotation: 0 | 90 | 180 | 270;
    flipH: boolean;
    flipV: boolean;
    scale: { x: number; y: number };
    translate: { x: number; y: number };
  }): void {
    const target = this.ensureObject('RVTransform2D', 'rvTransform');
    const component = this.ensureComponent(target, 'transform');

    // Check if transform is at default values
    const isDefault =
      transform.rotation === DEFAULT_TRANSFORM.rotation &&
      transform.flipH === DEFAULT_TRANSFORM.flipH &&
      transform.flipV === DEFAULT_TRANSFORM.flipV &&
      transform.scale.x === DEFAULT_TRANSFORM.scale.x &&
      transform.scale.y === DEFAULT_TRANSFORM.scale.y &&
      transform.translate.x === DEFAULT_TRANSFORM.translate.x &&
      transform.translate.y === DEFAULT_TRANSFORM.translate.y;

    this.setProperty(component, 'active', 'int', 1, isDefault ? 0 : 1);
    this.setProperty(component, 'rotate', 'float', 1, transform.rotation);
    this.setProperty(component, 'flip', 'int', 1, transform.flipV ? 1 : 0);
    this.setProperty(component, 'flop', 'int', 1, transform.flipH ? 1 : 0);
    this.setProperty(component, 'scale', 'float', 2, [[transform.scale.x, transform.scale.y]]);
    this.setProperty(component, 'translate', 'float', 2, [[transform.translate.x, transform.translate.y]]);
  }

  private updateLens(params: {
    k1: number;
    k2: number;
    k3?: number;
    p1?: number;
    p2?: number;
    centerX: number;
    centerY: number;
    scale: number;
    model?: 'brown' | 'opencv' | 'pfbarrel' | '3de4_radial_standard' | '3de4_anamorphic';
    pixelAspectRatio?: number;
    fx?: number;
    fy?: number;
    cropRatioX?: number;
    cropRatioY?: number;
  }): void {
    const target = this.ensureObject('RVLensWarp', 'rvLensWarp');
    const nodeComponent = this.ensureComponent(target, 'node');
    const warpComponent = this.ensureComponent(target, 'warp');
    const isDefault = isDefaultLensParams(params);

    this.setProperty(nodeComponent, 'active', 'int', 1, isDefault ? 0 : 1);
    // Radial distortion
    this.setProperty(warpComponent, 'k1', 'float', 1, params.k1);
    this.setProperty(warpComponent, 'k2', 'float', 1, params.k2);
    if (params.k3 !== undefined) {
      this.setProperty(warpComponent, 'k3', 'float', 1, params.k3);
    }
    // Tangential distortion
    if (params.p1 !== undefined) {
      this.setProperty(warpComponent, 'p1', 'float', 1, params.p1);
    }
    if (params.p2 !== undefined) {
      this.setProperty(warpComponent, 'p2', 'float', 1, params.p2);
    }
    // Center point
    this.setProperty(warpComponent, 'center', 'float', 2, [[params.centerX + 0.5, params.centerY + 0.5]]);
    // Model
    if (params.model !== undefined) {
      this.setProperty(warpComponent, 'model', 'string', 1, params.model);
    }
    // Pixel aspect ratio
    if (params.pixelAspectRatio !== undefined) {
      this.setProperty(warpComponent, 'pixelAspectRatio', 'float', 1, params.pixelAspectRatio);
    }
    // Focal length
    if (params.fx !== undefined) {
      this.setProperty(warpComponent, 'fx', 'float', 1, params.fx);
    }
    if (params.fy !== undefined) {
      this.setProperty(warpComponent, 'fy', 'float', 1, params.fy);
    }
    // Crop ratios
    if (params.cropRatioX !== undefined) {
      this.setProperty(warpComponent, 'cropRatioX', 'float', 1, params.cropRatioX);
    }
    if (params.cropRatioY !== undefined) {
      this.setProperty(warpComponent, 'cropRatioY', 'float', 1, params.cropRatioY);
    }
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

  /**
   * Update linearization settings in the GTO data
   */
  updateLinearize(settings: {
    active?: boolean;
    sRGB2linear?: boolean;
    rec709ToLinear?: boolean;
    logtype?: number;
    fileGamma?: number;
    alphaType?: number;
    yuv?: boolean;
    invert?: boolean;
    ignoreChromaticities?: boolean;
    cineon?: {
      whiteCodeValue?: number;
      blackCodeValue?: number;
      breakPointValue?: number;
    };
  }): void {
    const target = this.ensureObject('RVLinearize', 'rvLinearize');

    // Node component
    const nodeComponent = this.ensureComponent(target, 'node');
    this.setProperty(nodeComponent, 'active', 'int', 1, settings.active !== false ? 1 : 0);

    // Color component
    const colorComponent = this.ensureComponent(target, 'color');
    this.setProperty(colorComponent, 'active', 'int', 1, 1);

    if (settings.sRGB2linear !== undefined) {
      this.setProperty(colorComponent, 'sRGB2linear', 'int', 1, settings.sRGB2linear ? 1 : 0);
    }
    if (settings.rec709ToLinear !== undefined) {
      this.setProperty(colorComponent, 'Rec709ToLinear', 'int', 1, settings.rec709ToLinear ? 1 : 0);
    }
    if (settings.logtype !== undefined) {
      this.setProperty(colorComponent, 'logtype', 'int', 1, settings.logtype);
    }
    if (settings.fileGamma !== undefined) {
      this.setProperty(colorComponent, 'fileGamma', 'float', 1, settings.fileGamma);
    }
    if (settings.alphaType !== undefined) {
      this.setProperty(colorComponent, 'alphaType', 'int', 1, settings.alphaType);
    }
    if (settings.yuv !== undefined) {
      this.setProperty(colorComponent, 'YUV', 'int', 1, settings.yuv ? 1 : 0);
    }
    if (settings.invert !== undefined) {
      this.setProperty(colorComponent, 'invert', 'int', 1, settings.invert ? 1 : 0);
    }
    if (settings.ignoreChromaticities !== undefined) {
      this.setProperty(colorComponent, 'ignoreChromaticities', 'int', 1, settings.ignoreChromaticities ? 1 : 0);
    }

    // Cineon component
    if (settings.cineon) {
      const cineonComponent = this.ensureComponent(target, 'cineon');
      if (settings.cineon.whiteCodeValue !== undefined) {
        this.setProperty(cineonComponent, 'whiteCodeValue', 'int', 1, settings.cineon.whiteCodeValue);
      }
      if (settings.cineon.blackCodeValue !== undefined) {
        this.setProperty(cineonComponent, 'blackCodeValue', 'int', 1, settings.cineon.blackCodeValue);
      }
      if (settings.cineon.breakPointValue !== undefined) {
        this.setProperty(cineonComponent, 'breakPointValue', 'int', 1, settings.cineon.breakPointValue);
      }
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
