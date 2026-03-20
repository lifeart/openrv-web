/**
 * WebGPUStateUploader - Pack InternalShaderState into per-stage uniform buffers.
 *
 * Maps InternalShaderState fields to per-stage WebGPU uniform buffers with
 * proper std140-like alignment (WGSL uses the same alignment rules):
 *   - scalar (f32/i32/u32): 4 bytes, aligned to 4
 *   - vec2f: 8 bytes, aligned to 8
 *   - vec3f: 12 bytes, aligned to 16
 *   - vec4f: 16 bytes, aligned to 16
 *   - mat3x3f: 3 x vec4f (padded) = 48 bytes, aligned to 16
 *
 * Also handles texture uploads for LUTs (curves, false color, film,
 * inline, file3D, look3D, display3D).
 */

import type { InternalShaderState } from '../ShaderStateTypes';
import type { StageId } from '../ShaderStage';
import type { WGPUDevice, WGPUBuffer, WGPUTexture } from './WebGPUTypes';
import { GPUBufferUsage, GPUTextureUsage } from './WebGPUTypes';

// ---------------------------------------------------------------------------
// Per-stage field definitions
// ---------------------------------------------------------------------------

/**
 * Defines which InternalShaderState fields each stage needs.
 * This enables uploading only the relevant uniforms for each stage.
 */
export const STAGE_FIELDS: Record<StageId, readonly string[]> = {
  inputDecode: [
    'deinterlaceEnabled',
    'deinterlaceMethod',
    'deinterlaceFieldOrder',
    'perspectiveEnabled',
    'perspectiveInvH',
    'perspectiveQuality',
    'sphericalEnabled',
    'sphericalFov',
    'sphericalAspect',
    'sphericalYaw',
    'sphericalPitch',
    'channelSwizzle',
    'premultMode',
  ],
  linearize: [
    'linearizeLogType',
    'linearizeSRGB2linear',
    'linearizeRec709ToLinear',
    'linearizeFileGamma',
    'linearizeInputTransfer',
    'linearizeAlphaType',
    'inputPrimariesEnabled',
    'inputPrimariesMatrix',
  ],
  primaryGrade: ['colorAdjustments', 'texelSize', 'inlineLUTEnabled', 'inlineLUTChannels', 'inlineLUTSize'],
  secondaryGrade: [
    'hsEnabled',
    'highlightsValue',
    'shadowsValue',
    'whitesValue',
    'blacksValue',
    'vibranceEnabled',
    'vibranceValue',
    'vibranceSkinProtection',
    'colorAdjustments',
  ],
  spatialEffects: ['clarityEnabled', 'clarityValue', 'texelSize'],
  colorPipeline: [
    'colorWheelsEnabled',
    'wheelLift',
    'wheelGamma',
    'wheelGain',
    'cdlEnabled',
    'cdlSlope',
    'cdlOffset',
    'cdlPower',
    'cdlSaturation',
    'cdlColorspace',
    'curvesEnabled',
    'lut3DEnabled',
    'lut3DIntensity',
    'lut3DSize',
    'lookLUT3DDomainMin',
    'lookLUT3DDomainMax',
    'hslQualifierEnabled',
    'hslHueCenter',
    'hslHueWidth',
    'hslHueSoftness',
    'hslSatCenter',
    'hslSatWidth',
    'hslSatSoftness',
    'hslLumCenter',
    'hslLumWidth',
    'hslLumSoftness',
    'hslCorrHueShift',
    'hslCorrSatScale',
    'hslCorrLumScale',
    'hslInvert',
    'hslMattePreview',
    'filmEnabled',
    'filmIntensity',
    'filmSaturation',
    'filmGrainIntensity',
    'filmGrainSeed',
    'fileLUT3DEnabled',
    'fileLUT3DIntensity',
    'fileLUT3DSize',
    'fileLUT3DDomainMin',
    'fileLUT3DDomainMax',
  ],
  sceneAnalysis: [
    'outOfRange',
    'toneMappingState',
    'gamutMappingEnabled',
    'gamutMappingModeCode',
    'gamutSourceCode',
    'gamutTargetCode',
    'gamutHighlightEnabled',
  ],
  spatialEffectsPost: ['sharpenEnabled', 'sharpenAmount', 'texelSize'],
  displayOutput: [
    'outputPrimariesEnabled',
    'outputPrimariesMatrix',
    'displayTransferCode',
    'displayGammaOverride',
    'displayBrightnessMultiplier',
    'displayCustomGamma',
    'colorInversionEnabled',
    'displayLUT3DEnabled',
    'displayLUT3DIntensity',
    'displayLUT3DSize',
    'displayLUT3DDomainMin',
    'displayLUT3DDomainMax',
  ],
  diagnostics: [
    'channelModeCode',
    'falseColorEnabled',
    'zebraEnabled',
    'zebraHighThreshold',
    'zebraLowThreshold',
    'zebraHighEnabled',
    'zebraLowEnabled',
    'zebraTime',
    'ditherMode',
    'quantizeBits',
    'contourEnabled',
    'contourLevels',
    'contourDesaturate',
    'contourLineColor',
  ],
  compositing: ['premultMode', 'bgPatternCode', 'bgColor1', 'bgColor2', 'bgCheckerSize'],
};

// ---------------------------------------------------------------------------
// Dirty flag -> stage mapping
// ---------------------------------------------------------------------------

/** Maps dirty flags to the stages that need re-upload. */
export const DIRTY_FLAG_TO_STAGES: Record<string, readonly StageId[]> = {
  color: ['primaryGrade', 'secondaryGrade'],
  toneMapping: ['sceneAnalysis'],
  cdl: ['colorPipeline'],
  colorWheels: ['colorPipeline'],
  hsl: ['colorPipeline'],
  zebra: ['diagnostics'],
  channels: ['diagnostics'],
  background: ['compositing'],
  display: ['displayOutput'],
  clarity: ['spatialEffects'],
  sharpen: ['spatialEffectsPost'],
  falseColor: ['diagnostics'],
  curves: ['colorPipeline'],
  vibrance: ['secondaryGrade'],
  highlightsShadows: ['secondaryGrade'],
  inversion: ['displayOutput'],
  lut3d: ['colorPipeline'],
  gamutMapping: ['sceneAnalysis'],
  deinterlace: ['inputDecode'],
  filmEmulation: ['colorPipeline'],
  perspective: ['inputDecode'],
  linearize: ['linearize'],
  inlineLUT: ['primaryGrade'],
  outOfRange: ['sceneAnalysis'],
  channelSwizzle: ['inputDecode'],
  premult: ['inputDecode', 'compositing'],
  dither: ['diagnostics'],
  spherical: ['inputDecode'],
  colorPrimaries: ['linearize', 'displayOutput'],
  contour: ['diagnostics'],
  fileLut3d: ['colorPipeline'],
  displayLut3d: ['displayOutput'],
};

// ---------------------------------------------------------------------------
// Alignment helpers
// ---------------------------------------------------------------------------

/** Align an offset to the given alignment boundary. */
function align(offset: number, alignment: number): number {
  return Math.ceil(offset / alignment) * alignment;
}

// ---------------------------------------------------------------------------
// Uniform data packing
// ---------------------------------------------------------------------------

/**
 * Pack a float value into a buffer at the given byte offset.
 */
function packFloat(view: DataView, offset: number, value: number): number {
  const aligned = align(offset, 4);
  view.setFloat32(aligned, value, true);
  return aligned + 4;
}

/**
 * Pack a signed 32-bit integer into a buffer at the given byte offset.
 * Use for WGSL fields declared as `i32`.
 */
function packI32(view: DataView, offset: number, value: number): number {
  const aligned = align(offset, 4);
  view.setInt32(aligned, value, true);
  return aligned + 4;
}

/**
 * Pack an unsigned 32-bit integer into a buffer at the given byte offset.
 * Use for WGSL fields declared as `u32`.
 */
function packU32(view: DataView, offset: number, value: number): number {
  const aligned = align(offset, 4);
  view.setUint32(aligned, value, true);
  return aligned + 4;
}

/**
 * Pack a vec2f into a buffer at the given byte offset.
 */
function packVec2(view: DataView, offset: number, x: number, y: number): number {
  const aligned = align(offset, 8);
  view.setFloat32(aligned, x, true);
  view.setFloat32(aligned + 4, y, true);
  return aligned + 8;
}

/**
 * Pack a vec3f into a buffer at the given byte offset (aligned to 16).
 */
function packVec3(view: DataView, offset: number, x: number, y: number, z: number): number {
  const aligned = align(offset, 16);
  view.setFloat32(aligned, x, true);
  view.setFloat32(aligned + 4, y, true);
  view.setFloat32(aligned + 8, z, true);
  return aligned + 16; // vec3f takes 16 bytes due to alignment padding
}

/**
 * Pack a vec4f into a buffer at the given byte offset.
 */
function packVec4(view: DataView, offset: number, x: number, y: number, z: number, w: number): number {
  const aligned = align(offset, 16);
  view.setFloat32(aligned, x, true);
  view.setFloat32(aligned + 4, y, true);
  view.setFloat32(aligned + 8, z, true);
  view.setFloat32(aligned + 12, w, true);
  return aligned + 16;
}

/**
 * Pack a mat3x3f into a buffer (3 x vec4f with padding, per WGSL rules).
 * Each column is padded to 16 bytes.
 */
function packMat3(view: DataView, offset: number, mat: Float32Array): number {
  const aligned = align(offset, 16);
  // Column 0
  view.setFloat32(aligned, mat[0]!, true);
  view.setFloat32(aligned + 4, mat[1]!, true);
  view.setFloat32(aligned + 8, mat[2]!, true);
  view.setFloat32(aligned + 12, 0, true); // padding
  // Column 1
  view.setFloat32(aligned + 16, mat[3]!, true);
  view.setFloat32(aligned + 20, mat[4]!, true);
  view.setFloat32(aligned + 24, mat[5]!, true);
  view.setFloat32(aligned + 28, 0, true); // padding
  // Column 2
  view.setFloat32(aligned + 32, mat[6]!, true);
  view.setFloat32(aligned + 36, mat[7]!, true);
  view.setFloat32(aligned + 40, mat[8]!, true);
  view.setFloat32(aligned + 44, 0, true); // padding
  return aligned + 48;
}

// ---------------------------------------------------------------------------
// WebGPUStateUploader
// ---------------------------------------------------------------------------

export class WebGPUStateUploader {
  /** Cached per-stage GPU uniform buffers. */
  private buffers = new Map<StageId, WGPUBuffer>();

  /** Cached per-stage ArrayBuffers for CPU-side data assembly. */
  private cpuBuffers = new Map<StageId, ArrayBuffer>();

  /** LUT textures managed by the uploader. */
  private lutTextures = new Map<string, WGPUTexture>();

  /** Maximum uniform buffer size per stage (generous default). */
  private static readonly MAX_STAGE_BUFFER_SIZE = 512;

  /**
   * Upload uniform data for a specific stage.
   *
   * @param device - GPU device
   * @param stageId - Which pipeline stage to upload for
   * @param state - The current shader state
   * @returns The GPUBuffer containing the stage's uniforms
   */
  uploadStageUniforms(device: WGPUDevice, stageId: StageId, state: Readonly<InternalShaderState>): WGPUBuffer {
    const bufferSize = WebGPUStateUploader.MAX_STAGE_BUFFER_SIZE;

    // Ensure GPU buffer exists
    let gpuBuffer = this.buffers.get(stageId);
    if (!gpuBuffer) {
      gpuBuffer = device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.buffers.set(stageId, gpuBuffer);
    }

    // Ensure CPU staging buffer exists
    let cpuBuffer = this.cpuBuffers.get(stageId);
    if (!cpuBuffer) {
      cpuBuffer = new ArrayBuffer(bufferSize);
      this.cpuBuffers.set(stageId, cpuBuffer);
    }

    // Pack data based on stage
    const view = new DataView(cpuBuffer);
    this.packStageData(view, stageId, state);

    // Upload to GPU — use Uint8Array to preserve raw bytes (mixed f32/i32/u32)
    device.queue.writeBuffer(gpuBuffer, 0, new Uint8Array(cpuBuffer));

    return gpuBuffer;
  }

  /**
   * Upload a 1D LUT texture (curves, false color, film, inline).
   */
  uploadLUT1D(
    device: WGPUDevice,
    key: string,
    data: Uint8Array | Float32Array,
    width: number,
    channels: number,
  ): WGPUTexture {
    // Destroy old texture if exists
    const existing = this.lutTextures.get(key);
    if (existing) {
      existing.destroy();
    }

    const isFloat = data instanceof Float32Array;
    const format = isFloat ? 'rgba32float' : 'rgba8unorm';
    const bytesPerPixel = isFloat ? 16 : 4;

    const texture = device.createTexture({
      size: { width, height: 1 },
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Pad data to RGBA if needed
    let uploadData: ArrayBufferView = data;
    if (channels < 4) {
      if (isFloat) {
        const rgba = new Float32Array(width * 4);
        for (let i = 0; i < width; i++) {
          for (let c = 0; c < channels; c++) {
            rgba[i * 4 + c] = (data as Float32Array)[i * channels + c]!;
          }
          rgba[i * 4 + 3] = 1.0;
        }
        uploadData = rgba;
      } else {
        const rgba = new Uint8Array(width * 4);
        for (let i = 0; i < width; i++) {
          for (let c = 0; c < channels; c++) {
            rgba[i * 4 + c] = (data as Uint8Array)[i * channels + c]!;
          }
          rgba[i * 4 + 3] = 255;
        }
        uploadData = rgba;
      }
    }

    device.queue.writeTexture(
      { texture },
      uploadData,
      { bytesPerRow: width * bytesPerPixel, rowsPerImage: 1 },
      { width, height: 1 },
    );

    this.lutTextures.set(key, texture);
    return texture;
  }

  /**
   * Upload a 3D LUT texture.
   */
  uploadLUT3D(device: WGPUDevice, key: string, data: Float32Array, size: number): WGPUTexture {
    const existing = this.lutTextures.get(key);
    if (existing) {
      existing.destroy();
    }

    // 3D LUTs are stored as a 2D texture atlas (size x size*size)
    const texture = device.createTexture({
      size: { width: size * size, height: size },
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Pack RGB data into RGBA
    const pixelCount = size * size * size;
    const rgba = new Float32Array(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      rgba[i * 4] = data[i * 3]!;
      rgba[i * 4 + 1] = data[i * 3 + 1]!;
      rgba[i * 4 + 2] = data[i * 3 + 2]!;
      rgba[i * 4 + 3] = 1.0;
    }

    device.queue.writeTexture(
      { texture },
      rgba,
      { bytesPerRow: size * size * 16, rowsPerImage: size },
      { width: size * size, height: size },
    );

    this.lutTextures.set(key, texture);
    return texture;
  }

  /** Get a cached LUT texture by key. */
  getLUTTexture(key: string): WGPUTexture | null {
    return this.lutTextures.get(key) ?? null;
  }

  /** Release all GPU resources. */
  dispose(): void {
    for (const buf of this.buffers.values()) {
      buf.destroy();
    }
    this.buffers.clear();
    this.cpuBuffers.clear();

    for (const tex of this.lutTextures.values()) {
      tex.destroy();
    }
    this.lutTextures.clear();
  }

  // ─── Private: Stage data packing ─────────────────────────────────────

  private packStageData(view: DataView, stageId: StageId, state: Readonly<InternalShaderState>): void {
    // Zero out buffer first
    for (let i = 0; i < view.byteLength; i += 4) {
      view.setUint32(i, 0, true);
    }

    switch (stageId) {
      case 'inputDecode':
        this.packInputDecode(view, state);
        break;
      case 'linearize':
        this.packLinearize(view, state);
        break;
      case 'primaryGrade':
        this.packPrimaryGrade(view, state);
        break;
      case 'secondaryGrade':
        this.packSecondaryGrade(view, state);
        break;
      case 'spatialEffects':
        this.packSpatialEffects(view, state);
        break;
      case 'colorPipeline':
        this.packColorPipeline(view, state);
        break;
      case 'sceneAnalysis':
        this.packSceneAnalysis(view, state);
        break;
      case 'spatialEffectsPost':
        this.packSpatialEffectsPost(view, state);
        break;
      case 'displayOutput':
        this.packDisplayOutput(view, state);
        break;
      case 'diagnostics':
        this.packDiagnostics(view, state);
        break;
      case 'compositing':
        this.packCompositing(view, state);
        break;
    }
  }

  // WGSL struct: deinterlaceEnabled: i32, deinterlaceMethod: i32, deinterlaceFieldOrder: i32,
  //   _pad0: i32, perspectiveEnabled: i32, perspectiveQuality: i32, _pad1: vec2f,
  //   perspectiveInvH (mat3 as 3xvec4f), sphericalEnabled: i32, _pad2: f32,
  //   sphericalFov: f32, sphericalAspect: f32, sphericalYaw: f32, sphericalPitch: f32,
  //   _pad3: vec2f, channelSwizzle: vec4i, premultMode: i32, _pad4: i32
  private packInputDecode(view: DataView, state: Readonly<InternalShaderState>): void {
    let off = 0;
    off = packI32(view, off, state.deinterlaceEnabled ? 1 : 0);
    off = packI32(view, off, state.deinterlaceMethod);
    off = packI32(view, off, state.deinterlaceFieldOrder);
    off = packI32(view, off, state.perspectiveEnabled ? 1 : 0);
    off = packMat3(view, off, state.perspectiveInvH);
    off = packI32(view, off, state.perspectiveQuality);
    off = packI32(view, off, state.sphericalEnabled ? 1 : 0);
    off = packFloat(view, off, state.sphericalFov);
    off = packFloat(view, off, state.sphericalAspect);
    off = packFloat(view, off, state.sphericalYaw);
    off = packFloat(view, off, state.sphericalPitch);
    // channelSwizzle is vec4i in WGSL — align to 16, pack as 4 x i32
    off = align(off, 16);
    view.setInt32(off, state.channelSwizzle[0], true);
    view.setInt32(off + 4, state.channelSwizzle[1], true);
    view.setInt32(off + 8, state.channelSwizzle[2], true);
    view.setInt32(off + 12, state.channelSwizzle[3], true);
    off += 16;
    packI32(view, off, state.premultMode);
  }

  // WGSL struct: logType: i32, sRGB2linear: i32, rec709ToLinear: i32, fileGamma: f32,
  //   inputTransfer: i32, alphaType: i32
  private packLinearize(view: DataView, state: Readonly<InternalShaderState>): void {
    let off = 0;
    off = packI32(view, off, state.linearizeLogType);
    off = packI32(view, off, state.linearizeSRGB2linear ? 1 : 0);
    off = packI32(view, off, state.linearizeRec709ToLinear ? 1 : 0);
    off = packFloat(view, off, state.linearizeFileGamma);
    off = packI32(view, off, state.linearizeInputTransfer);
    off = packI32(view, off, state.linearizeAlphaType);
    off = packI32(view, off, state.inputPrimariesEnabled ? 1 : 0);
    // Align to 16 for mat3
    off = align(off, 16);
    packMat3(view, off, state.inputPrimariesMatrix);
  }

  // WGSL struct: exposureRGB: vec4f, scaleRGB: vec4f, offsetRGB: vec4f, gammaRGB: vec4f,
  //   contrastRGB: vec4f, temperature: f32, tint: f32, brightness: f32, saturation: f32,
  //   inlineLUTEnabled: i32, inlineLUTChannels: i32, inlineLUTSize: f32, curvesEnabled: i32
  private packPrimaryGrade(view: DataView, state: Readonly<InternalShaderState>): void {
    const ca = state.colorAdjustments;
    let off = 0;
    off = packFloat(view, off, ca.exposure);
    off = packFloat(view, off, ca.gamma);
    off = packFloat(view, off, ca.contrast);
    off = packFloat(view, off, ca.saturation);
    off = packFloat(view, off, ca.brightness);
    off = packFloat(view, off, ca.temperature);
    off = packFloat(view, off, ca.tint);
    off = packFloat(view, off, ca.scale ?? 1.0);
    off = packFloat(view, off, ca.offset ?? 0.0);
    off = packVec2(view, off, state.texelSize[0], state.texelSize[1]);
    off = packI32(view, off, state.inlineLUTEnabled ? 1 : 0);
    off = packI32(view, off, state.inlineLUTChannels);
    packFloat(view, off, state.inlineLUTSize);
  }

  // WGSL struct: highlights: f32, shadows: f32, whites: f32, blacks: f32,
  //   vibrance: f32, vibranceSkinProtection: i32, hueRotationEnabled: i32, _pad0: f32,
  //   hueRotationMatrix: mat3x3f
  private packSecondaryGrade(view: DataView, state: Readonly<InternalShaderState>): void {
    let off = 0;
    off = packI32(view, off, state.hsEnabled ? 1 : 0);
    off = packFloat(view, off, state.highlightsValue);
    off = packFloat(view, off, state.shadowsValue);
    off = packFloat(view, off, state.whitesValue);
    off = packFloat(view, off, state.blacksValue);
    off = packI32(view, off, state.vibranceEnabled ? 1 : 0);
    off = packFloat(view, off, state.vibranceValue);
    off = packI32(view, off, state.vibranceSkinProtection ? 1 : 0);
    packFloat(view, off, state.colorAdjustments.hueRotation);
  }

  // WGSL struct: clarityEnabled: u32, clarityValue: f32, texelSize: vec2f
  private packSpatialEffects(view: DataView, state: Readonly<InternalShaderState>): void {
    let off = 0;
    off = packU32(view, off, state.clarityEnabled ? 1 : 0);
    off = packFloat(view, off, state.clarityValue);
    packVec2(view, off, state.texelSize[0], state.texelSize[1]);
  }

  // WGSL struct: colorWheelsEnabled: i32, _pad0-2: i32, wheelLift/Gamma/Gain: vec4f,
  //   cdlEnabled: i32, cdlColorspace: i32, cdlSaturation: f32, _pad3: f32,
  //   cdlSlope/Offset/Power: vec4f, hslQualifierEnabled: i32, hslInvert: i32,
  //   hslMattePreview: i32, ..., filmEmulationEnabled: i32, ...,
  //   fileLUT3DEnabled: i32, ..., lookLUT3DEnabled: i32, ...
  private packColorPipeline(view: DataView, state: Readonly<InternalShaderState>): void {
    let off = 0;
    off = packI32(view, off, state.colorWheelsEnabled ? 1 : 0);
    off = packI32(view, off, 0); // padding to align
    off = packI32(view, off, 0); // padding
    off = packI32(view, off, 0); // padding
    off = packVec4(view, off, state.wheelLift[0], state.wheelLift[1], state.wheelLift[2], state.wheelLift[3]);
    off = packVec4(view, off, state.wheelGamma[0], state.wheelGamma[1], state.wheelGamma[2], state.wheelGamma[3]);
    off = packVec4(view, off, state.wheelGain[0], state.wheelGain[1], state.wheelGain[2], state.wheelGain[3]);
    off = packI32(view, off, state.cdlEnabled ? 1 : 0);
    off = packFloat(view, off, state.cdlSaturation);
    off = packI32(view, off, state.cdlColorspace);
    off = packFloat(view, off, 0); // padding
    off = packVec3(view, off, state.cdlSlope[0], state.cdlSlope[1], state.cdlSlope[2]);
    off = packVec3(view, off, state.cdlOffset[0], state.cdlOffset[1], state.cdlOffset[2]);
    off = packVec3(view, off, state.cdlPower[0], state.cdlPower[1], state.cdlPower[2]);
    off = packI32(view, off, state.curvesEnabled ? 1 : 0);
    off = packI32(view, off, state.lut3DEnabled ? 1 : 0);
    off = packFloat(view, off, state.lut3DIntensity);
    off = packFloat(view, off, state.lut3DSize);
    off = packVec3(view, off, state.lookLUT3DDomainMin[0], state.lookLUT3DDomainMin[1], state.lookLUT3DDomainMin[2]);
    off = packVec3(view, off, state.lookLUT3DDomainMax[0], state.lookLUT3DDomainMax[1], state.lookLUT3DDomainMax[2]);
    off = packI32(view, off, state.hslQualifierEnabled ? 1 : 0);
    off = packFloat(view, off, state.hslHueCenter);
    off = packFloat(view, off, state.hslHueWidth);
    off = packFloat(view, off, state.hslHueSoftness);
    off = packFloat(view, off, state.hslSatCenter);
    off = packFloat(view, off, state.hslSatWidth);
    off = packFloat(view, off, state.hslSatSoftness);
    off = packFloat(view, off, state.hslLumCenter);
    off = packFloat(view, off, state.hslLumWidth);
    off = packFloat(view, off, state.hslLumSoftness);
    off = packFloat(view, off, state.hslCorrHueShift);
    off = packFloat(view, off, state.hslCorrSatScale);
    off = packFloat(view, off, state.hslCorrLumScale);
    off = packI32(view, off, state.hslInvert ? 1 : 0);
    off = packI32(view, off, state.hslMattePreview ? 1 : 0);
    off = packI32(view, off, state.filmEnabled ? 1 : 0);
    off = packFloat(view, off, state.filmIntensity);
    off = packFloat(view, off, state.filmSaturation);
    off = packFloat(view, off, state.filmGrainIntensity);
    off = packFloat(view, off, state.filmGrainSeed);
    off = packI32(view, off, state.fileLUT3DEnabled ? 1 : 0);
    off = packFloat(view, off, state.fileLUT3DIntensity);
    off = packFloat(view, off, state.fileLUT3DSize);
    off = packVec3(view, off, state.fileLUT3DDomainMin[0], state.fileLUT3DDomainMin[1], state.fileLUT3DDomainMin[2]);
    packVec3(view, off, state.fileLUT3DDomainMax[0], state.fileLUT3DDomainMax[1], state.fileLUT3DDomainMax[2]);
  }

  // WGSL struct: outOfRange: i32, toneMappingEnabled: i32, toneMappingOperator: i32,
  //   hdrHeadroom: f32, tmReinhardWhitePoint: f32, _pad0: f32, tmFilmicExposureBias: f32,
  //   tmFilmicWhitePoint: f32, tmDragoBias: f32, tmDragoLwa: f32, tmDragoLmax: f32,
  //   tmDragoBrightness: f32, gamutMappingEnabled: i32, gamutMappingModeCode: i32,
  //   gamutSourceCode: i32, gamutTargetCode: i32, gamutHighlightEnabled: i32, ...
  private packSceneAnalysis(view: DataView, state: Readonly<InternalShaderState>): void {
    const tm = state.toneMappingState;
    let off = 0;
    off = packI32(view, off, state.outOfRange);
    off = packI32(view, off, tm.enabled ? 1 : 0);
    off = packI32(view, off, state.gamutMappingEnabled ? 1 : 0);
    off = packI32(view, off, state.gamutMappingModeCode);
    off = packI32(view, off, state.gamutSourceCode);
    off = packI32(view, off, state.gamutTargetCode);
    off = packI32(view, off, state.gamutHighlightEnabled ? 1 : 0);
    // Tone mapping params follow
    off = packFloat(view, off, tm.reinhardWhitePoint ?? 4.0);
    off = packFloat(view, off, tm.filmicExposureBias ?? 2.0);
    off = packFloat(view, off, tm.filmicWhitePoint ?? 11.2);
    off = packFloat(view, off, tm.dragoBias ?? 0.85);
    off = packFloat(view, off, tm.dragoLwa ?? 0.2);
    off = packFloat(view, off, tm.dragoLmax ?? 1.5);
    packFloat(view, off, tm.dragoBrightness ?? 2.0);
  }

  // WGSL struct: sharpenEnabled: u32, sharpenAmount: f32, texelSize: vec2f
  private packSpatialEffectsPost(view: DataView, state: Readonly<InternalShaderState>): void {
    let off = 0;
    off = packU32(view, off, state.sharpenEnabled ? 1 : 0);
    off = packFloat(view, off, state.sharpenAmount);
    packVec2(view, off, state.texelSize[0], state.texelSize[1]);
  }

  // WGSL struct: outputPrimariesEnabled: i32, displayLUT3DEnabled: i32,
  //   displayTransferCode: i32, colorInversionEnabled: i32,
  //   displayGammaOverride: f32, displayBrightnessMultiplier: f32,
  //   displayCustomGamma: f32, displayLUT3DIntensity: f32, displayLUT3DSize: f32, ...
  private packDisplayOutput(view: DataView, state: Readonly<InternalShaderState>): void {
    let off = 0;
    off = packI32(view, off, state.outputPrimariesEnabled ? 1 : 0);
    off = packI32(view, off, state.displayTransferCode);
    off = packFloat(view, off, state.displayGammaOverride);
    off = packFloat(view, off, state.displayBrightnessMultiplier);
    off = packFloat(view, off, state.displayCustomGamma);
    off = packI32(view, off, state.colorInversionEnabled ? 1 : 0);
    off = packI32(view, off, state.displayLUT3DEnabled ? 1 : 0);
    off = packFloat(view, off, state.displayLUT3DIntensity);
    off = packFloat(view, off, state.displayLUT3DSize);
    off = packFloat(view, off, 0); // padding
    off = packFloat(view, off, 0); // padding
    off = packFloat(view, off, 0); // padding
    off = packVec3(
      view,
      off,
      state.displayLUT3DDomainMin[0],
      state.displayLUT3DDomainMin[1],
      state.displayLUT3DDomainMin[2],
    );
    off = packVec3(
      view,
      off,
      state.displayLUT3DDomainMax[0],
      state.displayLUT3DDomainMax[1],
      state.displayLUT3DDomainMax[2],
    );
    off = align(off, 16);
    packMat3(view, off, state.outputPrimariesMatrix);
  }

  // WGSL struct: channelModeCode: i32, falseColorEnabled: i32, contourEnabled: i32,
  //   contourDesaturate: i32, ditherMode: i32, quantizeBits: i32,
  //   zebraEnabled: i32, zebraHighEnabled: i32, zebraLowEnabled: i32,
  //   _pad0-2: i32, zebraHighThreshold: f32, zebraLowThreshold: f32,
  //   zebraTime: f32, contourLevels: f32, contourLineColor: vec3f, ...
  private packDiagnostics(view: DataView, state: Readonly<InternalShaderState>): void {
    let off = 0;
    off = packI32(view, off, state.channelModeCode);
    off = packI32(view, off, state.falseColorEnabled ? 1 : 0);
    off = packI32(view, off, state.zebraEnabled ? 1 : 0);
    off = packFloat(view, off, state.zebraHighThreshold);
    off = packFloat(view, off, state.zebraLowThreshold);
    off = packI32(view, off, state.zebraHighEnabled ? 1 : 0);
    off = packI32(view, off, state.zebraLowEnabled ? 1 : 0);
    off = packFloat(view, off, state.zebraTime);
    off = packI32(view, off, state.ditherMode);
    off = packI32(view, off, state.quantizeBits);
    off = packI32(view, off, state.contourEnabled ? 1 : 0);
    off = packFloat(view, off, state.contourLevels);
    off = packI32(view, off, state.contourDesaturate ? 1 : 0);
    off = packI32(view, off, 0); // padding
    off = packI32(view, off, 0); // padding
    off = packI32(view, off, 0); // padding
    packVec3(view, off, state.contourLineColor[0], state.contourLineColor[1], state.contourLineColor[2]);
  }

  // WGSL struct: premultMode: u32, bgPatternCode: u32, bgCheckerSize: f32,
  //   _pad0: f32, bgColor1: vec4f, bgColor2: vec4f
  private packCompositing(view: DataView, state: Readonly<InternalShaderState>): void {
    let off = 0;
    off = packU32(view, off, state.premultMode);
    off = packU32(view, off, state.bgPatternCode);
    off = packFloat(view, off, state.bgCheckerSize);
    off = packFloat(view, off, 0); // padding
    off = packVec3(view, off, state.bgColor1[0], state.bgColor1[1], state.bgColor1[2]);
    packVec3(view, off, state.bgColor2[0], state.bgColor2[1], state.bgColor2[2]);
  }
}
