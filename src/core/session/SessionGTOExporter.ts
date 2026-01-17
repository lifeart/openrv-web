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
      .int('marks', playback.marks)
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
          this.writeTextComponent(paintObject, componentName, annotation, aspectRatio);
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
    const payload = isBinary
      ? this.toBinary(session, paintEngine)
      : this.toText(session, paintEngine);
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

  private static writePenComponent(
    paintObject: ReturnType<GTOBuilder['object']>,
    componentName: string,
    annotation: PenStroke,
    aspectRatio: number
  ): void {
    const points = annotation.points.map((point) => [
      (point.x * 2 - 1) * aspectRatio,
      point.y * 2 - 1,
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

  private static writeTextComponent(
    paintObject: ReturnType<GTOBuilder['object']>,
    componentName: string,
    annotation: TextAnnotation,
    aspectRatio: number
  ): void {
    const position: [number, number] = [
      (annotation.position.x * 2 - 1) * aspectRatio,
      annotation.position.y * 2 - 1,
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
