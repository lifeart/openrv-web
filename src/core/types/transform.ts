export interface Transform2D {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  scale: { x: number; y: number };
  translate: { x: number; y: number };
}

export const DEFAULT_TRANSFORM: Transform2D = {
  rotation: 0,
  flipH: false,
  flipV: false,
  scale: { x: 1, y: 1 },
  translate: { x: 0, y: 0 },
};

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropState {
  enabled: boolean;
  region: CropRegion;
  aspectRatio: string | null;
}

export const DEFAULT_CROP_REGION: CropRegion = { x: 0, y: 0, width: 1, height: 1 };

export const DEFAULT_CROP_STATE: CropState = {
  enabled: false,
  region: { ...DEFAULT_CROP_REGION },
  aspectRatio: null,
};
