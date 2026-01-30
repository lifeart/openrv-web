/**
 * Test Image Generator
 *
 * Run with: npx tsx test-assets/generate-test-images.ts
 *
 * Generates test images for E2E and visual testing:
 * - neutral-gray.png: Solid 128,128,128 gray
 * - red-swatch.png: Solid red for YCbCr testing
 * - noisy-image.png: Image with visible noise for NR testing
 * - edge-with-noise.png: Sharp edges + noise for edge preservation test
 * - logo.png: Simple logo for watermark testing
 * - sequence-with-gaps/frame_0001.png through frame_0005.png (missing frame_0003.png)
 */

import { createCanvas } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.dirname(__filename);

function saveCanvas(canvas: ReturnType<typeof createCanvas>, filename: string): void {
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), buffer);
  console.log(`Created: ${filename}`);
}

function createNeutralGray(): void {
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgb(128, 128, 128)';
  ctx.fillRect(0, 0, 256, 256);

  saveCanvas(canvas, 'neutral-gray.png');
}

function createRedSwatch(): void {
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgb(255, 0, 0)';
  ctx.fillRect(0, 0, 256, 256);

  saveCanvas(canvas, 'red-swatch.png');
}

function createNoisyImage(): void {
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');

  // Fill with noise
  const imageData = ctx.createImageData(256, 256);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = Math.floor(Math.random() * 60) + 98; // 98-158 range (centered around 128)
    imageData.data[i] = noise;
    imageData.data[i + 1] = noise;
    imageData.data[i + 2] = noise;
    imageData.data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  saveCanvas(canvas, 'noisy-image.png');
}

function createEdgeWithNoise(): void {
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');

  // Create sharp vertical edge in center with noise
  const imageData = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const noise = Math.floor(Math.random() * 30) - 15; // ±15 noise
      const baseValue = x < 128 ? 64 : 192; // Sharp edge at center
      const value = Math.max(0, Math.min(255, baseValue + noise));

      imageData.data[i] = value;
      imageData.data[i + 1] = value;
      imageData.data[i + 2] = value;
      imageData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  saveCanvas(canvas, 'edge-with-noise.png');
}

function createLogo(): void {
  const canvas = createCanvas(100, 40);
  const ctx = canvas.getContext('2d');

  // Transparent background
  ctx.clearRect(0, 0, 100, 40);

  // Simple text logo
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LOGO', 50, 20);

  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 96, 36);

  saveCanvas(canvas, 'logo.png');
}

function createSequenceWithGaps(): void {
  const seqDir = path.join(OUTPUT_DIR, 'sequence-with-gaps');
  if (!fs.existsSync(seqDir)) {
    fs.mkdirSync(seqDir, { recursive: true });
  }

  // Create frames 1, 2, 4, 5 (missing 3)
  const frames = [1, 2, 4, 5];

  for (const frameNum of frames) {
    const canvas = createCanvas(320, 180);
    const ctx = canvas.getContext('2d');

    // Gradient background that changes per frame
    const gradient = ctx.createLinearGradient(0, 0, 320, 180);
    gradient.addColorStop(0, `hsl(${frameNum * 60}, 70%, 40%)`);
    gradient.addColorStop(1, `hsl(${frameNum * 60 + 30}, 70%, 60%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 320, 180);

    // Frame number text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${frameNum}`, 160, 90);

    const filename = `frame_${String(frameNum).padStart(4, '0')}.png`;
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(seqDir, filename), buffer);
    console.log(`Created: sequence-with-gaps/${filename}`);
  }
}

// Run all generators
console.log('Generating test images...\n');

try {
  createNeutralGray();
  createRedSwatch();
  createNoisyImage();
  createEdgeWithNoise();
  createLogo();
  createSequenceWithGaps();
  console.log('\nAll test images generated successfully!');
} catch (error) {
  console.error('Error generating images:', error);
  console.log('\nNote: This script requires the "canvas" package.');
  console.log('Install with: pnpm add -D canvas');
}
