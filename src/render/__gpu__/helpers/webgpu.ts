/// <reference types="@webgpu/types" />

/** Result from createTestDevice — device and adapter handles. */
export interface GPUTestContext {
  device: GPUDevice;
  adapter: GPUAdapter;
}

/**
 * Creates a WebGPU device for testing.
 * Returns null if WebGPU is not available (test should be skipped).
 */
export async function createTestDevice(): Promise<GPUTestContext | null> {
  if (!('gpu' in navigator)) return null;
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  return { device, adapter };
}

/**
 * Creates a shader module from WGSL source.
 * Throws if compilation produces errors.
 */
export async function createShaderModule(device: GPUDevice, code: string, label?: string): Promise<GPUShaderModule> {
  const module = device.createShaderModule({ code, label });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === 'error');
  if (errors.length > 0) {
    throw new Error(`WGSL compilation errors:\n${errors.map((e) => `  line ${e.lineNum}: ${e.message}`).join('\n')}`);
  }
  return module;
}
