/**
 * Shared utility for resolving CSS custom properties at runtime.
 *
 * Used by canvas-based components that need to draw with theme colors.
 * CSS variables are resolved fresh on each call to support runtime theme switching.
 */

/**
 * Get the value of a CSS custom property from the document root.
 * Returns the fallback if the property is not defined or empty.
 *
 * @param varName - The CSS variable name (e.g., '--bg-primary')
 * @param fallback - The fallback value if the variable is not defined
 * @returns The resolved color value
 */
export function getCSSColor(varName: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
}
