import { test, expect } from '@playwright/test';
import { loadVideoFile, waitForTestHelper, getSessionState, getViewerState } from './fixtures';

/**
 * Network Sync Tests
 *
 * Tests for collaborative viewing features: room creation/joining,
 * playback sync, view sync, user presence, and reconnection.
 *
 * NOTE: Most tests require a mock WebSocket server fixture which is not yet
 * implemented. Those tests are marked with test.skip until the fixture is
 * available. See: https://playwright.dev/docs/mock#mock-websockets
 */

test.describe('Network Sync', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('NET-001: network button is visible in the header', async ({ page }) => {
    // The network / collaboration button should be visible in the header bar
    const networkButton = page.locator(
      'button[title*="Network"], button[title*="Collaborate"], button[title*="Share"], button[data-testid="network-button"], .header-bar button[aria-label*="network" i]'
    ).first();
    await expect(networkButton).toBeVisible({ timeout: 3000 });
  });

  test('NET-002: network panel opens and closes', async ({ page }) => {
    // Click the network button to open the panel
    const networkButton = page.locator(
      'button[title*="Network"], button[title*="Collaborate"], button[title*="Share"], button[data-testid="network-button"], .header-bar button[aria-label*="network" i]'
    ).first();
    await networkButton.click();
    await page.waitForTimeout(300);

    // Network panel should be visible
    const panel = page.locator('[data-testid="network-panel"], .network-panel, [role="dialog"]:has-text("Network"), [role="dialog"]:has-text("Collaborate")').first();
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Close by clicking the button again or pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await expect(panel).not.toBeVisible({ timeout: 3000 });
  });

  // --- Skipped tests requiring mock WebSocket server fixture ---

  test.skip('NET-005: creating a room generates a shareable code', async ({ page }) => {
    // TODO: Requires mock WebSocket server fixture
    const networkButton = page.locator('button[data-testid="network-button"]').first();
    await networkButton.click();
    await page.waitForTimeout(300);

    const panel = page.locator('[data-testid="network-panel"]');
    await expect(panel).toBeVisible();

    // Click "Create Room" button
    const createButton = panel.locator('button:has-text("Create Room"), button:has-text("Create")').first();
    await createButton.click();
    await page.waitForTimeout(500);

    // A room code should be displayed
    const roomCode = panel.locator('[data-testid="room-code"], .room-code');
    await expect(roomCode).toBeVisible();
    const code = await roomCode.textContent();
    expect(code).toBeTruthy();
    expect(code!.length).toBeGreaterThanOrEqual(4);
  });

  test.skip('NET-007: join a room using a room code', async ({ page }) => {
    // TODO: Requires mock WebSocket server fixture
    const networkButton = page.locator('button[data-testid="network-button"]').first();
    await networkButton.click();
    await page.waitForTimeout(300);

    const panel = page.locator('[data-testid="network-panel"]');
    await expect(panel).toBeVisible();

    // Enter a room code in the join input
    const joinInput = panel.locator('input[data-testid="room-code-input"], input[placeholder*="code" i]').first();
    await joinInput.fill('TEST1234');

    // Click "Join" button
    const joinButton = panel.locator('button:has-text("Join")').first();
    await joinButton.click();
    await page.waitForTimeout(500);

    // Should show connected status or room info
    const connectedIndicator = panel.locator('[data-testid="connection-status"], .connection-status, :text("Connected")').first();
    await expect(connectedIndicator).toBeVisible({ timeout: 5000 });
  });

  test.skip('NET-008: leave room and disconnect', async ({ page }) => {
    // TODO: Requires mock WebSocket server fixture
    // First join a room
    const networkButton = page.locator('button[data-testid="network-button"]').first();
    await networkButton.click();
    await page.waitForTimeout(300);

    const panel = page.locator('[data-testid="network-panel"]');
    const createButton = panel.locator('button:has-text("Create Room"), button:has-text("Create")').first();
    await createButton.click();
    await page.waitForTimeout(500);

    // Verify connected
    const connectedIndicator = panel.locator('[data-testid="connection-status"]');
    await expect(connectedIndicator).toBeVisible();

    // Click "Leave" button
    const leaveButton = panel.locator('button:has-text("Leave"), button:has-text("Disconnect")').first();
    await leaveButton.click();
    await page.waitForTimeout(500);

    // Should show disconnected state - the "Create Room" button should reappear
    await expect(createButton).toBeVisible({ timeout: 3000 });
  });

  test.skip('NET-020: user presence list shows connected users', async ({ page }) => {
    // TODO: Requires mock WebSocket server fixture with multiple simulated clients
    const networkButton = page.locator('button[data-testid="network-button"]').first();
    await networkButton.click();
    await page.waitForTimeout(300);

    const panel = page.locator('[data-testid="network-panel"]');
    const createButton = panel.locator('button:has-text("Create Room"), button:has-text("Create")').first();
    await createButton.click();
    await page.waitForTimeout(500);

    // Presence list should exist and show at least the local user
    const presenceList = panel.locator('[data-testid="user-presence-list"], .user-presence-list, .user-list');
    await expect(presenceList).toBeVisible();

    const userEntries = presenceList.locator('[data-testid="user-entry"], .user-entry, li');
    const count = await userEntries.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test.skip('NET-030: playback sync - play/pause propagates to peers', async ({ page }) => {
    // TODO: Requires mock WebSocket server fixture to verify message emission
    const networkButton = page.locator('button[data-testid="network-button"]').first();
    await networkButton.click();
    await page.waitForTimeout(300);

    const panel = page.locator('[data-testid="network-panel"]');
    const createButton = panel.locator('button:has-text("Create Room"), button:has-text("Create")').first();
    await createButton.click();
    await page.waitForTimeout(500);

    // Verify initial state is paused
    let state = await getSessionState(page);
    expect(state.isPlaying).toBe(false);

    // Toggle playback
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    state = await getSessionState(page);
    expect(state.isPlaying).toBe(true);

    // In a full implementation, verify a WebSocket message was sent
    // containing the play state change. This would be checked via
    // the mock WebSocket server fixture capturing outgoing messages.
  });

  test.skip('NET-031: frame position sync propagates to peers', async ({ page }) => {
    // TODO: Requires mock WebSocket server fixture
    const networkButton = page.locator('button[data-testid="network-button"]').first();
    await networkButton.click();
    await page.waitForTimeout(300);

    const panel = page.locator('[data-testid="network-panel"]');
    const createButton = panel.locator('button:has-text("Create Room"), button:has-text("Create")').first();
    await createButton.click();
    await page.waitForTimeout(500);

    // Step to a specific frame
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    const state = await getSessionState(page);
    expect(state.currentFrame).toBeGreaterThan(1);

    // In a full implementation, verify the frame position was sent
    // over the WebSocket to connected peers.
  });

  test.skip('NET-040: view sync - zoom and pan propagate to peers', async ({ page }) => {
    // TODO: Requires mock WebSocket server fixture
    const networkButton = page.locator('button[data-testid="network-button"]').first();
    await networkButton.click();
    await page.waitForTimeout(300);

    const panel = page.locator('[data-testid="network-panel"]');
    const createButton = panel.locator('button:has-text("Create Room"), button:has-text("Create")').first();
    await createButton.click();
    await page.waitForTimeout(500);

    // Change zoom
    await page.keyboard.press('f'); // Fit to window
    await page.waitForTimeout(200);

    const viewState = await getViewerState(page);
    expect(viewState.zoom).toBeGreaterThan(0);

    // In a full implementation, verify the zoom/pan state was synced
    // to peers over the WebSocket connection.
  });

  test.skip('NET-050: reconnection handling after connection drop', async ({ page }) => {
    // TODO: Requires mock WebSocket server fixture with disconnect/reconnect simulation
    const networkButton = page.locator('button[data-testid="network-button"]').first();
    await networkButton.click();
    await page.waitForTimeout(300);

    const panel = page.locator('[data-testid="network-panel"]');
    const createButton = panel.locator('button:has-text("Create Room"), button:has-text("Create")').first();
    await createButton.click();
    await page.waitForTimeout(500);

    // Simulate connection drop by closing the WebSocket from the server side
    // (would be done through mock fixture API)

    // After a brief period, the client should attempt to reconnect
    // Verify a reconnecting indicator appears
    const reconnectingIndicator = page.locator(
      '[data-testid="reconnecting-indicator"], .reconnecting, :text("Reconnecting")'
    ).first();
    await expect(reconnectingIndicator).toBeVisible({ timeout: 10000 });

    // After the mock server accepts the reconnection, verify connected state
    const connectedIndicator = panel.locator('[data-testid="connection-status"]');
    await expect(connectedIndicator).toBeVisible({ timeout: 10000 });
  });
});
