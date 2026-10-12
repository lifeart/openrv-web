/**
 * Synthetic ICC profiles for gain map colour tests (built in code, no binary fixtures).
 */

/** Minimal RGB display ICC profile with colorant tags and an optional cicp tag. */
export function buildICC(colorants: number[][], cicp?: [number, number]): Uint8Array {
  const tags: Array<{ sig: string; data: Uint8Array }> = [];
  ['rXYZ', 'gXYZ', 'bXYZ'].forEach((sig, k) => {
    const data = new Uint8Array(20);
    const v = new DataView(data.buffer);
    data.set([0x58, 0x59, 0x5a, 0x20]); // 'XYZ '
    (colorants[k] ?? []).forEach((c, i) => v.setInt32(8 + i * 4, Math.round(c * 65536)));
    tags.push({ sig, data });
  });
  if (cicp) {
    const data = new Uint8Array(12);
    data.set([0x63, 0x69, 0x63, 0x70]); // 'cicp'
    data.set([cicp[0], cicp[1], 0, 1], 8);
    tags.push({ sig: 'cicp', data });
  }
  const tableEnd = 132 + tags.length * 12;
  const size = tableEnd + tags.reduce((s, t) => s + t.data.length, 0);
  const icc = new Uint8Array(size);
  const view = new DataView(icc.buffer);
  view.setUint32(0, size);
  icc.set([0x6d, 0x6e, 0x74, 0x72], 12); // 'mntr'
  icc.set([0x52, 0x47, 0x42, 0x20], 16); // 'RGB '
  icc.set([0x58, 0x59, 0x5a, 0x20], 20); // 'XYZ '
  icc.set([0x61, 0x63, 0x73, 0x70], 36); // 'acsp'
  view.setUint32(128, tags.length);
  let offset = tableEnd;
  tags.forEach((t, i) => {
    const pos = 132 + i * 12;
    for (let c = 0; c < 4; c++) icc[pos + c] = t.sig.charCodeAt(c);
    view.setUint32(pos + 4, offset);
    view.setUint32(pos + 8, t.data.length);
    icc.set(t.data, offset);
    offset += t.data.length;
  });
  return icc;
}

// Colorants as stored in real profiles (sRGB IEC61966-2.1, Apple Display P3, Adobe RGB 1998).
export const SRGB_ICC = [
  [0.4360747, 0.2225045, 0.0139322],
  [0.3850649, 0.7168786, 0.0971045],
  [0.1430804, 0.0606169, 0.7141733],
];
export const DISPLAY_P3_ICC = [
  [0.515121, 0.241196, -0.001053],
  [0.291977, 0.692245, 0.041885],
  [0.157104, 0.066574, 0.784073],
];
export const ADOBE_RGB_ICC = [
  [0.6097559, 0.3111048, 0.0194702],
  [0.2052401, 0.625568, 0.0608902],
  [0.149224, 0.0632197, 0.7448387],
];
