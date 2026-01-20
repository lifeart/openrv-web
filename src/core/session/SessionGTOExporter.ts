import { GTOBuilder, SimpleWriter } from 'gto-js';
import type { GTOData, ObjectData } from 'gto-js';
import type { Session } from './Session';
import type { PaintEngine } from '../../paint/PaintEngine';
import type { Annotation, PaintEffects, PenStroke, TextAnnotation } from '../../paint/types';
import { BrushType, LineCap, LineJoin, RV_PEN_WIDTH_SCALE, RV_TEXT_SIZE_SCALE } from '../../paint/types';

interface PaintSnapshot {
  nextId: number;
  show: boolean;
  frames: Record<number, Annotation[]>;
  effects: PaintEffects;
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
  static toGTOData(session: Session, paintEngine: PaintEngine): GTOData {
    const sessionObject = this.buildSessionObject(session, 'rv', 'defaultSequence');
    const paintObject = this.buildPaintObject(session, paintEngine, 'annotations');

    return {
      version: 4,
      objects: [sessionObject, paintObject],
    };
  }

  static buildSessionObject(session: Session, name: string, viewNode: string): ObjectData {
    const builder = new GTOBuilder();
    const playback = session.getPlaybackState();

    builder
      .object(name, 'RVSession', 4)
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

  static toText(session: Session, paintEngine: PaintEngine): string {
    const data = this.toGTOData(session, paintEngine);
    return SimpleWriter.write(data) as string;
  }

  static toBinary(session: Session, paintEngine: PaintEngine): ArrayBuffer {
    const data = this.toGTOData(session, paintEngine);
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
