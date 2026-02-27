/**
 * Injects global CSS for focus-visible outlines and skip-link styling.
 */

const A11Y_STYLE_ID = 'openrv-a11y-styles';

export function injectA11yStyles(): void {
  if (document.getElementById(A11Y_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = A11Y_STYLE_ID;
  style.textContent = `
    button:focus-visible,
    [tabindex="0"]:focus-visible,
    input:focus-visible,
    select:focus-visible {
      outline: 2px solid var(--accent-primary) !important;
      outline-offset: 2px !important;
    }
    .skip-link {
      position: absolute;
      top: -40px;
      left: 0;
      padding: 8px 16px;
      background: var(--accent-primary);
      color: white;
      z-index: 100000;
      text-decoration: none;
      font-size: 14px;
    }
    .skip-link:focus {
      top: 0;
    }
  `;
  document.head.appendChild(style);
}
