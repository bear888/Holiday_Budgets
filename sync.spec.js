const { test, expect } = require('@playwright/test');

test.describe('Firebase Integration', () => {

  test('Cloud backup section renders in UI', async ({ page }) => {
    await page.goto(`file://${process.cwd()}/index.html`);

    // Create a new trip to enter the app
    await page.click('#newTripBtn');
    await page.fill('#ntName', 'Test Trip');
    await page.click('#ntCreate');

    // Navigate to Settings
    await page.click('[data-tab="settings"]');

    const authText = await page.locator('#authStatusText').textContent();
    expect(authText).toContain('Sign in to securely backup');

    const loginVisible = await page.locator('#loginBtn').isVisible();
    expect(loginVisible).toBeTruthy();
  });

  test('window.holidayApp is properly exposed', async ({ page }) => {
    await page.goto(`file://${process.cwd()}/index.html`);

    const isExposed = await page.evaluate(() => {
      return window.holidayApp !== undefined &&
             typeof window.holidayApp.save === 'function' &&
             typeof window.holidayApp.STORAGE_KEY === 'string';
    });

    expect(isExposed).toBeTruthy();
  });

  test('app-saved event is emitted on save()', async ({ page }) => {
    await page.goto(`file://${process.cwd()}/index.html`);

    const eventEmitted = await page.evaluate(() => {
      return new Promise((resolve) => {
        window.addEventListener('app-saved', (e) => {
          resolve(!!e.detail.app);
        });
        // Trigger a save
        window.holidayApp.save();
      });
    });

    expect(eventEmitted).toBeTruthy();
  });
});
