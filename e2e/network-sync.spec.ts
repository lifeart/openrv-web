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
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('NET-001: network button is visible in the header', async ({ page }) => {
    const networkButton = page.locator('[data-testid="network-sync-button"]').first();
    await expect(networkButton).toBeVisible({ timeout: 3000 });
  });

  test('NET-002: network panel opens and closes', async ({ page }) => {
    const networkButton = page.locator('[data-testid="network-sync-button"]').first();
    await networkButton.click();
    await page.waitForTimeout(300);

    const panel = page.locator('[data-testid="network-panel"]').first();
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Close by clicking the button again or pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await expect(panel).not.toBeVisible({ timeout: 3000 });
  });

  test('NET-003: shared room link auto-joins after entering only a PIN via UI', async ({ page }) => {
    await page.goto('/?room=ABCD-EFGH');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    const networkButton = page.locator('[data-testid="network-sync-button"]').first();
    await networkButton.click();

    const disconnectedPanel = page.locator('[data-testid="network-disconnected-panel"]');
    await expect(disconnectedPanel).toBeVisible({ timeout: 3000 });

    const roomCodeInput = disconnectedPanel.locator('[data-testid="network-room-code-input"]');
    await expect(roomCodeInput).toHaveValue('ABCD-EFGH');
    await expect(roomCodeInput).toHaveJSProperty('readOnly', true);

    const pinInput = disconnectedPanel.locator('[data-testid="network-pin-code-input"]');
    await pinInput.fill('1234');

    await page.waitForFunction(() => {
      const state = (window as { __OPENRV_TEST__?: { getNetworkSyncState?: () => { connectionState: string } } }).__OPENRV_TEST__?.getNetworkSyncState?.();
      return Boolean(state && state.connectionState !== 'disconnected');
    });
  });

  test('NET-004: create room generates share link via UI with websocket fallback to host', async ({ page }) => {
    const networkButton = page.locator('[data-testid="network-sync-button"]').first();
    await networkButton.click();

    const disconnectedPanel = page.locator('[data-testid="network-disconnected-panel"]');
    await expect(disconnectedPanel).toBeVisible({ timeout: 3000 });

    const pinCode = '2468';
    const pinInput = disconnectedPanel.locator('[data-testid="network-pin-code-input"]');
    await pinInput.fill(pinCode);

    const createButton = disconnectedPanel.locator('[data-testid="network-create-room-button"]');
    await createButton.click();

    await page.waitForFunction(() => {
      const state = (window as { __OPENRV_TEST__?: { getNetworkSyncState?: () => { connectionState: string; roomCode: string | null; isHost: boolean } } })
        .__OPENRV_TEST__?.getNetworkSyncState?.();
      return Boolean(state && state.connectionState === 'connected' && state.roomCode && state.isHost);
    }, null, { timeout: 5000 });

    const networkState = await page.evaluate(() => {
      return (window as { __OPENRV_TEST__?: { getNetworkSyncState?: () => { roomCode: string | null; isHost: boolean } } })
        .__OPENRV_TEST__?.getNetworkSyncState?.() ?? null;
    });

    expect(networkState).toBeTruthy();
    expect(networkState?.isHost).toBe(true);
    expect(networkState?.roomCode).toBeTruthy();

    const connectedPanel = page.locator('[data-testid="network-connected-panel"]');
    await expect(connectedPanel).toBeVisible({ timeout: 3000 });

    const shareInput = connectedPanel.locator('[data-testid="network-share-link-input"]');
    await expect(shareInput).toBeVisible({ timeout: 3000 });

    const roomCode = networkState?.roomCode ?? '';
    const initialShareLink = await shareInput.inputValue();
    const initialURL = new URL(initialShareLink);
    expect(initialURL.searchParams.get('room')).toBe(roomCode);
    expect(initialURL.searchParams.get('pin')).toBe(pinCode);

    const copyButton = connectedPanel.locator('[data-testid="network-copy-link-button"]');
    await copyButton.click();

    // Session state hash should appear quickly after the click
    await expect(shareInput).toHaveValue(/#s=/, { timeout: 5000 });
    // WebRTC offer generation may take several seconds (ICE gathering up to 4s)
    await expect(shareInput).toHaveValue(/rtc=/, { timeout: 15000 });
    const shareLinkWithState = await shareInput.inputValue();
    const sharedURL = new URL(shareLinkWithState);
    expect(sharedURL.searchParams.get('room')).toBe(roomCode);
    expect(sharedURL.searchParams.get('pin')).toBe(pinCode);
    expect(sharedURL.hash.startsWith('#s=')).toBe(true);
    expect(sharedURL.searchParams.get('rtc')).toBeTruthy();
  });

  test('NET-006: serverless WebRTC URL flow connects host and guest via UI response link apply', async ({ page, context }) => {
    const networkButton = page.locator('[data-testid="network-sync-button"]').first();
    await networkButton.click();

    const disconnectedPanel = page.locator('[data-testid="network-disconnected-panel"]');
    await expect(disconnectedPanel).toBeVisible({ timeout: 3000 });

    await disconnectedPanel.locator('[data-testid="network-pin-code-input"]').fill('1357');
    await disconnectedPanel.locator('[data-testid="network-create-room-button"]').click();

    await page.waitForFunction(() => {
      const state = (window as { __OPENRV_TEST__?: { getNetworkSyncState?: () => { connectionState: string; isHost: boolean } } })
        .__OPENRV_TEST__?.getNetworkSyncState?.();
      return Boolean(state && state.connectionState === 'connected' && state.isHost);
    }, null, { timeout: 5000 });

    const connectedPanel = page.locator('[data-testid="network-connected-panel"]');
    await expect(connectedPanel).toBeVisible({ timeout: 3000 });
    await connectedPanel.locator('[data-testid="network-copy-link-button"]').click();
    const hostShareInput = connectedPanel.locator('[data-testid="network-share-link-input"]');
    await expect(hostShareInput).toHaveValue(/rtc=/);
    const hostShareLink = await hostShareInput.inputValue();
    const inviteURL = new URL(hostShareLink);
    expect(inviteURL.searchParams.get('rtc')).toBeTruthy();

    const guestPage = await context.newPage();
    await guestPage.goto(inviteURL.toString());
    await guestPage.waitForSelector('#app');
    await waitForTestHelper(guestPage);

    const guestNetworkButton = guestPage.locator('[data-testid="network-sync-button"]').first();
    await guestNetworkButton.click();
    const guestConnectedPanel = guestPage.locator('[data-testid="network-connected-panel"]');
    await expect(guestConnectedPanel).toBeVisible({ timeout: 5000 });
    const guestShareInput = guestConnectedPanel.locator('[data-testid="network-share-link-input"]');
    await expect(guestShareInput).toHaveValue(/rtc=/);
    const guestResponseLink = await guestShareInput.inputValue();
    const responseURL = new URL(guestResponseLink);
    expect(responseURL.searchParams.get('rtc')).toBeTruthy();

    await connectedPanel.locator('[data-testid="network-response-link-input"]').fill(responseURL.toString());
    await connectedPanel.locator('[data-testid="network-apply-response-button"]').click();

    await page.waitForFunction(() => {
      const state = (window as { __OPENRV_TEST__?: { getNetworkSyncState?: () => { userCount: number } } })
        .__OPENRV_TEST__?.getNetworkSyncState?.();
      return Boolean(state && state.userCount >= 2);
    }, null, { timeout: 10000 });

    await guestPage.waitForFunction(() => {
      const state = (window as { __OPENRV_TEST__?: { getNetworkSyncState?: () => { userCount: number } } })
        .__OPENRV_TEST__?.getNetworkSyncState?.();
      return Boolean(state && state.userCount >= 2);
    }, null, { timeout: 10000 });

    await guestPage.close();
  });

  // --- Skipped tests requiring mock WebSocket server fixture ---

  test.fixme('NET-005: creating a room generates a shareable code', async ({ page }) => {
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

  test.fixme('NET-007: join a room using a room code', async ({ page }) => {
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

  test.fixme('NET-008: leave room and disconnect', async ({ page }) => {
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

  test.fixme('NET-020: user presence list shows connected users', async ({ page }) => {
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

  test.fixme('NET-030: playback sync - play/pause propagates to peers', async ({ page }) => {
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

  test.fixme('NET-031: frame position sync propagates to peers', async ({ page }) => {
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

  test.fixme('NET-040: view sync - zoom and pan propagate to peers', async ({ page }) => {
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

  test.fixme('NET-050: reconnection handling after connection drop', async ({ page }) => {
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
