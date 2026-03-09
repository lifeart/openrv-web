/**
 * Stub implementations for N/A Mu commands
 *
 * These functions exist for API discoverability and script compatibility.
 * Each logs a warning explaining why the command is unavailable in openrv-web
 * and returns a sensible default value.
 */

import type { CommandSupportStatus } from './types';

// ── Helpers ──

function stubWarn(name: string, reason: string): void {
  console.warn(`rv.commands.${name}() is not available in openrv-web (${reason})`);
}

// ── Support Status Registry ──

/** Maps command name -> support status */
const supportRegistry = new Map<string, CommandSupportStatus>();

/**
 * Register support status for a command.
 */
export function registerCommandSupport(name: string, status: CommandSupportStatus): void {
  supportRegistry.set(name, status);
}

/**
 * Check if a command is supported.
 * Returns true, false, or 'partial'.
 */
export function isSupported(name: string): CommandSupportStatus {
  return supportRegistry.get(name) ?? false;
}

/**
 * Get all registered command names with their support status.
 */
export function getSupportedCommands(): Array<[string, CommandSupportStatus]> {
  return Array.from(supportRegistry.entries());
}

// ── Audio Cache (N/A — browser manages audio caching) ──

export function setAudioCacheMode(_mode: number): void {
  stubWarn('setAudioCacheMode', 'browser manages audio caching');
}

export function audioCacheMode(): number {
  stubWarn('audioCacheMode', 'browser manages audio caching');
  return 0;
}

// ── View / Window (N/A — browser window management) ──

export function center(): void {
  stubWarn('center', 'browser window positioning not available from script');
}

export function close(): void {
  stubWarn('close', 'cannot close browser tab from script');
}

// ── Hardware Stereo (N/A — no quad-buffer stereo in browsers) ──

export function setHardwareStereoMode(_enabled: boolean): void {
  stubWarn('setHardwareStereoMode', 'no quad-buffer stereo in browsers');
}

export function stereoSupported(): boolean {
  stubWarn('stereoSupported', 'no quad-buffer stereo in browsers');
  return false;
}

// ── Cache System (N/A — browser manages caching) ──

export function setCacheMode(_mode: number): void {
  stubWarn('setCacheMode', 'browser manages caching via HTTP cache');
}

export function cacheMode(): number {
  stubWarn('cacheMode', 'browser manages caching');
  return 0;
}

export function isCaching(): boolean {
  stubWarn('isCaching', 'browser manages caching');
  return false;
}

export function cacheInfo(): Record<string, number> {
  stubWarn('cacheInfo', 'browser manages caching');
  return { used: 0, capacity: 0, lookAhead: 0, lookBehind: 0 };
}

export function cacheSize(): number {
  stubWarn('cacheSize', 'browser manages caching');
  return 0;
}

export function clearAllButFrame(_frame: number): void {
  stubWarn('clearAllButFrame', 'browser manages caching');
}

export function releaseAllUnusedImages(): void {
  stubWarn('releaseAllUnusedImages', 'garbage collector manages memory');
}

export function releaseAllCachedImages(): void {
  stubWarn('releaseAllCachedImages', 'garbage collector manages memory');
}

export function flushCacheNodeOutput(_nodeName: string): void {
  stubWarn('flushCacheNodeOutput', 'browser manages caching');
}

// ── Session File (N/A — no local file system access) ──

export function sessionFileName(): string {
  stubWarn('sessionFileName', 'no local file system');
  return '';
}

export function setSessionFileName(_name: string): void {
  stubWarn('setSessionFileName', 'no local file system');
}

// ── Mu Eval (N/A — no Mu runtime in browser) ──

export function muEval(_code: string): string {
  stubWarn('eval', 'no Mu runtime in browser');
  return '';
}

// ── File System Operations (N/A — no file system access) ──

export function contractSequences(_paths: string[]): string[] {
  stubWarn('contractSequences', 'requires file system access');
  return [];
}

export function sequenceOfFile(_path: string): string {
  stubWarn('sequenceOfFile', 'requires file system access');
  return '';
}

export function existingFilesInSequence(_pattern: string): string[] {
  stubWarn('existingFilesInSequence', 'requires file system access');
  return [];
}

// ── LUT (N/A — updateLUT is deprecated) ──

export function updateLUT(): void {
  stubWarn('updateLUT', 'deprecated in Mu');
}

// ── File Watch (N/A — no file watching in browsers) ──

export function watchFile(_path: string, _watch: boolean): void {
  stubWarn('watchFile', 'no file watching in browsers');
}

// ── Console (N/A — browser has devtools) ──

export function showConsole(): void {
  stubWarn('showConsole', 'use browser DevTools (F12)');
}

export function isConsoleVisible(): boolean {
  stubWarn('isConsoleVisible', 'use browser DevTools (F12)');
  return false;
}

// ── Renderer Type (N/A — always WebGL2) ──

export function setRendererType(_type: string): void {
  stubWarn('setRendererType', 'always WebGL2 in openrv-web');
}

export function getRendererType(): string {
  // Not a full stub — returns a useful value
  return 'WebGL2';
}

// ── Cache Directory (N/A — no local cache dir) ──

export function cacheDir(): string {
  stubWarn('cacheDir', 'no local cache directory in browsers');
  return '';
}

// ── Network Port (N/A — no server socket in browser) ──

export function myNetworkPort(): number {
  stubWarn('myNetworkPort', 'no server socket in browsers');
  return 0;
}

// ── Password Encoding (N/A — security concern) ──

export function encodePassword(_password: string): string {
  stubWarn('encodePassword', 'security concern — use proper auth flow');
  return '';
}

export function decodePassword(_encoded: string): string {
  stubWarn('decodePassword', 'security concern — use proper auth flow');
  return '';
}

// ── Video Devices (N/A — no video output devices in browser) ──

export function videoDeviceIDString(_name: string, _module: string, _index: number): string {
  stubWarn('videoDeviceIDString', 'no video output devices in browsers');
  return '';
}

export function refreshOutputVideoDevice(): void {
  stubWarn('refreshOutputVideoDevice', 'no video output devices in browsers');
}

export function audioTextureID(): number {
  stubWarn('audioTextureID', 'GL texture IDs not exposed in WebGL2');
  return 0;
}

// ── Qt Widgets (N/A — no Qt in web) ──

export function mainWindowWidget(): null {
  stubWarn('mainWindowWidget', 'no Qt widgets in web');
  return null;
}

export function mainViewWidget(): null {
  stubWarn('mainViewWidget', 'no Qt widgets in web');
  return null;
}

export function prefTabWidget(): null {
  stubWarn('prefTabWidget', 'no Qt widgets in web');
  return null;
}

export function sessionBottomToolBar(): null {
  stubWarn('sessionBottomToolBar', 'no Qt widgets in web');
  return null;
}

export function networkAccessManager(): null {
  stubWarn('networkAccessManager', 'use fetch() API instead');
  return null;
}

export function toggleMenuBar(): void {
  stubWarn('toggleMenuBar', 'no native menu bar in web');
}

export function isMenuBarVisible(): boolean {
  stubWarn('isMenuBarVisible', 'no native menu bar in web');
  return false;
}

// ── Spoof Connection (N/A — debug/test only) ──

export function spoofConnectionStream(_name: string, _delay: number): void {
  stubWarn('spoofConnectionStream', 'debug/test feature not available in web');
}

// ── Display Profiles (N/A — no device-specific profiles) ──

export function setDisplayProfilesFromSettings(): string[] {
  stubWarn('setDisplayProfilesFromSettings', 'no device-specific display profiles');
  return [];
}

export function associatedVideoDevice(_name: string): string {
  stubWarn('associatedVideoDevice', 'no video output devices');
  return '';
}

// ── Motion Scope (N/A — complex native UI mode) ──

export function toggleMotionScope(): void {
  stubWarn('toggleMotionScope', 'complex native UI mode not available in web');
}

// ── Cache Usage (extra_commands N/A) ──

export function cacheUsage(): { used: number; capacity: number } {
  stubWarn('cacheUsage', 'browser manages caching');
  return { used: 0, capacity: 0 };
}

// ── Mode Menu (N/A — no native menu bar) ──

export function defineModeMenu(_modeName: string, _menu: unknown, _addToMenuBar: boolean): void {
  stubWarn('defineModeMenu', 'no native menu bar in web — use web-based menus');
}

// ── Register all stubs with the support registry ──

function registerAllStubs(): void {
  const naCommands: string[] = [
    'setAudioCacheMode',
    'audioCacheMode',
    'center',
    'close',
    'setHardwareStereoMode',
    'stereoSupported',
    'setCacheMode',
    'cacheMode',
    'isCaching',
    'cacheInfo',
    'cacheSize',
    'clearAllButFrame',
    'releaseAllUnusedImages',
    'releaseAllCachedImages',
    'flushCacheNodeOutput',
    'sessionFileName',
    'setSessionFileName',
    'eval',
    'contractSequences',
    'sequenceOfFile',
    'existingFilesInSequence',
    'updateLUT',
    'watchFile',
    'showConsole',
    'isConsoleVisible',
    'setRendererType',
    'cacheDir',
    'myNetworkPort',
    'encodePassword',
    'decodePassword',
    'videoDeviceIDString',
    'refreshOutputVideoDevice',
    'audioTextureID',
    'mainWindowWidget',
    'mainViewWidget',
    'prefTabWidget',
    'sessionBottomToolBar',
    'networkAccessManager',
    'toggleMenuBar',
    'isMenuBarVisible',
    'spoofConnectionStream',
    'setDisplayProfilesFromSettings',
    'associatedVideoDevice',
    'toggleMotionScope',
    'cacheUsage',
    'defineModeMenu',
  ];

  for (const name of naCommands) {
    registerCommandSupport(name, false);
  }

  // Register partial commands
  const partialCommands: string[] = [
    'getRendererType',
  ];

  for (const name of partialCommands) {
    registerCommandSupport(name, 'partial');
  }
}

// Auto-register on module load
registerAllStubs();

/**
 * Collect all stub functions into a record for bulk registration on rv.commands.
 */
export function getStubFunctions(): Record<string, (...args: unknown[]) => unknown> {
  return {
    setAudioCacheMode: setAudioCacheMode as (...args: unknown[]) => unknown,
    audioCacheMode: audioCacheMode as (...args: unknown[]) => unknown,
    center,
    close,
    setHardwareStereoMode: setHardwareStereoMode as (...args: unknown[]) => unknown,
    stereoSupported: stereoSupported as (...args: unknown[]) => unknown,
    setCacheMode: setCacheMode as (...args: unknown[]) => unknown,
    cacheMode: cacheMode as (...args: unknown[]) => unknown,
    isCaching: isCaching as (...args: unknown[]) => unknown,
    cacheInfo: cacheInfo as (...args: unknown[]) => unknown,
    cacheSize: cacheSize as (...args: unknown[]) => unknown,
    clearAllButFrame: clearAllButFrame as (...args: unknown[]) => unknown,
    releaseAllUnusedImages,
    releaseAllCachedImages,
    flushCacheNodeOutput: flushCacheNodeOutput as (...args: unknown[]) => unknown,
    sessionFileName: sessionFileName as (...args: unknown[]) => unknown,
    setSessionFileName: setSessionFileName as (...args: unknown[]) => unknown,
    eval: muEval as (...args: unknown[]) => unknown,
    contractSequences: contractSequences as (...args: unknown[]) => unknown,
    sequenceOfFile: sequenceOfFile as (...args: unknown[]) => unknown,
    existingFilesInSequence: existingFilesInSequence as (...args: unknown[]) => unknown,
    updateLUT,
    watchFile: watchFile as (...args: unknown[]) => unknown,
    showConsole,
    isConsoleVisible: isConsoleVisible as (...args: unknown[]) => unknown,
    setRendererType: setRendererType as (...args: unknown[]) => unknown,
    getRendererType: getRendererType as (...args: unknown[]) => unknown,
    cacheDir: cacheDir as (...args: unknown[]) => unknown,
    myNetworkPort: myNetworkPort as (...args: unknown[]) => unknown,
    encodePassword: encodePassword as (...args: unknown[]) => unknown,
    decodePassword: decodePassword as (...args: unknown[]) => unknown,
    videoDeviceIDString: videoDeviceIDString as (...args: unknown[]) => unknown,
    refreshOutputVideoDevice,
    audioTextureID: audioTextureID as (...args: unknown[]) => unknown,
    mainWindowWidget: mainWindowWidget as (...args: unknown[]) => unknown,
    mainViewWidget: mainViewWidget as (...args: unknown[]) => unknown,
    prefTabWidget: prefTabWidget as (...args: unknown[]) => unknown,
    sessionBottomToolBar: sessionBottomToolBar as (...args: unknown[]) => unknown,
    networkAccessManager: networkAccessManager as (...args: unknown[]) => unknown,
    toggleMenuBar,
    isMenuBarVisible: isMenuBarVisible as (...args: unknown[]) => unknown,
    spoofConnectionStream: spoofConnectionStream as (...args: unknown[]) => unknown,
    setDisplayProfilesFromSettings: setDisplayProfilesFromSettings as (...args: unknown[]) => unknown,
    associatedVideoDevice: associatedVideoDevice as (...args: unknown[]) => unknown,
    toggleMotionScope,
    cacheUsage: cacheUsage as (...args: unknown[]) => unknown,
    defineModeMenu: defineModeMenu as (...args: unknown[]) => unknown,
  };
}
