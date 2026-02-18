/**
 * Multi-View EXR Support
 *
 * Multi-view EXR files store stereo (or more) views in a single file.
 * Views are listed in the `multiView` attribute (e.g., ["left", "right"]).
 * Channels are prefixed with the view name (e.g., `left.R`, `right.R`),
 * except that the default (first) view's channels may omit the prefix.
 *
 * This module provides functions to:
 * - Detect multi-view EXR files
 * - List available views
 * - Map channels to views
 * - Decode a specific view
 */

import {
  isEXRFile,
  getEXRInfo,
  decodeEXR,
  type EXRDecodeOptions,
  type EXRDecodeResult,
} from './EXRDecoder';

/**
 * Information about views in a multi-view EXR file
 */
export interface EXRViewInfo {
  /** List of view names (e.g., ["left", "right"]) */
  views: string[];
  /** The default view (first in the multiView list) */
  defaultView: string;
  /** Image width from data window */
  width: number;
  /** Image height from data window */
  height: number;
  /** Map of view name to its channel names (stripped of prefix) */
  channelsByView: Record<string, string[]>;
}

/**
 * Check if a buffer contains a multi-view EXR file.
 *
 * Returns true if the file is a valid EXR with a multiView attribute
 * containing at least one view name.
 */
export function isMultiViewEXR(buffer: ArrayBuffer): boolean {
  if (!isEXRFile(buffer)) {
    return false;
  }
  const info = getEXRInfo(buffer);
  if (!info) {
    return false;
  }
  return Array.isArray(info.multiView) && info.multiView.length > 0;
}

/**
 * Get the list of view names from a multi-view EXR file.
 *
 * Returns an empty array if the file is not a multi-view EXR
 * or if parsing fails.
 */
export function getEXRViews(buffer: ArrayBuffer): string[] {
  if (!isEXRFile(buffer)) {
    return [];
  }
  const info = getEXRInfo(buffer);
  if (!info || !info.multiView) {
    return [];
  }
  return info.multiView;
}

/**
 * Map channels from a channel list to their respective views.
 *
 * For the default view (first in multiView): channels without a view prefix
 * (e.g., "R", "G", "B") are mapped to it, as well as channels with the
 * explicit view prefix (e.g., "left.R").
 *
 * For non-default views: only channels with the view name prefix are matched
 * (e.g., "right.R", "right.G").
 *
 * @param allChannels - All channel names from the EXR header
 * @param views - The list of view names from the multiView attribute
 * @returns A record mapping view name to stripped channel names
 */
export function mapChannelsToViews(
  allChannels: string[],
  views: string[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (views.length === 0) {
    return result;
  }

  const defaultView = views[0]!;

  // Initialize all views
  for (const view of views) {
    result[view] = [];
  }

  // Build a set of all view prefixes for quick lookup
  const viewPrefixes = new Map<string, string>();
  for (const view of views) {
    viewPrefixes.set(view + '.', view);
  }

  // Track which channels have been claimed by a non-default view prefix
  // so we know what's left for the default view
  const claimedByPrefix = new Set<string>();

  // First pass: assign channels with explicit view prefixes
  for (const ch of allChannels) {
    const dotIndex = ch.indexOf('.');
    if (dotIndex > 0) {
      const prefix = ch.substring(0, dotIndex + 1);
      const viewName = viewPrefixes.get(prefix);
      if (viewName !== undefined) {
        const strippedName = ch.substring(dotIndex + 1);
        result[viewName]!.push(strippedName);
        claimedByPrefix.add(ch);
      }
    }
  }

  // Second pass: assign unprefixed channels to the default view
  // (only if they weren't already matched as a prefixed channel)
  for (const ch of allChannels) {
    if (claimedByPrefix.has(ch)) continue;
    const dotIndex = ch.indexOf('.');
    if (dotIndex <= 0) {
      // No prefix or starts with dot — belongs to default view
      // Only add if not already present (from a prefixed version)
      if (!result[defaultView]!.includes(ch)) {
        result[defaultView]!.push(ch);
      }
    }
  }

  return result;
}

/**
 * Get detailed view information from a multi-view EXR file.
 *
 * Returns null if the file is not a valid multi-view EXR.
 */
export function getEXRViewInfo(buffer: ArrayBuffer): EXRViewInfo | null {
  if (!isEXRFile(buffer)) {
    return null;
  }

  const info = getEXRInfo(buffer);
  if (!info || !info.multiView || info.multiView.length === 0) {
    return null;
  }

  const channelsByView = mapChannelsToViews(info.channels, info.multiView);

  return {
    views: info.multiView,
    defaultView: info.multiView[0]!,
    width: info.width,
    height: info.height,
    channelsByView,
  };
}

/**
 * Decode a specific view from a multi-view EXR file.
 *
 * For the default view (first in multiView list): uses unprefixed channels
 * (e.g., R, G, B, A) or prefixed channels (e.g., left.R).
 *
 * For non-default views: uses prefixed channels (e.g., right.R, right.G, right.B).
 *
 * @param buffer - The EXR file data
 * @param viewName - The view to decode (must be present in multiView attribute)
 * @returns The decoded image data, or null if the view is not found
 */
export async function decodeEXRView(
  buffer: ArrayBuffer,
  viewName: string,
): Promise<EXRDecodeResult | null> {
  if (!isEXRFile(buffer)) {
    return null;
  }

  const info = getEXRInfo(buffer);
  if (!info) {
    return null;
  }

  // If not multi-view but viewName requested, check if it makes sense
  const views = info.multiView ?? [];
  if (views.length === 0) {
    // Not a multi-view file — can't decode by view name
    return null;
  }

  if (!views.includes(viewName)) {
    // Requested view doesn't exist
    return null;
  }

  const channelsByView = mapChannelsToViews(info.channels, views);
  const viewChannels = channelsByView[viewName];
  if (!viewChannels || viewChannels.length === 0) {
    return null;
  }

  const defaultView = views[0]!;
  const isDefault = viewName === defaultView;

  // Build a channel remapping for the decodeEXR function.
  // We need to map the actual EXR channel names (possibly prefixed) to RGBA output.
  //
  // For default view: prefer unprefixed channels, fall back to prefixed
  // For non-default view: use prefixed channels
  const remapping: { red?: string; green?: string; blue?: string; alpha?: string } = {};

  // Find the actual EXR channel name for each standard channel
  for (const stripped of viewChannels) {
    const upperStripped = stripped.toUpperCase();
    let actualChannelName: string;

    if (isDefault) {
      // For default view: prefer unprefixed if it exists in the actual channels list
      if (info.channels.includes(stripped)) {
        actualChannelName = stripped;
      } else {
        actualChannelName = viewName + '.' + stripped;
      }
    } else {
      actualChannelName = viewName + '.' + stripped;
    }

    // Verify this channel actually exists in the file
    if (!info.channels.includes(actualChannelName)) {
      continue;
    }

    if (upperStripped === 'R' || upperStripped === 'RED') {
      remapping.red = actualChannelName;
    } else if (upperStripped === 'G' || upperStripped === 'GREEN') {
      remapping.green = actualChannelName;
    } else if (upperStripped === 'B' || upperStripped === 'BLUE') {
      remapping.blue = actualChannelName;
    } else if (upperStripped === 'A' || upperStripped === 'ALPHA') {
      remapping.alpha = actualChannelName;
    } else if (upperStripped === 'Y' || upperStripped === 'LUMINANCE') {
      // Grayscale — map to all RGB
      remapping.red = actualChannelName;
      remapping.green = actualChannelName;
      remapping.blue = actualChannelName;
    }
  }

  const options: EXRDecodeOptions = {
    channelRemapping: remapping,
  };

  // If multi-part, try to find the right part for this view
  if (info.parts && info.parts.length > 1) {
    const viewPart = info.parts.find(p => p.view === viewName);
    if (viewPart) {
      options.partIndex = viewPart.index;
    }
  }

  const result = await decodeEXR(buffer, options);
  return result;
}
