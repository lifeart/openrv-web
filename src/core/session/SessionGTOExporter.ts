import { GTOBuilder, SimpleWriter } from 'gto-js';
import type { GTOData, ObjectData } from 'gto-js';
import type { Session, MediaSource } from './Session';
import type { PaintEngine } from '../../paint/PaintEngine';
import type { Annotation, PaintEffects, PenStroke, TextAnnotation } from '../../paint/types';
import { BrushType, LineCap, LineJoin, RV_PEN_WIDTH_SCALE, RV_TEXT_SIZE_SCALE } from '../../paint/types';

interface PaintSnapshot {
  nextId: number;
  show: boolean;
  frames: Record<number, Annotation[]>;
  effects: PaintEffects;
}

/**
 * Options for session export
 */
export interface SessionExportOptions {
  /** Session name (defaults to 'rv') */
  name?: string;
  /** Session comment/notes */
  comment?: string;
  /** Whether to include source groups (default: true) */
  includeSources?: boolean;
}

/**
 * Generates a zero-padded source group name (e.g., 'sourceGroup000000')
 */
export function generateSourceGroupName(index: number): string {
  return `sourceGroup${index.toString().padStart(6, '0')}`;
}

/**
 * EDL (Edit Decision List) data for sequence export
 */
export interface EDLData {
  /** Global frame numbers where each cut starts */
  frames: number[];
  /** Source index for each cut */
  sources: number[];
  /** Source in-points for each cut */
  inPoints: number[];
  /** Source out-points for each cut */
  outPoints: number[];
}

/**
 * Stack group settings for export
 */
export interface StackGroupSettings {
  /** Global composite type (replace, over, add, etc.) */
  compositeType?: string;
  /** Stack mode (replace, wipe, etc.) */
  mode?: string;
  /** Wipe X position (0-1) */
  wipeX?: number;
  /** Wipe Y position (0-1) */
  wipeY?: number;
  /** Wipe angle in degrees */
  wipeAngle?: number;
  /** Index of input to use for audio */
  chosenAudioInput?: number;
  /** Policy when frame is out of range: 'hold', 'black', 'error' */
  outOfRangePolicy?: string;
  /** Whether to align start frames of all inputs */
  alignStartFrames?: boolean;
  /** Whether to use strict frame range checking */
  strictFrameRanges?: boolean;
  /** Per-layer blend modes (indexed by input) */
  layerBlendModes?: string[];
  /** Per-layer opacities (indexed by input, 0-1) */
  layerOpacities?: number[];
}

export interface GTOComponentDTO {
  property(name: string): {
    value(): unknown;
  };
}

export interface GTOProperty {
  name: string;
  value: unknown;
}

export interface GTOComponent {
  name: string;
  properties: GTOProperty[];
}

export class SessionGTOExporter {
  /**
   * Generate complete GTO data for a new session export
   * Creates RVSession, source groups, sequence, connections, and paint objects
   */
  static toGTOData(
    session: Session,
    paintEngine: PaintEngine,
    options: SessionExportOptions = {}
  ): GTOData {
    const { name = 'rv', comment = '', includeSources = true } = options;
    const viewNode = 'defaultSequence';

    const objects: ObjectData[] = [];
    const sourceGroupNames: string[] = [];

    // 1. Build RVSession object
    const sessionObject = this.buildSessionObject(session, name, viewNode, comment);
    objects.push(sessionObject);

    // 2. Build source groups for each media source
    if (includeSources && session.allSources.length > 0) {
      for (let i = 0; i < session.allSources.length; i++) {
        const source = session.allSources[i];
        if (!source) continue;

        const groupName = generateSourceGroupName(i);
        sourceGroupNames.push(groupName);

        const sourceObjects = this.buildSourceGroupObjects(source, groupName);
        objects.push(...sourceObjects);
      }
    }

    // 3. Build default sequence group
    const sequenceObjects = this.buildSequenceGroupObjects('defaultSequence', session);
    objects.push(...sequenceObjects);

    // 4. Build connection object
    const connectionObject = this.buildConnectionObject(sourceGroupNames, viewNode);
    objects.push(connectionObject);

    // 5. Build paint/annotations object
    const paintObject = this.buildPaintObject(session, paintEngine, 'annotations');
    objects.push(paintObject);

    return {
      version: 4,
      objects,
    };
  }

  /**
   * Build the connection object that defines graph topology
   * Connects sources -> sequence and lists top-level viewable nodes
   */
  static buildConnectionObject(sourceGroupNames: string[], viewNode: string): ObjectData {
    const builder = new GTOBuilder();

    builder
      .object('connections', 'connection', 1)
      .component('evaluation')
      // lhs -> rhs: each source connects to the sequence
      .string('lhs', sourceGroupNames)
      .string('rhs', sourceGroupNames.map(() => viewNode))
      .end()
      .component('top')
      .string('nodes', [viewNode])
      .end()
      .end();

    return builder.build().objects[0]!;
  }

  /**
   * Build source group objects (RVSourceGroup + RVFileSource)
   * Returns array of objects for a single source
   */
  static buildSourceGroupObjects(source: MediaSource, groupName: string): ObjectData[] {
    const objects: ObjectData[] = [];
    const sourceName = `${groupName}_source`;

    // 1. RVSourceGroup container
    const groupBuilder = new GTOBuilder();
    groupBuilder
      .object(groupName, 'RVSourceGroup', 1)
      .component('ui')
      .string('name', source.name || groupName)
      .end()
      .end();
    objects.push(groupBuilder.build().objects[0]!);

    // 2. RVFileSource (or RVImageSource based on type)
    const protocol = source.type === 'image' ? 'RVImageSource' : 'RVFileSource';
    const sourceBuilder = new GTOBuilder();

    // Build the source object - chain must be continuous
    const sourceObject = sourceBuilder.object(sourceName, protocol, 1);

    sourceObject
      .component('media')
      .string('movie', source.url)
      .string('name', source.name || '')
      .end();

    sourceObject
      .component('group')
      .float('fps', source.fps || 24.0)
      .float('volume', 1.0)
      .float('audioOffset', 0.0)
      .float('balance', 0.0)
      .float('crossover', 0.0)
      .int('noMovieAudio', 0)
      .int('rangeOffset', 0)
      .end();

    sourceObject
      .component('cut')
      // Use MIN_INT/MAX_INT to indicate full media range
      .int('in', -2147483648)
      .int('out', 2147483647)
      .end();

    sourceObject
      .component('request')
      .int('readAllChannels', 0)
      .end();

    // Add proxy/image dimensions if available
    if (source.width > 0 && source.height > 0) {
      sourceObject
        .component('proxy')
        .int2('size', [[source.width, source.height]])
        .end();
    }

    sourceObject.end();
    objects.push(sourceBuilder.build().objects[0]!);

    return objects;
  }

  /**
   * Build sequence group objects (RVSequenceGroup + RVSequence)
   * @param groupName - Name for the sequence group
   * @param session - Session instance
   * @param edl - Optional EDL data (if not using auto-EDL)
   */
  static buildSequenceGroupObjects(
    groupName: string,
    session: Session,
    edl?: EDLData
  ): ObjectData[] {
    const objects: ObjectData[] = [];
    const sequenceName = `${groupName}_sequence`;

    // 1. RVSequenceGroup container
    const groupBuilder = new GTOBuilder();
    groupBuilder
      .object(groupName, 'RVSequenceGroup', 1)
      .component('ui')
      .string('name', 'Default Sequence')
      .end()
      .end();
    objects.push(groupBuilder.build().objects[0]!);

    // 2. RVSequence node
    const sequenceBuilder = new GTOBuilder();
    const playback = session.getPlaybackState();

    const sequenceObject = sequenceBuilder.object(sequenceName, 'RVSequence', 1);

    sequenceObject
      .component('output')
      .float('fps', playback.fps || 24.0)
      .int('autoSize', 1)
      .int('interactiveSize', 1)
      .end();

    sequenceObject
      .component('mode')
      .int('autoEDL', edl ? 0 : 1)
      .int('useCutInfo', 1)
      .int('supportReversedOrderBlending', 1)
      .end();

    // Add EDL component if provided
    if (edl && edl.frames.length > 0) {
      sequenceObject
        .component('edl')
        .int('frame', edl.frames)
        .int('source', edl.sources)
        .int('in', edl.inPoints)
        .int('out', edl.outPoints)
        .end();
    }

    sequenceObject.end();
    objects.push(sequenceBuilder.build().objects[0]!);

    return objects;
  }

  /**
   * Build stack group objects (RVStackGroup + RVStack)
   * @param groupName - Name for the stack group
   * @param settings - Optional per-layer compositing settings
   */
  static buildStackGroupObjects(
    groupName: string,
    settings?: StackGroupSettings
  ): ObjectData[] {
    const objects: ObjectData[] = [];
    const stackName = `${groupName}_stack`;

    // 1. RVStackGroup container
    const groupBuilder = new GTOBuilder();
    groupBuilder
      .object(groupName, 'RVStackGroup', 1)
      .component('ui')
      .string('name', 'Stack')
      .end()
      .end();
    objects.push(groupBuilder.build().objects[0]!);

    // 2. RVStack node with compositing settings
    const stackBuilder = new GTOBuilder();
    const stackObject = stackBuilder.object(stackName, 'RVStack', 1);

    // Stack component (global composite mode)
    stackObject
      .component('stack')
      .string('composite', settings?.compositeType ?? 'replace')
      .string('mode', settings?.mode ?? 'replace')
      .end();

    // Wipe component
    stackObject
      .component('wipe')
      .float('x', settings?.wipeX ?? 0.5)
      .float('y', settings?.wipeY ?? 0.5)
      .float('angle', settings?.wipeAngle ?? 0)
      .end();

    // Output component
    stackObject
      .component('output')
      .int('chosenAudioInput', settings?.chosenAudioInput ?? 0)
      .string('outOfRangePolicy', settings?.outOfRangePolicy ?? 'hold')
      .end();

    // Mode component
    stackObject
      .component('mode')
      .int('alignStartFrames', settings?.alignStartFrames ? 1 : 0)
      .int('strictFrameRanges', settings?.strictFrameRanges ? 1 : 0)
      .end();

    // Per-layer composite settings (if provided)
    if (settings?.layerBlendModes && settings.layerBlendModes.length > 0) {
      stackObject
        .component('composite')
        .string('type', settings.layerBlendModes)
        .end();
    }

    if (settings?.layerOpacities && settings.layerOpacities.length > 0) {
      // Add opacities to output component - need to rebuild
      // For simplicity, we add it as a separate property
      const outputComp = stackObject.component('layerOutput');
      outputComp.float('opacity', settings.layerOpacities).end();
    }

    stackObject.end();
    objects.push(stackBuilder.build().objects[0]!);

    return objects;
  }

  /**
   * Build the RVSession object with all session properties
   * @param session - Session instance
   * @param name - Object name (typically 'rv' or session name)
   * @param viewNode - Name of the default view node
   * @param comment - Optional session comment/notes
   */
  static buildSessionObject(
    session: Session,
    name: string,
    viewNode: string,
    comment = ''
  ): ObjectData {
    const builder = new GTOBuilder();
    const playback = session.getPlaybackState();

    builder
      .object(name, 'RVSession', 1)
      .component('session')
      .string('viewNode', viewNode)
      .int2('range', [[playback.inPoint, playback.outPoint]])
      .int2('region', [[playback.inPoint, playback.outPoint]])
      .float('fps', playback.fps)
      .int('realtime', 0)
      .int('inc', 1)
      .int('frame', playback.currentFrame)
      .int('currentFrame', playback.currentFrame)
      .int('marks', playback.marks.map(m => m.frame))
      .int('version', 2)
      .end()
      .component('root')
      .string('name', name)
      .string('comment', comment)
      .end()
      .component('matte')
      .int('show', 0)
      .float('aspect', 1.78)
      .float('opacity', 0.66)
      .float('heightVisible', -1.0)
      .float2('centerPoint', [[0, 0]])
      .end()
      .component('paintEffects')
      .int('hold', 0)
      .int('ghost', 0)
      .int('ghostBefore', 5)
      .int('ghostAfter', 5)
      .end()
      .end();

    return builder.build().objects[0]!;
  }

  static buildPaintObject(session: Session, paintEngine: PaintEngine, name: string): ObjectData {
    const builder = new GTOBuilder();
    const aspectRatio = this.getAspectRatio(session);
    const paintJSON = paintEngine.toJSON() as PaintSnapshot;

    const paintObject = builder.object(name, 'RVPaint', 3);
    paintObject
      .component('paint')
      .int('nextId', paintJSON.nextId)
      .int('nextAnnotationId', 0)
      .int('show', paintJSON.show ? 1 : 0)
      .int('ghost', paintJSON.effects.ghost ? 1 : 0)
      .int('hold', paintJSON.effects.hold ? 1 : 0)
      .int('ghostBefore', paintJSON.effects.ghostBefore)
      .int('ghostAfter', paintJSON.effects.ghostAfter)
      .string('exclude', [])
      .string('include', [])
      .end();

    const frameOrder = new Map<number, string[]>();
    const frames = Object.entries(paintJSON.frames).sort(([a], [b]) => Number(a) - Number(b));

    for (const [frameKey, annotations] of frames) {
      const frame = Number(frameKey);
      for (const annotation of annotations) {
        const componentName = this.annotationComponentName(annotation, frame);
        if (!frameOrder.has(frame)) {
          frameOrder.set(frame, []);
        }
        frameOrder.get(frame)!.push(componentName);

        if (annotation.type === 'pen') {
          this.writePenComponent(paintObject, componentName, annotation, aspectRatio);
        } else {
          this.writeTextComponent(paintObject, componentName, annotation as TextAnnotation, aspectRatio);
        }
      }
    }

    for (const [frame, order] of frameOrder) {
      paintObject
        .component(`frame:${frame}`)
        .string('order', order)
        .end();
    }

    paintObject.end();

    return builder.build().objects[0]!;
  }

  static toText(
    session: Session,
    paintEngine: PaintEngine,
    options: SessionExportOptions = {}
  ): string {
    const data = this.toGTOData(session, paintEngine, options);
    return SimpleWriter.write(data) as string;
  }

  static toBinary(
    session: Session,
    paintEngine: PaintEngine,
    options: SessionExportOptions = {}
  ): ArrayBuffer {
    const data = this.toGTOData(session, paintEngine, options);
    return SimpleWriter.write(data, { binary: true }) as ArrayBuffer;
  }

  static async saveToFile(
    session: Session,
    paintEngine: PaintEngine,
    filename = 'session.rv',
    options: { binary?: boolean } = {}
  ): Promise<void> {
    const isBinary = options.binary ?? filename.endsWith('.gto');
    
    let data: GTOData;
    if (session.gtoData) {
        console.log('Patching existing GTO data for export');
        data = this.updateGTOData(session.gtoData, session, paintEngine);
    } else {
        console.log('Generating new GTO data for export');
        data = this.toGTOData(session, paintEngine);
    }

    const payload = isBinary
      ? SimpleWriter.write(data, { binary: true })
      : SimpleWriter.write(data);
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

  /**
   * Update existing GTO data with current session state
   * (Preserves original file structure and unsupported nodes)
   */
  static updateGTOData(originalData: GTOData, session: Session, paintEngine: PaintEngine): GTOData {
    // Deep clone to avoid mutating original
    const data: GTOData = JSON.parse(JSON.stringify(originalData));
    
    // Create new paint object using current state
    const currentPaintObject = this.buildPaintObject(session, paintEngine, 'annotations');
    
    // Index objects by name/protocol for easier access
    for (const obj of data.objects) {
      // 1. Update RVSession info
      if (obj.protocol === 'RVSession') {
        const sessionComp = this.findOrAddComponent(obj, 'session');
        const playback = session.getPlaybackState();
        
        this.updateProperty(sessionComp, 'frame', playback.currentFrame);
        this.updateProperty(sessionComp, 'currentFrame', playback.currentFrame);
        this.updateProperty(sessionComp, 'range', [playback.inPoint, playback.outPoint]);
        this.updateProperty(sessionComp, 'region', [playback.inPoint, playback.outPoint]);
        this.updateProperty(sessionComp, 'fps', playback.fps);
        
        if (playback.marks.length > 0) {
           this.updateProperty(sessionComp, 'marks', playback.marks.map(m => m.frame));
        } else {
            // Remove marks property if empty? Or set to empty array?
             this.updateProperty(sessionComp, 'marks', []);
        }
      }
      
      // 2. Update RVFileSource paths
      if (obj.protocol === 'RVFileSource') {
        const node = session.graph?.getNode(obj.name);
        if (node && node.type === 'RVFileSource') {
          const originalUrl = node.properties.getValue<string>('originalUrl');
          if (originalUrl) {
             const mediaComp = this.findOrAddComponent(obj, 'media');
             this.updateProperty(mediaComp, 'movie', originalUrl);
          }
        }
      }
    }
    
    // 3. Replace RVPaint object
    // Find index of existing paint object
    const paintIndex = data.objects.findIndex(o => o.protocol === 'RVPaint');
    if (paintIndex !== -1) {
      data.objects[paintIndex] = currentPaintObject;
    } else {
      data.objects.push(currentPaintObject);
    }

    return data;
  }

  protected static findOrAddComponent(obj: ObjectData, name: string): GTOComponent {
    if (!obj.components) {
      obj.components = {};
    }
    const components = (obj.components as unknown) as Record<string, GTOComponent>;
    let comp = components[name];
    if (!comp) {
      comp = { name, properties: [] };
      components[name] = comp;
    }
    return comp;
  }

  protected static updateProperty(comp: GTOComponent, name: string, value: unknown): void {
    const prop = comp.properties.find(p => p.name === name);
    if (prop) {
      prop.value = value;
    } else {
      // Simple type inference for new properties (limited support)
      // Ideally we shouldn't be adding new properties to unknown components often
      // But for RVSession we know the types
      comp.properties.push({ name, value }); 
    }
  }
  private static getAspectRatio(session: Session): number {
    const source = session.allSources[0];
    if (!source || source.height === 0) {
      return 1;
    }
    return source.width / source.height;
  }

  private static annotationComponentName(annotation: Annotation, frame: number): string {
    const user = annotation.user?.replace(/:/g, '_') || 'user';
    const prefix = annotation.type === 'pen' ? 'pen' : 'text';
    return `${prefix}:${annotation.id}:${frame}:${user}`;
  }

  protected static writePenComponent(
    paintObject: ReturnType<GTOBuilder['object']>,
    componentName: string,
    annotation: PenStroke,
    aspectRatio: number
  ): void {
    const points = annotation.points.map((point) => [
      (point.x - 0.5) * aspectRatio,
      point.y - 0.5,
    ]);

    const widths = Array.isArray(annotation.width)
      ? annotation.width
      : [annotation.width];
    const normalizedWidths = widths.map((value) => value / RV_PEN_WIDTH_SCALE);

    paintObject
      .component(componentName)
      .float4('color', [annotation.color])
      .float('width', normalizedWidths)
      .string('brush', annotation.brush === BrushType.Gaussian ? 'gaussian' : 'circle')
      .float2('points', points)
      .int('join', this.mapLineJoin(annotation.join))
      .int('cap', this.mapLineCap(annotation.cap))
      .int('splat', annotation.splat ? 1 : 0)
      .end();
  }

  protected static writeTextComponent(
    paintObject: ReturnType<GTOBuilder['object']>,
    componentName: string,
    annotation: TextAnnotation,
    aspectRatio: number
  ): void {
    const position: [number, number] = [
      (annotation.position.x - 0.5) * aspectRatio,
      annotation.position.y - 0.5,
    ];

    paintObject
      .component(componentName)
      .float2('position', [position])
      .float4('color', [annotation.color])
      .string('text', annotation.text)
      .float('size', annotation.size / RV_TEXT_SIZE_SCALE)
      .float('scale', annotation.scale)
      .float('rotation', annotation.rotation)
      .float('spacing', annotation.spacing)
      .string('font', annotation.font)
      .end();
  }

  private static mapLineJoin(join: LineJoin): number {
    switch (join) {
      case LineJoin.Miter:
        return 0;
      case LineJoin.Bevel:
        return 2;
      default:
        return 3;
    }
  }

  private static mapLineCap(cap: LineCap): number {
    switch (cap) {
      case LineCap.NoCap:
        return 0;
      case LineCap.Square:
        return 2;
      default:
        return 1;
    }
  }
}
