import { SimpleReader, GTODTO } from 'gto-js';
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import {
  SequenceFrame,
  SequenceInfo,
  createSequenceInfo,
  loadFrameImage,
  preloadFrames,
  releaseDistantFrames,
  disposeSequence,
} from '../../utils/SequenceLoader';
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
  loopModeChanged: LoopMode;
  playDirectionChanged: number;
  marksChanged: ReadonlySet<number>;
  annotationsLoaded: ParsedAnnotations;
  volumeChanged: number;
  mutedChanged: boolean;
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
  // Sequence-specific data
  sequenceInfo?: SequenceInfo;
  sequenceFrames?: SequenceFrame[];
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
  private _volume = 0.7;
  private _muted = false;

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
    // Allow seeking within full source duration, not just in/out range
    const duration = this.currentSource?.duration ?? 1;
    const clamped = Math.max(1, Math.min(duration, Math.round(frame)));
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
    if (mode !== this._loopMode) {
      this._loopMode = mode;
      this.emit('loopModeChanged', mode);
    }
  }

  get frameCount(): number {
    return this._outPoint - this._inPoint + 1;
  }

  get marks(): ReadonlySet<number> {
    return this._marks;
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    const clamped = Math.max(0, Math.min(1, value));
    if (clamped !== this._volume) {
      this._volume = clamped;
      this.applyVolumeToVideo();
      this.emit('volumeChanged', this._volume);
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    if (value !== this._muted) {
      this._muted = value;
      this.applyVolumeToVideo();
      this.emit('mutedChanged', this._muted);
    }
  }

  toggleMute(): void {
    this.muted = !this._muted;
  }

  private applyVolumeToVideo(): void {
    const source = this.currentSource;
    if (source?.type === 'video' && source.element instanceof HTMLVideoElement) {
      source.element.volume = this._muted ? 0 : this._volume;
      source.element.muted = this._muted;
    }
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
    this.emit('playDirectionChanged', this._playDirection);
  }

  get playDirection(): number {
    return this._playDirection;
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
    // Clamp to valid range: 1 to outPoint
    const newInPoint = Math.max(1, Math.min(this._outPoint, frame ?? this._currentFrame));
    if (newInPoint !== this._inPoint) {
      this._inPoint = newInPoint;
      this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
    }
    if (this._currentFrame < this._inPoint) {
      this.currentFrame = this._inPoint;
    }
  }

  setOutPoint(frame?: number): void {
    const duration = this.currentSource?.duration ?? 1;
    // Clamp to valid range: inPoint to duration
    const newOutPoint = Math.max(this._inPoint, Math.min(duration, frame ?? this._currentFrame));
    if (newOutPoint !== this._outPoint) {
      this._outPoint = newOutPoint;
      this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
    }
    if (this._currentFrame > this._outPoint) {
      this.currentFrame = this._outPoint;
    }
  }

  resetInOutPoints(): void {
    const duration = this.currentSource?.duration ?? 1;
    this._inPoint = 1;
    this._outPoint = duration;
    this.emit('inOutChanged', { inPoint: this._inPoint, outPoint: this._outPoint });
    // Also reset playhead to start
    this.currentFrame = 1;
  }

  // Marks
  toggleMark(frame?: number): void {
    const f = frame ?? this._currentFrame;
    if (this._marks.has(f)) {
      this._marks.delete(f);
    } else {
      this._marks.add(f);
    }
    this.emit('marksChanged', this._marks);
  }

  clearMarks(): void {
    this._marks.clear();
    this.emit('marksChanged', this._marks);
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

    try {
      if (typeof data === 'string') {
        reader.open(data);
      } else {
        // Check if it's text format GTO (starts with "GTOa")
        const bytes = new Uint8Array(data);
        const isTextFormat =
          bytes[0] === 0x47 && // 'G'
          bytes[1] === 0x54 && // 'T'
          bytes[2] === 0x4f && // 'O'
          bytes[3] === 0x61;   // 'a'

        if (isTextFormat) {
          // Convert to string for text format parsing
          const textContent = new TextDecoder('utf-8').decode(bytes);
          reader.open(textContent);
        } else {
          // Binary format
          reader.open(bytes);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('GTO parsing error:', message);
      throw new Error(`Failed to parse GTO file: ${message}`);
    }

    const dto = new GTODTO(reader.result);
    this.parseSession(dto);
    this.emit('sessionLoaded', undefined);
  }

  private parseSession(dto: GTODTO): void {
    // Debug: Log all available protocols
    console.log('GTO Result:', dto);

    const sessions = dto.byProtocol('RVSession');
    console.log('RVSession objects:', sessions.length);
    if (sessions.length === 0) {
      console.warn('No RVSession found in file');
    }

    // Parse file sources and get aspect ratio
    let aspectRatio = 1;
    const sources = dto.byProtocol('RVFileSource');
    console.log('RVFileSource objects:', sources.length);
    for (const source of sources) {
      // Get size from proxy component
      const proxyComp = source.component('proxy');
      if (proxyComp?.exists()) {
        const sizeValue = proxyComp.property('size').value();
        if (Array.isArray(sizeValue) && sizeValue.length >= 2) {
          const width = sizeValue[0] as number;
          const height = sizeValue[1] as number;
          if (width > 0 && height > 0) {
            aspectRatio = width / height;
            console.log('Source size:', width, 'x', height, 'aspect:', aspectRatio);
          }
        }
      }

      const mediaObj = source.component('media');
      if (mediaObj) {
        const movieProp = mediaObj.property('movie').value();
        if (movieProp) {
          console.log('Found source:', movieProp);
        }
      }
    }

    // Parse paint annotations with aspect ratio
    this.parsePaintAnnotations(dto, aspectRatio);
  }

  private parsePaintAnnotations(dto: GTODTO, aspectRatio: number): void {
    const paintObjects = dto.byProtocol('RVPaint');
    console.log('RVPaint objects:', paintObjects.length);

    if (paintObjects.length === 0) {
      return;
    }

    const annotations: Annotation[] = [];
    let effects: Partial<PaintEffects> | undefined;

    for (const paintObj of paintObjects) {
      console.log('Paint object:', paintObj.name);

      // Get all components from this paint object using the components() method
      const allComponents = paintObj.components();
      if (!allComponents || allComponents.length === 0) continue;

      // Find frame components and stroke/text components
      const frameOrders = new Map<number, string[]>();
      const strokeData = new Map<string, unknown>();

      for (const comp of allComponents) {
        const compName = comp.name;

        if (compName.startsWith('frame:')) {
          // Parse frame order component like "frame:15"
          const frameNum = parseInt(compName.split(':')[1] ?? '1', 10);
          const orderProp = comp.property('order');
          if (orderProp?.exists()) {
            // Order can be a string or string array
            const orderValue = orderProp.value();
            const order = Array.isArray(orderValue) ? orderValue : [orderValue];
            frameOrders.set(frameNum, order as string[]);
          }
        } else if (compName.startsWith('pen:') || compName.startsWith('text:')) {
          // Store stroke/text data for later lookup
          strokeData.set(compName, comp);
        }
      }

      console.log('Frame orders:', Object.fromEntries(frameOrders));
      console.log('Stroke data keys:', Array.from(strokeData.keys()));

      // Parse strokes and text for each frame
      for (const [frame, order] of frameOrders) {
        for (const strokeId of order) {
          const comp = strokeData.get(strokeId);
          if (!comp) continue;

          if (strokeId.startsWith('pen:')) {
            const stroke = this.parsePenStroke(strokeId, frame, comp, aspectRatio);
            if (stroke) {
              annotations.push(stroke);
            }
          } else if (strokeId.startsWith('text:')) {
            const text = this.parseTextAnnotation(strokeId, frame, comp, aspectRatio);
            if (text) {
              annotations.push(text);
            }
          }
        }
      }

      // Parse effects/settings from paint component
      const paintComp = paintObj.component('paint');
      if (paintComp?.exists()) {
        // Could extract ghost settings here if needed
      }
    }

    console.log('Total annotations parsed:', annotations.length);
    if (annotations.length > 0 || effects) {
      this.emit('annotationsLoaded', { annotations, effects });
    }
  }

  // Parse a single pen stroke from RV GTO format
  // strokeId format: "pen:ID:FRAME:USER" e.g., "pen:1:15:User"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parsePenStroke(strokeId: string, frame: number, comp: any, aspectRatio: number): PenStroke | null {
    // Parse user from strokeId (e.g., "pen:1:15:User" -> "User")
    const parts = strokeId.split(':');
    const user = parts[3] ?? 'unknown';
    const id = parts[1] ?? '0';

    // Get properties from component using the ComponentDTO API
    const colorValue = comp.property('color').value();
    const widthValue = comp.property('width').value();
    const brushValue = comp.property('brush').value();
    const pointsValue = comp.property('points').value();
    const joinValue = comp.property('join').value();
    const capValue = comp.property('cap').value();
    const splatValue = comp.property('splat').value();

    // Parse color - stored as float[4] in GTO
    let color: [number, number, number, number] = [1, 0, 0, 1];
    if (colorValue && Array.isArray(colorValue) && colorValue.length >= 4) {
      color = [colorValue[0], colorValue[1], colorValue[2], colorValue[3]];
    }

    // Parse width - can be a single value or array (per-point width)
    let width = 3;
    if (widthValue) {
      if (Array.isArray(widthValue) && widthValue.length > 0) {
        // Use the first width value, convert from normalized to pixel
        width = (widthValue[0] as number) * 500; // Scale up from normalized
      } else if (typeof widthValue === 'number') {
        width = widthValue * 500;
      }
    }

    // Parse brush type
    const brushType = brushValue === 'gaussian' ? BrushType.Gaussian : BrushType.Circle;

    // Parse points - stored as float[2] pairs
    // OpenRV coordinate system: X from -aspectRatio to +aspectRatio, Y from -1 to +1
    const points: Array<{ x: number; y: number; pressure?: number }> = [];
    if (pointsValue && Array.isArray(pointsValue)) {
      for (const point of pointsValue) {
        if (Array.isArray(point) && point.length >= 2) {
          const rawX = point[0] as number;
          const rawY = point[1] as number;
          // Convert from OpenRV coords to normalized 0-1 coords
          points.push({
            x: (rawX / aspectRatio + 1) / 2,
            y: (rawY + 1) / 2,
          });
        }
      }
    }

    if (points.length === 0) {
      console.warn('Stroke has no points:', strokeId);
      return null;
    }

    // Parse line join (0=miter, 1=round, 2=bevel - GTO uses different values)
    let join = LineJoin.Round;
    if (joinValue !== null && joinValue !== undefined) {
      const joinVal = joinValue as number;
      if (joinVal === 0) join = LineJoin.Miter;
      else if (joinVal === 2) join = LineJoin.Bevel;
      // 1 and 3 are round variants
    }

    // Parse line cap
    let cap = LineCap.Round;
    if (capValue !== null && capValue !== undefined) {
      const capVal = capValue as number;
      if (capVal === 0) cap = LineCap.NoCap;
      else if (capVal === 2) cap = LineCap.Square;
    }

    const stroke: PenStroke = {
      type: 'pen',
      id,
      frame,
      user,
      color,
      width,
      brush: brushType,
      points,
      join,
      cap,
      splat: splatValue === 1,
      mode: StrokeMode.Draw,
      startFrame: frame,
      duration: 0, // Only visible on this specific frame
    };

    return stroke;
  }

  // Parse a single text annotation from RV GTO format
  // textId format: "text:ID:FRAME:USER" e.g., "text:6:1:User"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseTextAnnotation(textId: string, frame: number, comp: any, aspectRatio: number): TextAnnotation | null {
    const parts = textId.split(':');
    const user = parts[3] ?? 'unknown';
    const id = parts[1] ?? '0';

    const positionValue = comp.property('position').value();
    const colorValue = comp.property('color').value();
    const textValue = comp.property('text').value();
    const sizeValue = comp.property('size').value();
    const scaleValue = comp.property('scale').value();
    const rotationValue = comp.property('rotation').value();
    const spacingValue = comp.property('spacing').value();
    const fontValue = comp.property('font').value();

    // Parse position
    // OpenRV coordinate system: X from -aspectRatio to +aspectRatio, Y from -1 to +1
    let x = 0.5, y = 0.5;
    if (positionValue && Array.isArray(positionValue) && positionValue.length >= 2) {
      const posData = positionValue[0];
      if (Array.isArray(posData) && posData.length >= 2) {
        const rawX = posData[0] as number;
        const rawY = posData[1] as number;
        x = (rawX / aspectRatio + 1) / 2;
        y = (rawY + 1) / 2;
      }
    }

    // Parse color
    let color: [number, number, number, number] = [1, 1, 1, 1];
    if (colorValue && Array.isArray(colorValue) && colorValue.length >= 4) {
      color = [colorValue[0], colorValue[1], colorValue[2], colorValue[3]];
    }

    const text: TextAnnotation = {
      type: 'text',
      id,
      frame,
      user,
      position: { x, y },
      color,
      text: (textValue as string) ?? '',
      size: ((sizeValue as number) ?? 0.01) * 2000, // Scale up from normalized
      scale: (scaleValue as number) ?? 1,
      rotation: (rotationValue as number) ?? 0,
      spacing: (spacingValue as number) ?? 1,
      font: (fontValue as string) || 'sans-serif',
      origin: TextOrigin.BottomLeft,
      startFrame: frame,
      duration: 0, // Only visible on this specific frame
    };

    return text;
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
      video.muted = this._muted;
      video.volume = this._muted ? 0 : this._volume;
      video.loop = false;
      video.playsInline = true; // Required for iOS and some browsers

      // Use canplay event to ensure video data is ready
      video.oncanplay = () => {
        // Prevent multiple triggers
        video.oncanplay = null;

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

      video.onerror = (e) => {
        console.error('Video load error:', e);
        reject(new Error(`Failed to load video: ${url}`));
      };

      video.src = url;
      video.load(); // Explicitly start loading
    });
  }

  /**
   * Load an image sequence from multiple files
   */
  async loadSequence(files: File[], fps?: number): Promise<void> {
    const sequenceInfo = await createSequenceInfo(files, fps ?? this._fps);
    if (!sequenceInfo) {
      throw new Error('No valid image sequence found in the selected files');
    }

    const source: MediaSource = {
      type: 'sequence',
      name: sequenceInfo.name,
      url: '', // Sequences don't have a single URL
      width: sequenceInfo.width,
      height: sequenceInfo.height,
      duration: sequenceInfo.frames.length,
      fps: sequenceInfo.fps,
      sequenceInfo,
      sequenceFrames: sequenceInfo.frames,
      // Set element to first frame's image for initial display
      element: sequenceInfo.frames[0]?.image,
    };

    this.sources.push(source);
    this._currentSourceIndex = this.sources.length - 1;
    this._fps = sequenceInfo.fps;
    this._inPoint = 1;
    this._outPoint = sequenceInfo.frames.length;
    this._currentFrame = 1;

    this.emit('sourceLoaded', source);
    this.emit('durationChanged', sequenceInfo.frames.length);

    // Preload adjacent frames
    preloadFrames(sequenceInfo.frames, 0, 10);
  }

  /**
   * Get the current frame image for a sequence
   * Returns null if current source is not a sequence
   */
  async getSequenceFrameImage(frameIndex?: number): Promise<HTMLImageElement | null> {
    const source = this.currentSource;
    if (source?.type !== 'sequence' || !source.sequenceFrames) {
      return null;
    }

    const idx = (frameIndex ?? this._currentFrame) - 1; // Convert 1-based to 0-based
    const frame = source.sequenceFrames[idx];
    if (!frame) return null;

    // Load this frame if needed
    const image = await loadFrameImage(frame);

    // Preload adjacent frames
    preloadFrames(source.sequenceFrames, idx, 5);

    // Release distant frames to manage memory
    releaseDistantFrames(source.sequenceFrames, idx, 20);

    return image;
  }

  /**
   * Get sequence frame synchronously (returns cached image or null)
   */
  getSequenceFrameSync(frameIndex?: number): HTMLImageElement | null {
    const source = this.currentSource;
    if (source?.type !== 'sequence' || !source.sequenceFrames) {
      return null;
    }

    const idx = (frameIndex ?? this._currentFrame) - 1;
    const frame = source.sequenceFrames[idx];
    return frame?.image ?? null;
  }

  /**
   * Cleanup sequence resources when switching sources or disposing
   */
  private disposeSequenceSource(source: MediaSource): void {
    if (source.type === 'sequence' && source.sequenceFrames) {
      disposeSequence(source.sequenceFrames);
    }
  }

  // Switch between sources
  setCurrentSource(index: number): void {
    if (index >= 0 && index < this.sources.length) {
      // Cleanup current source
      const currentSource = this.currentSource;
      if (currentSource?.type === 'video' && currentSource.element instanceof HTMLVideoElement) {
        currentSource.element.pause();
      }
      // Note: We don't dispose sequences here since user might switch back

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

  /**
   * Dispose all session resources
   */
  dispose(): void {
    // Cleanup all sequence sources
    for (const source of this.sources) {
      this.disposeSequenceSource(source);
    }
    this.sources = [];
  }
}
