import { GTOBuilder } from 'gto-js';
import type { ObjectData } from 'gto-js';

/**
 * Display 2D transform settings
 */
export interface DispTransform2DSettings {
  /** Enable transform */
  active?: boolean;
  /** Translation X */
  translateX?: number;
  /** Translation Y */
  translateY?: number;
  /** Scale X */
  scaleX?: number;
  /** Scale Y */
  scaleY?: number;
  /** Rotation in degrees */
  rotate?: number;
}

/**
 * 2D transform settings for RVTransform2D
 */
export interface Transform2DSettings {
  /** Rotation in degrees */
  rotate?: number;
  /** Horizontal flip */
  flip?: boolean;
  /** Vertical flip (flop) */
  flop?: boolean;
  /** Scale [x, y] */
  scale?: number[];
  /** Translation [x, y] */
  translate?: number[];
  /** Visible box/crop region settings */
  visibleBox?: {
    /** Enable visible box */
    active?: boolean;
    /** Min X coordinate */
    minX?: number;
    /** Min Y coordinate */
    minY?: number;
    /** Max X coordinate */
    maxX?: number;
    /** Max Y coordinate */
    maxY?: number;
  };
  /** Stencil/mask settings */
  stencil?: {
    /** Enable stencil */
    active?: boolean;
    /** Invert stencil */
    inverted?: boolean;
    /** Aspect ratio */
    aspect?: number;
    /** Soft edge amount */
    softEdge?: number;
    /** Ratio value */
    ratio?: number;
    /**
     * Visible box stencil for wipes: [xMin, xMax, yMin, yMax] in normalized 0-1 range.
     * This is the OpenRV native format (stencil.visibleBox float[4]).
     * Default [0, 1, 0, 1] means the full image is visible.
     */
    visibleBox?: [number, number, number, number];
  };
}

/**
 * Lens warp settings for RVLensWarp
 */
export interface LensWarpSettings {
  /** Node is active */
  active?: boolean;
  /** Distortion model (e.g., 'brown', 'opencv', '3de4_radial', '3de4_anamorphic') */
  model?: string;
  /** K1 radial distortion coefficient */
  k1?: number;
  /** K2 radial distortion coefficient */
  k2?: number;
  /** K3 radial distortion coefficient */
  k3?: number;
  /** P1 tangential distortion */
  p1?: number;
  /** P2 tangential distortion */
  p2?: number;
  /** Distortion scale factor */
  d?: number;
  /** Center point [x, y] */
  center?: number[];
  /** Offset [x, y] */
  offset?: number[];
  /** Pixel aspect ratio */
  pixelAspectRatio?: number;
  /** Focal length X */
  fx?: number;
  /** Focal length Y */
  fy?: number;
  /** Crop ratio X */
  cropRatioX?: number;
  /** Crop ratio Y */
  cropRatioY?: number;
  /** 3DE4 anamorphic settings */
  anamorphic?: {
    /** Anamorphic squeeze */
    squeeze?: number;
    /** Squeeze in X direction */
    squeezeX?: number;
    /** Squeeze in Y direction */
    squeezeY?: number;
    /** Anamorphic rotation angle */
    anamorphicRotation?: number;
    /** Physical lens rotation */
    lensRotation?: number;
    /** 3DE4 polynomial coefficients */
    cx02?: number;
    cy02?: number;
    cx22?: number;
    cy22?: number;
    cx04?: number;
    cy04?: number;
    cx24?: number;
    cy24?: number;
    cx44?: number;
    cy44?: number;
  };
}

/**
 * Canvas rotation settings
 */
export interface RotateCanvasSettings {
  /** Enable rotation */
  active?: boolean;
  /** Rotation angle in degrees */
  degrees?: number;
  /** Flip horizontal */
  flipH?: boolean;
  /** Flip vertical */
  flipV?: boolean;
}

/**
 * Resize settings
 */
export interface ResizeSettings {
  /** Enable resize */
  active?: boolean;
  /** Target width */
  width?: number;
  /** Target height */
  height?: number;
  /** Resize mode (0=fit, 1=fill, 2=stretch) */
  mode?: number;
  /** Filter type (0=nearest, 1=bilinear, 2=bicubic, 3=lanczos) */
  filter?: number;
}

/**
 * RVFormat settings for crop and channel mapping
 */
export interface FormatSettings {
  /** Crop settings */
  crop?: {
    /** Crop is active */
    active?: boolean;
    /** Left edge (in pixels) */
    xmin?: number;
    /** Top edge (in pixels) */
    ymin?: number;
    /** Right edge (in pixels) */
    xmax?: number;
    /** Bottom edge (in pixels) */
    ymax?: number;
  };
  /** Uncrop (data window -> display window) settings */
  uncrop?: {
    /** Uncrop is active */
    active?: boolean;
    /** X offset of data window inside display window (pixels) */
    x?: number;
    /** Y offset of data window inside display window (pixels) */
    y?: number;
    /** Display window width (pixels) */
    width?: number;
    /** Display window height (pixels) */
    height?: number;
  };
  /** Channel mapping names */
  channels?: string[];
}

/**
 * Transform serialization functions for GTO export.
 * Handles all spatial transform node building: 2D transforms, lens warp,
 * rotation, resize, and format/crop.
 */
export const TransformSerializer = {
  /**
   * Build an RVDispTransform2D object for display transforms
   */
  buildDispTransform2DObject(name: string, settings: DispTransform2DSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVDispTransform2D', 1);
    obj.component('transform')
      .int('active', settings.active !== false ? 1 : 0)
      .float('translate', [settings.translateX ?? 0, settings.translateY ?? 0])
      .float('scale', [settings.scaleX ?? 1, settings.scaleY ?? 1])
      .float('rotate', settings.rotate ?? 0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVTransform2D object for source transforms
   */
  buildTransform2DObject(name: string, settings: Transform2DSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVTransform2D', 1);

    // Transform component
    obj.component('transform')
      .float('rotate', settings.rotate ?? 0)
      .int('flip', settings.flip ? 1 : 0)
      .int('flop', settings.flop ? 1 : 0)
      .float2('scale', [settings.scale ?? [1.0, 1.0]])
      .float2('translate', [settings.translate ?? [0.0, 0.0]])
      .end();

    // VisibleBox component (if provided)
    if (settings.visibleBox) {
      const vb = settings.visibleBox;
      obj.component('visibleBox')
        .int('active', vb.active ? 1 : 0)
        .float('minX', vb.minX ?? 0)
        .float('minY', vb.minY ?? 0)
        .float('maxX', vb.maxX ?? 1)
        .float('maxY', vb.maxY ?? 1)
        .end();
    }

    // Stencil component (if provided)
    if (settings.stencil) {
      const st = settings.stencil;
      const stencilComp = obj.component('stencil');
      stencilComp
        .int('active', st.active ? 1 : 0)
        .int('inverted', st.inverted ? 1 : 0)
        .float('aspect', st.aspect ?? 1.0)
        .float('softEdge', st.softEdge ?? 0)
        .float('ratio', st.ratio ?? 1.0);

      // Write stencil.visibleBox as float[4] = [xMin, xMax, yMin, yMax]
      // This is the OpenRV native format for wipe stencil boxes.
      if (st.visibleBox) {
        stencilComp.float('visibleBox', st.visibleBox);
      }

      stencilComp.end();
    }

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVLensWarp object for lens distortion correction
   */
  buildLensWarpObject(name: string, settings: LensWarpSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVLensWarp', 1);

    // Node component (active state)
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .end();

    // Warp component
    const warpComp = obj.component('warp');
    warpComp
      .string('model', settings.model ?? 'brown')
      .float('k1', settings.k1 ?? 0)
      .float('k2', settings.k2 ?? 0)
      .float('k3', settings.k3 ?? 0)
      .float('p1', settings.p1 ?? 0)
      .float('p2', settings.p2 ?? 0)
      .float('d', settings.d ?? 1.0)
      .float2('center', [settings.center ?? [0.5, 0.5]])
      .float2('offset', [settings.offset ?? [0, 0]])
      .float('pixelAspectRatio', settings.pixelAspectRatio ?? 1.0)
      .float('fx', settings.fx ?? 1.0)
      .float('fy', settings.fy ?? 1.0)
      .float('cropRatioX', settings.cropRatioX ?? 1.0)
      .float('cropRatioY', settings.cropRatioY ?? 1.0);

    // Add 3DE4 anamorphic properties if provided
    if (settings.anamorphic) {
      const ana = settings.anamorphic;
      if (ana.squeeze !== undefined) warpComp.float('squeeze', ana.squeeze);
      if (ana.squeezeX !== undefined) warpComp.float('squeezeX', ana.squeezeX);
      if (ana.squeezeY !== undefined) warpComp.float('squeezeY', ana.squeezeY);
      if (ana.anamorphicRotation !== undefined) warpComp.float('anamorphicRotation', ana.anamorphicRotation);
      if (ana.lensRotation !== undefined) warpComp.float('lensRotation', ana.lensRotation);
      // 3DE4 polynomial coefficients
      if (ana.cx02 !== undefined) warpComp.float('cx02', ana.cx02);
      if (ana.cy02 !== undefined) warpComp.float('cy02', ana.cy02);
      if (ana.cx22 !== undefined) warpComp.float('cx22', ana.cx22);
      if (ana.cy22 !== undefined) warpComp.float('cy22', ana.cy22);
      if (ana.cx04 !== undefined) warpComp.float('cx04', ana.cx04);
      if (ana.cy04 !== undefined) warpComp.float('cy04', ana.cy04);
      if (ana.cx24 !== undefined) warpComp.float('cx24', ana.cx24);
      if (ana.cy24 !== undefined) warpComp.float('cy24', ana.cy24);
      if (ana.cx44 !== undefined) warpComp.float('cx44', ana.cx44);
      if (ana.cy44 !== undefined) warpComp.float('cy44', ana.cy44);
    }

    warpComp.end();
    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVRotateCanvas object
   */
  buildRotateCanvasObject(name: string, settings: RotateCanvasSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVRotateCanvas', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .float('degrees', settings.degrees ?? 0.0)
      .int('flipH', settings.flipH ? 1 : 0)
      .int('flipV', settings.flipV ? 1 : 0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVResize object
   */
  buildResizeObject(name: string, settings: ResizeSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVResize', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .int('width', settings.width ?? 0)
      .int('height', settings.height ?? 0)
      .int('mode', settings.mode ?? 0)
      .int('filter', settings.filter ?? 1)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVFormat object for crop and channel mapping
   */
  buildFormatObject(name: string, settings: FormatSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const formatObject = builder.object(name, 'RVFormat', 1);

    // Crop component
    if (settings.crop) {
      const crop = settings.crop;
      formatObject
        .component('crop')
        .int('active', crop.active !== false ? 1 : 0)
        .float('xmin', crop.xmin ?? 0)
        .float('ymin', crop.ymin ?? 0)
        .float('xmax', crop.xmax ?? 0)
        .float('ymax', crop.ymax ?? 0)
        .end();
    }

    // Uncrop component
    if (settings.uncrop) {
      const uncrop = settings.uncrop;
      formatObject
        .component('uncrop')
        .int('active', uncrop.active !== false ? 1 : 0)
        .int('x', uncrop.x ?? 0)
        .int('y', uncrop.y ?? 0)
        .int('width', uncrop.width ?? 0)
        .int('height', uncrop.height ?? 0)
        .end();
    }

    // Format component (channel mapping)
    if (settings.channels && settings.channels.length > 0) {
      formatObject
        .component('format')
        .string('channels', settings.channels)
        .end();
    }

    formatObject.end();
    return builder.build().objects[0]!;
  },
};
