import { describe, it, expect } from 'vitest';
import { createTestDevice, createShaderModule } from './helpers/webgpu';

// Import WGSL shader sources via Vite ?raw
import commonSrc from '../webgpu/shaders/common.wgsl?raw';
import passthroughSrc from '../webgpu/shaders/passthrough.wgsl?raw';
import linearizeSrc from '../webgpu/shaders/linearize.wgsl?raw';
import inputDecodeSrc from '../webgpu/shaders/input_decode.wgsl?raw';
import primaryGradeSrc from '../webgpu/shaders/primary_grade.wgsl?raw';
import secondaryGradeSrc from '../webgpu/shaders/secondary_grade.wgsl?raw';
import spatialEffectsSrc from '../webgpu/shaders/spatial_effects.wgsl?raw';
import colorPipelineSrc from '../webgpu/shaders/color_pipeline.wgsl?raw';
import sceneAnalysisSrc from '../webgpu/shaders/scene_analysis.wgsl?raw';
import spatialEffectsPostSrc from '../webgpu/shaders/spatial_effects_post.wgsl?raw';
import displayOutputSrc from '../webgpu/shaders/display_output.wgsl?raw';
import diagnosticsSrc from '../webgpu/shaders/diagnostics.wgsl?raw';
import compositingSrc from '../webgpu/shaders/compositing.wgsl?raw';

describe('WGSL Shader Compilation (real GPU)', () => {
  it('WebGPU is available in this environment', async () => {
    const gpu = await createTestDevice();
    if (!gpu) {
      console.warn('WebGPU is not available — all WGSL tests will be skipped');
    } else {
      gpu.device.destroy();
    }
    // This test always passes; it exists to make WebGPU availability visible in results
    expect(true).toBe(true);
  });

  it('common.wgsl parses without errors', async () => {
    const gpu = await createTestDevice();
    if (!gpu) return;
    try {
      const module = await createShaderModule(gpu.device, commonSrc, 'common');
      expect(module).toBeTruthy();
    } finally {
      gpu.device.destroy();
    }
  });

  it('passthrough.wgsl compiles (standalone)', async () => {
    const gpu = await createTestDevice();
    if (!gpu) return;
    try {
      const module = await createShaderModule(gpu.device, passthroughSrc, 'passthrough');
      expect(module).toBeTruthy();
    } finally {
      gpu.device.destroy();
    }
  });

  // Stage shaders that depend on common.wgsl
  const stageShaders: Array<{ name: string; src: string }> = [
    { name: 'linearize', src: linearizeSrc },
    { name: 'input_decode', src: inputDecodeSrc },
    { name: 'primary_grade', src: primaryGradeSrc },
    { name: 'secondary_grade', src: secondaryGradeSrc },
    { name: 'spatial_effects', src: spatialEffectsSrc },
    { name: 'color_pipeline', src: colorPipelineSrc },
    { name: 'scene_analysis', src: sceneAnalysisSrc },
    { name: 'spatial_effects_post', src: spatialEffectsPostSrc },
    { name: 'display_output', src: displayOutputSrc },
    { name: 'diagnostics', src: diagnosticsSrc },
    { name: 'compositing', src: compositingSrc },
  ];

  for (const { name, src } of stageShaders) {
    it(`${name}.wgsl compiles (with common.wgsl prepended)`, async () => {
      const gpu = await createTestDevice();
      if (!gpu) return;
      try {
        const fullSource = commonSrc + '\n' + src;
        const module = await createShaderModule(gpu.device, fullSource, name);
        expect(module).toBeTruthy();
      } finally {
        gpu.device.destroy();
      }
    });
  }
});
