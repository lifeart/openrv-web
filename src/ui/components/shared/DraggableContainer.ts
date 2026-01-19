/**
 * DraggableContainer - Unified draggable overlay container for scopes and panels
 *
 * Features:
 * - Draggable by header
 * - Consistent styling for all scope overlays (histogram, waveform, vectorscope)
 * - Position persistence within bounds
 * - Close button integration
 * - Configurable controls slot
 */

export interface DraggableContainerOptions {
  /** Unique identifier for the container (used for class name and test id) */
  id: string;
  /** Title displayed in the header */
  title: string;
  /** Initial position */
  initialPosition?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
  /** Z-index for stacking order */
  zIndex?: number;
  /** Callback when close button is clicked */
  onClose?: () => void;
  /** Test ID for e2e tests */
  testId?: string;
}

export interface DraggableContainer {
  /** The container element */
  element: HTMLElement;
  /** The header element (for adding custom controls) */
  header: HTMLElement;
  /** The controls container in the header */
  controls: HTMLElement;
  /** The content area */
  content: HTMLElement;
  /** Optional footer element */
  footer: HTMLElement | null;
  /** Show the container */
  show: () => void;
  /** Hide the container */
  hide: () => void;
  /** Check if visible */
  isVisible: () => boolean;
  /** Set a footer element */
  setFooter: (footer: HTMLElement) => void;
  /** Get current position */
  getPosition: () => { x: number; y: number };
  /** Set position */
  setPosition: (x: number, y: number) => void;
  /** Reset position to initial */
  resetPosition: () => void;
  /** Clean up resources */
  dispose: () => void;
}

export function createDraggableContainer(options: DraggableContainerOptions): DraggableContainer {
  const {
    id,
    title,
    initialPosition = { top: '10px', left: '10px' },
    zIndex = 100,
    onClose,
    testId,
  } = options;

  // Track current position
  let currentX = 0;
  let currentY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let visible = false;

  // Create container
  const container = document.createElement('div');
  container.className = `${id}-container draggable-scope-container`;
  container.dataset.testid = testId || `${id}-container`;
  container.style.cssText = `
    position: absolute;
    background: rgba(0, 0, 0, 0.8);
    border: 1px solid #333;
    border-radius: 4px;
    padding: 8px;
    display: none;
    z-index: ${zIndex};
    user-select: none;
  `;

  // Apply initial position
  if (initialPosition.top) container.style.top = initialPosition.top;
  if (initialPosition.bottom) container.style.bottom = initialPosition.bottom;
  if (initialPosition.left) container.style.left = initialPosition.left;
  if (initialPosition.right) container.style.right = initialPosition.right;

  // Prevent viewer from capturing pointer events
  container.addEventListener('pointerdown', (e) => e.stopPropagation());
  container.addEventListener('pointermove', (e) => e.stopPropagation());
  container.addEventListener('pointerup', (e) => e.stopPropagation());

  // Create header
  const header = document.createElement('div');
  header.className = `${id}-header draggable-header`;
  header.dataset.testid = `${id}-header`;
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
    cursor: grab;
  `;

  // Title
  const titleEl = document.createElement('span');
  titleEl.className = `${id}-title`;
  titleEl.textContent = title;
  titleEl.style.cssText = `
    color: #888;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    pointer-events: none;
  `;

  // Controls container
  const controls = document.createElement('div');
  controls.className = `${id}-controls`;
  controls.style.cssText = `
    display: flex;
    gap: 4px;
  `;

  // Close button
  const closeButton = createControlButton('\u00d7', 'Close');
  closeButton.dataset.testid = `${id}-close-button`;
  closeButton.style.fontSize = '14px';
  closeButton.addEventListener('click', () => {
    if (onClose) onClose();
  });
  controls.appendChild(closeButton);

  header.appendChild(titleEl);
  header.appendChild(controls);

  // Content area
  const content = document.createElement('div');
  content.className = `${id}-content`;

  // Footer placeholder
  let footerEl: HTMLElement | null = null;

  // Assemble container
  container.appendChild(header);
  container.appendChild(content);

  // Drag handling
  const handleDragStart = (e: PointerEvent) => {
    // Only start drag if clicking on header (not controls)
    if ((e.target as HTMLElement).closest(`.${id}-controls`)) {
      return;
    }

    isDragging = true;
    header.style.cursor = 'grabbing';

    // Get current position relative to parent
    const rect = container.getBoundingClientRect();
    const parent = container.parentElement;

    if (parent) {
      const parentRect = parent.getBoundingClientRect();
      // Convert viewport coordinates to parent-relative coordinates
      currentX = rect.left - parentRect.left;
      currentY = rect.top - parentRect.top;
    } else {
      currentX = rect.left;
      currentY = rect.top;
    }

    // Store the offset from the click point to the container's top-left
    dragStartX = e.clientX - rect.left;
    dragStartY = e.clientY - rect.top;

    // Clear position styles that use bottom/right and set explicit top/left
    container.style.bottom = '';
    container.style.right = '';
    container.style.top = `${currentY}px`;
    container.style.left = `${currentX}px`;

    header.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const handleDragMove = (e: PointerEvent) => {
    if (!isDragging) return;

    // Get parent bounds (viewer container)
    const parent = container.parentElement;
    if (parent) {
      const parentRect = parent.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Calculate new position relative to parent
      const newX = e.clientX - parentRect.left - dragStartX;
      const newY = e.clientY - parentRect.top - dragStartY;

      // Constrain to parent bounds
      const maxX = parentRect.width - containerRect.width;
      const maxY = parentRect.height - containerRect.height;

      currentX = Math.max(0, Math.min(newX, maxX));
      currentY = Math.max(0, Math.min(newY, maxY));
    } else {
      currentX = e.clientX - dragStartX;
      currentY = e.clientY - dragStartY;
    }

    container.style.left = `${currentX}px`;
    container.style.top = `${currentY}px`;

    e.preventDefault();
  };

  const handleDragEnd = (e: PointerEvent) => {
    if (!isDragging) return;

    isDragging = false;
    header.style.cursor = 'grab';
    header.releasePointerCapture(e.pointerId);
  };

  header.addEventListener('pointerdown', handleDragStart);
  header.addEventListener('pointermove', handleDragMove);
  header.addEventListener('pointerup', handleDragEnd);
  header.addEventListener('pointercancel', handleDragEnd);

  function show(): void {
    if (visible) return;
    visible = true;
    container.style.display = 'block';
  }

  function hide(): void {
    if (!visible) return;
    visible = false;
    container.style.display = 'none';
  }

  function isVisibleFn(): boolean {
    return visible;
  }

  function setFooter(footer: HTMLElement): void {
    if (footerEl) {
      container.removeChild(footerEl);
    }
    footerEl = footer;
    container.appendChild(footerEl);
  }

  function getPosition(): { x: number; y: number } {
    const rect = container.getBoundingClientRect();
    const parent = container.parentElement;
    if (parent) {
      const parentRect = parent.getBoundingClientRect();
      return {
        x: rect.left - parentRect.left,
        y: rect.top - parentRect.top,
      };
    }
    return { x: rect.left, y: rect.top };
  }

  function setPosition(x: number, y: number): void {
    currentX = x;
    currentY = y;
    container.style.top = `${y}px`;
    container.style.left = `${x}px`;
    container.style.bottom = '';
    container.style.right = '';
  }

  function resetPosition(): void {
    container.style.top = initialPosition.top || '';
    container.style.bottom = initialPosition.bottom || '';
    container.style.left = initialPosition.left || '';
    container.style.right = initialPosition.right || '';
  }

  function dispose(): void {
    header.removeEventListener('pointerdown', handleDragStart);
    header.removeEventListener('pointermove', handleDragMove);
    header.removeEventListener('pointerup', handleDragEnd);
    header.removeEventListener('pointercancel', handleDragEnd);
  }

  return {
    element: container,
    header,
    controls,
    content,
    footer: footerEl,
    show,
    hide,
    isVisible: isVisibleFn,
    setFooter,
    getPosition,
    setPosition,
    resetPosition,
    dispose,
  };
}

/**
 * Create a control button for the header
 */
export function createControlButton(text: string, title: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = text;
  button.title = title;
  button.style.cssText = `
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 2px;
    color: #aaa;
    padding: 2px 6px;
    font-size: 9px;
    cursor: pointer;
    transition: background 0.1s;
  `;
  button.addEventListener('mouseenter', () => {
    button.style.background = 'rgba(255, 255, 255, 0.2)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = 'rgba(255, 255, 255, 0.1)';
  });
  return button;
}
