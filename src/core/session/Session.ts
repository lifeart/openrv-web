import { SimpleReader, GTODTO } from 'gto-js';
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import {
  Annotation,
  PenStroke,
  TextAnnotation,
  BrushType,
  LineJoin,
  LineCap,
  StrokeMode,
  TextOrigin,
  PaintEffects,
} from '../../paint/types';

export interface ParsedAnnotations {
  annotations: Annotation[];
  effects?: Partial<PaintEffects>;
}

export interface SessionEvents extends EventMap {
  frameChanged: number;
  playbackChanged: boolean;
  sourceLoaded: MediaSource;
  sessionLoaded: void;
  durationChanged: number;
  inOutChanged: { inPoint: number; outPoint: number };
  annotationsLoaded: ParsedAnnotations;
}

export type LoopMode = 'once' | 'loop' | 'pingpong';
export type MediaType = 'image' | 'video' | 'sequence';

export interface MediaSource {
  type: MediaType;
  name: string;
  url: string;
  width: number;
  height: number;
  duration: number; // in frames
  fps: number;
  element?: HTMLImageElement | HTMLVideoElement;
}

export class Session extends EventEmitter<SessionEvents> {
  private _currentFrame = 1;
  private _inPoint = 1;
  private _outPoint = 1;
  private _fps = 24;
  private _isPlaying = false;
  private _playDirection = 1;
  private _loopMode: LoopMode = 'loop';
  private _marks = new Set<number>();

  private lastFrameTime = 0;
  private frameAccumulator = 0;

  // Media sources
  private sources: MediaSource[] = [];
  private _currentSourceIndex = 0;

  constructor() {
    super();
  }

  get currentFrame(): number {
    return this._currentFrame;
  }

  set currentFrame(frame: number) {
    const clamped = Math.max(this._inPoint, Math.min(this._outPoint, Math.round(frame)));
    if (clamped !== this._currentFrame) {
      this._currentFrame = clamped;
      this.syncVideoToFrame();
      this.emit('frameChanged', this._currentFrame);
    }
  }

  get inPoint(): number {
    return this._inPoint;
  }

  get outPoint(): number {
    return this._outPoint;
  }

  get fps(): number {
    return this._fps;
  }

  set fps(value: number) {
    this._fps = Math.max(1, Math.min(120, value));
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get loopMode(): LoopMode {
    return this._loopMode;
  }

  set loopMode(mode: LoopMode) {
    this._loopMode = mode;
  }

  get frameCount(): number {
    return this._outPoint - this._inPoint + 1;
  }

  get marks(): ReadonlySet<number> {
    return this._marks;
  }

  get currentSource(): MediaSource | null {
    return this.sources[this._currentSourceIndex] ?? null;
  }

  get allSources(): MediaSource[] {
    return this.sources;
  }

  // Playback control
  play(): void {
    if (!this._isPlaying) {
      this._isPlaying = true;
      this.lastFrameTime = performance.now();
      this.frameAccumulator = 0;

      // Start video playback if current source is video
      const source = this.currentSource;
      if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
        source.element.play();
      }

      this.emit('playbackChanged', true);
    }
  }

  pause(): void {
    if (this._isPlaying) {
      this._isPlaying = false;

      // Pause video if current source is video
      const source = this.currentSource;
      if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
        source.element.pause();
      }

      this.emit('playbackChanged', false);
    }
  }

  togglePlayback(): void {
    if (this._isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  togglePlayDirection(): void {
    this._playDirection *= -1;
  }

  stepForward(): void {
    this.pause();
    this.advanceFrame(1);
  }

  stepBackward(): void {
    this.pause();
    this.advanceFrame(-1);
  }

  goToFrame(frame: number): void {
    this.currentFrame = frame;
  }

  goToStart(): void {
    this.currentFrame = this._inPoint;
  }

  goToEnd(): void {
    this.currentFrame = this._outPoint;
  }

  // In/out points
  setInPoint(frame?: number): void {
    const newInPoint = frame ?? this._currentFrame;
    if (newInPoint !== this._inPoint) {
      this._inPoint = newInPoint;
      this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
    }
    if (this._currentFrame < this._inPoint) {
      this.currentFrame = this._inPoint;
    }
  }

  setOutPoint(frame?: number): void {
    const newOutPoint = frame ?? this._currentFrame;
    if (newOutPoint !== this._outPoint) {
      this._outPoint = newOutPoint;
      this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
    }
    if (this._currentFrame > this._outPoint) {
      this.currentFrame = this._outPoint;
    }
  }

  resetInOutPoints(): void {
    this._inPoint = 1;
    this._outPoint = this.currentSource?.duration ?? 1;
    this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
  }

  // Marks
  toggleMark(frame?: number): void {
    const f = frame ?? this._currentFrame;
    if (this._marks.has(f)) {
      this._marks.delete(f);
    } else {
      this._marks.add(f);
    }
  }

  clearMarks(): void {
    this._marks.clear();
  }

  // Update called each frame
  update(): void {
    if (!this._isPlaying) return;

    const source = this.currentSource;

    // For video, sync frame from video time
    if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
      const video = source.element;
      const currentTime = video.currentTime;
      const frame = Math.floor(currentTime * this._fps) + 1;

      if (frame !== this._currentFrame) {
        this._currentFrame = Math.max(this._inPoint, Math.min(this._outPoint, frame));
        this.emit('frameChanged', this._currentFrame);
      }

      // Handle loop
      if (video.ended || frame >= this._outPoint) {
        if (this._loopMode === 'loop') {
          video.currentTime = (this._inPoint - 1) / this._fps;
          video.play();
        } else if (this._loopMode === 'once') {
          this.pause();
        }
      }
    } else {
      // For images, use frame-based timing
      const now = performance.now();
      const delta = now - this.lastFrameTime;
      this.lastFrameTime = now;

      const frameDuration = 1000 / this._fps;
      this.frameAccumulator += delta;

      while (this.frameAccumulator >= frameDuration) {
        this.frameAccumulator -= frameDuration;
        this.advanceFrame(this._playDirection);
      }
    }
  }

  private advanceFrame(direction: number): void {
    let nextFrame = this._currentFrame + direction;

    if (nextFrame > this._outPoint) {
      switch (this._loopMode) {
        case 'once':
          this.pause();
          nextFrame = this._outPoint;
          break;
        case 'loop':
          nextFrame = this._inPoint;
          break;
        case 'pingpong':
          this._playDirection = -1;
          nextFrame = this._outPoint - 1;
          break;
      }
    } else if (nextFrame < this._inPoint) {
      switch (this._loopMode) {
        case 'once':
          this.pause();
          nextFrame = this._inPoint;
          break;
        case 'loop':
          nextFrame = this._outPoint;
          break;
        case 'pingpong':
          this._playDirection = 1;
          nextFrame = this._inPoint + 1;
          break;
      }
    }

    this.currentFrame = nextFrame;
  }

  private syncVideoToFrame(): void {
    const source = this.currentSource;
    if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
      const targetTime = (this._currentFrame - 1) / this._fps;
      if (Math.abs(source.element.currentTime - targetTime) > 0.1) {
        source.element.currentTime = targetTime;
      }
    }
  }

  // Session loading
  async loadFromGTO(data: ArrayBuffer | string): Promise<void> {
    const reader = new SimpleReader();

    if (typeof data === 'string') {
      reader.open(data);
    } else {
      reader.open(new Uint8Array(data));
    }

    const dto = new GTODTO(reader.result);
    this.parseSession(dto);
    this.emit('sessionLoaded', undefined);
  }

  private parseSession(dto: GTODTO): void {
    const sessions = dto.byProtocol('RVSession');
    if (sessions.length === 0) {
      console.warn('No RVSession found in file');
      return;
    }

    // Parse file sources
    const sources = dto.byProtocol('RVFileSource');
    for (const source of sources) {
      const mediaObj = source.component('media');
      if (mediaObj) {
        const movieProp = mediaObj.prop('movie');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const movie = (movieProp as any)?.data?.[0];
        if (movie) {
          console.log('Found source:', movie);
        }
      }
    }

    // Parse paint annotations
    this.parsePaintAnnotations(dto);
  }

  private parsePaintAnnotations(dto: GTODTO): void {
    const paintObjects = dto.byProtocol('RVPaint');
    if (paintObjects.length === 0) return;

    const annotations: Annotation[] = [];
    let effects: Partial<PaintEffects> | undefined;

    for (const paintObj of paintObjects) {
      // Parse pen strokes
      const penComp = paintObj.component('pen');
      if (penComp) {
        const strokes = this.parsePenStrokes(penComp);
        annotations.push(...strokes);
      }

      // Parse text annotations
      const textComp = paintObj.component('text');
      if (textComp) {
        const texts = this.parseTextAnnotations(textComp);
        annotations.push(...texts);
      }

      // Parse effects/settings
      const settingsComp = paintObj.component('settings');
      if (settingsComp) {
        effects = this.parsePaintSettings(settingsComp);
      }
    }

    if (annotations.length > 0 || effects) {
      this.emit('annotationsLoaded', { annotations, effects });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parsePenStrokes(penComp: any): PenStroke[] {
    const strokes: PenStroke[] = [];

    // Get stroke count
    const orderProp = penComp.prop('order');
    if (!orderProp?.data) return strokes;

    const order = orderProp.data as string[];

    for (const strokeId of order) {
      const strokeComp = penComp.prop(strokeId);
      if (!strokeComp?.data) continue;

      // Parse stroke properties
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = strokeComp.data as any;

      const stroke: PenStroke = {
        type: 'pen',
        id: strokeId,
        frame: data.frame ?? 1,
        user: data.user ?? 'unknown',
        color: this.parseColor(data.color) ?? [1, 0, 0, 1],
        width: data.width ?? 3,
        brush: data.brush === 0 ? BrushType.Gaussian : BrushType.Circle,
        points: this.parsePoints(data.points),
        join: (data.join as LineJoin) ?? LineJoin.Round,
        cap: (data.cap as LineCap) ?? LineCap.Round,
        splat: data.splat ?? false,
        mode: data.mode === 1 ? StrokeMode.Erase : StrokeMode.Draw,
        startFrame: data.startFrame ?? data.frame ?? 1,
        duration: data.duration ?? -1,
      };

      strokes.push(stroke);
    }

    return strokes;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseTextAnnotations(textComp: any): TextAnnotation[] {
    const texts: TextAnnotation[] = [];

    const orderProp = textComp.prop('order');
    if (!orderProp?.data) return texts;

    const order = orderProp.data as string[];

    for (const textId of order) {
      const textProp = textComp.prop(textId);
      if (!textProp?.data) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = textProp.data as any;

      const text: TextAnnotation = {
        type: 'text',
        id: textId,
        frame: data.frame ?? 1,
        user: data.user ?? 'unknown',
        position: {
          x: data.position?.[0] ?? 0.5,
          y: data.position?.[1] ?? 0.5,
        },
        color: this.parseColor(data.color) ?? [1, 1, 1, 1],
        text: data.text ?? '',
        size: data.size ?? 24,
        scale: data.scale ?? 1,
        rotation: data.rotation ?? 0,
        spacing: data.spacing ?? 1,
        font: data.font ?? 'sans-serif',
        origin: (data.origin as TextOrigin) ?? TextOrigin.BottomLeft,
        startFrame: data.startFrame ?? data.frame ?? 1,
        duration: data.duration ?? -1,
      };

      texts.push(text);
    }

    return texts;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parsePaintSettings(settingsComp: any): Partial<PaintEffects> {
    const effects: Partial<PaintEffects> = {};

    const ghostProp = settingsComp.prop('ghost');
    if (ghostProp?.data !== undefined) {
      effects.ghost = Boolean(ghostProp.data);
    }

    const ghostBeforeProp = settingsComp.prop('ghostBefore');
    if (ghostBeforeProp?.data !== undefined) {
      effects.ghostBefore = Number(ghostBeforeProp.data);
    }

    const ghostAfterProp = settingsComp.prop('ghostAfter');
    if (ghostAfterProp?.data !== undefined) {
      effects.ghostAfter = Number(ghostAfterProp.data);
    }

    const holdProp = settingsComp.prop('hold');
    if (holdProp?.data !== undefined) {
      effects.hold = Boolean(holdProp.data);
    }

    return effects;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseColor(colorData: any): [number, number, number, number] | null {
    if (!colorData) return null;

    if (Array.isArray(colorData) && colorData.length >= 3) {
      return [
        colorData[0] ?? 1,
        colorData[1] ?? 0,
        colorData[2] ?? 0,
        colorData[3] ?? 1,
      ];
    }

    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parsePoints(pointsData: any): Array<{ x: number; y: number; pressure?: number }> {
    if (!pointsData || !Array.isArray(pointsData)) return [];

    const points: Array<{ x: number; y: number; pressure?: number }> = [];

    // Points can be stored as flat array [x1, y1, x2, y2, ...] or as array of objects
    if (typeof pointsData[0] === 'number') {
      // Flat array format
      for (let i = 0; i < pointsData.length; i += 2) {
        points.push({
          x: pointsData[i] ?? 0,
          y: pointsData[i + 1] ?? 0,
        });
      }
    } else {
      // Array of objects format
      for (const p of pointsData) {
        points.push({
          x: p.x ?? p[0] ?? 0,
          y: p.y ?? p[1] ?? 0,
          pressure: p.pressure ?? p[2],
        });
      }
    }

    return points;
  }

  // File loading
  async loadFile(file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    const type = this.getMediaType(file);

    try {
      if (type === 'video') {
        await this.loadVideo(file.name, url);
      } else if (type === 'image') {
        await this.loadImage(file.name, url);
      }
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  private getMediaType(file: File): MediaType {
    const videoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    if (videoTypes.includes(file.type) || /\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(file.name)) {
      return 'video';
    }
    return 'image';
  }

  async loadImage(name: string, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const source: MediaSource = {
          type: 'image',
          name,
          url,
          width: img.width,
          height: img.height,
          duration: 1,
          fps: this._fps,
          element: img,
        };

        this.sources.push(source);
        this._currentSourceIndex = this.sources.length - 1;
        this._inPoint = 1;
        this._outPoint = 1;
        this._currentFrame = 1;

        this.emit('sourceLoaded', source);
        this.emit('durationChanged', 1);
        resolve();
      };

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${url}`));
      };

      img.src = url;
    });
  }

  async loadVideo(name: string, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.muted = false;
      video.loop = false;

      video.onloadedmetadata = () => {
        const duration = Math.ceil(video.duration * this._fps);

        const source: MediaSource = {
          type: 'video',
          name,
          url,
          width: video.videoWidth,
          height: video.videoHeight,
          duration,
          fps: this._fps,
          element: video,
        };

        this.sources.push(source);
        this._currentSourceIndex = this.sources.length - 1;
        this._inPoint = 1;
        this._outPoint = duration;
        this._currentFrame = 1;

        this.emit('sourceLoaded', source);
        this.emit('durationChanged', duration);
        resolve();
      };

      video.onerror = () => {
        reject(new Error(`Failed to load video: ${url}`));
      };

      video.src = url;
    });
  }

  // Switch between sources
  setCurrentSource(index: number): void {
    if (index >= 0 && index < this.sources.length) {
      // Pause current video if playing
      const currentSource = this.currentSource;
      if (currentSource?.type === 'video' && currentSource.element instanceof HTMLVideoElement) {
        currentSource.element.pause();
      }

      this._currentSourceIndex = index;
      const newSource = this.currentSource;
      if (newSource) {
        this._outPoint = newSource.duration;
        this._inPoint = 1;
        this._currentFrame = 1;
        this.emit('durationChanged', newSource.duration);
      }
    }
  }
}
