import { version } from '../../package.json';

/**
 * Host engine version for plugin compatibility checks.
 * Derived from package.json so it stays in sync automatically.
 */
export const ENGINE_VERSION: string = version;

/**
 * Parse a semver string into its numeric components.
 * Accepts "major.minor.patch" (pre-release/build metadata ignored).
 */
export function parseSemVer(version: string): { major: number; minor: number; patch: number } {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Invalid semver string: "${version}"`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * Check whether `hostVersion` satisfies a minimum version requirement.
 * Returns true if hostVersion >= requiredMinVersion.
 */
export function satisfiesMinVersion(hostVersion: string, requiredMinVersion: string): boolean {
  const host = parseSemVer(hostVersion);
  const req = parseSemVer(requiredMinVersion);
  if (host.major !== req.major) return host.major > req.major;
  if (host.minor !== req.minor) return host.minor > req.minor;
  return host.patch >= req.patch;
}
