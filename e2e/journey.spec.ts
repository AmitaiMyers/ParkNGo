import { expect, test } from '@playwright/test';
import { mockNetwork } from './mocks.ts';

test.beforeEach(async ({ page }) => {
  await mockNetwork(page);
  await page.goto('./');
});

async function chooseDestination(page: import('@playwright/test').Page) {
  const destination = page.getByRole('combobox', { name: 'To' });
  await destination.fill('Azrieli');
  await page.getByRole('option', { name: /Azrieli Center/ }).click();
}

test('plan → results → navigate → park → transit → get back to the car', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Plan a park & ride trip' })).toBeVisible();
  await chooseDestination(page);

  // Auto-plans: no "Find" button. Results arrive with highlights and the live-status skip note.
  const recommended = page.getByRole('article').filter({ hasText: 'Recommended' });
  await expect(recommended).toBeVisible();
  await expect(page.getByText('1 lot skipped because it is full or closed right now')).toBeVisible();
  await expect(page.getByText('Compare with', { exact: false })).toBeVisible();
  await expect(recommended.getByRole('img', { name: /^Route: Drive \d+ min/ })).toBeVisible();

  // Changing the vehicle re-plans in place.
  await page.locator('label', { hasText: 'Bicycle' }).click();
  await expect(page.getByRole('radio', { name: 'Bicycle' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Take it with me' })).toBeVisible();
  await page.locator('label', { hasText: 'Car' }).click();
  await expect(page.getByRole('button', { name: 'Take it with me' })).toBeHidden();
  await expect(recommended).toBeVisible();

  await recommended.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Navigate' })).toBeAttached();
  // Banner: distance + instruction (two lines; textContent has no space between them).
  await expect(page.getByRole('status').filter({ hasText: /\d+ k?m\s*(Keep|Turn|Head|Continue|Sharp|Make|Arrive)/ })).toBeVisible();

  await page.getByRole('button', { name: 'I parked — continue' }).click();
  await expect(page.getByText(/Parking saved at/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(page.getByText(/Board \d+/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('button', { name: 'Get me back to my car' })).toBeHidden(); // the trip is still open
  await page.getByRole('button', { name: 'Clear trip' }).click();
  await page.getByRole('button', { name: 'Get me back to my car' }).click();
  await expect(page.getByRole('heading', { name: 'Back to your vehicle' })).toBeVisible();
});

test('Hebrew: the interface mirrors right-to-left', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.getByLabel('Language').selectOption('he');
  await page.getByRole('button', { name: 'סגירה' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.getByRole('heading', { name: 'תכנון נסיעת חנה וסע' })).toBeVisible();
});

test('keyboard only: search, choose with arrows, start navigation', async ({ page }) => {
  const destination = page.getByRole('combobox', { name: 'To' });
  await destination.focus();
  await page.keyboard.type('Azrieli');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(destination).toHaveAttribute('aria-activedescendant', /option-1$/);
  await page.keyboard.press('Enter');
  const start = page.getByRole('article').filter({ hasText: 'Recommended' }).getByRole('button', { name: 'Start' });
  await expect(start).toBeVisible();
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Navigate' })).toBeAttached();
});

test('desktop: side panel layout without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await chooseDestination(page);
  await expect(page.getByRole('article').filter({ hasText: 'Recommended' })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Trip panel' });
  const box = await panel.boundingBox();
  expect(box!.width).toBe(400);
  const overflow = await panel.evaluate((element) => {
    const content = element.lastElementChild!;
    return content.scrollWidth - content.clientWidth;
  });
  expect(overflow).toBe(0);
});

test('reduced motion: the journey still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chooseDestination(page);
  await expect(page.getByRole('article').filter({ hasText: 'Recommended' })).toBeVisible();
});

test('carried scooter: ride → transit → final ride, each with guidance', async ({ page }) => {
  await chooseDestination(page);
  await page.locator('label', { hasText: 'E-scooter' }).click();
  await page.getByRole('button', { name: 'Take it with me' }).click();
  const carryOn = page.getByRole('article').filter({ hasText: 'Take it with you' });
  await expect(carryOn).toBeVisible();
  await carryOn.getByRole('button', { name: /Take it with you/ }).click();
  await carryOn.getByRole('button', { name: 'Start' }).click();

  // 1. Ride to the boarding stop, turn by turn.
  const banner = page.getByRole('status').filter({ hasText: /\d+ k?m/ });
  await expect(banner).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // 2. Public transport steps; the scooter is carried, so no parking is saved.
  await expect(page.getByText(/Board \d+/).first()).toBeVisible();
  await expect(page.getByText(/Parking saved/)).toBeHidden();
  await page.getByRole('button', { name: 'Start riding' }).click();

  // 3. The final ride also gets turn-by-turn guidance, ending at the destination.
  await expect(page.getByRole('status').filter({ hasText: /\d+ k?m/ })).toBeVisible();
  await expect(page.getByText(/Ride → Azrieli Center/)).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: 'Your options' })).toBeVisible();
});

test('Home & Work: add from the chip, then plan with one tap', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Home & Work' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('combobox', { name: 'Search for your work address' }).fill('Azrieli');
  await dialog.getByRole('option', { name: /Azrieli Center/ }).click();
  await expect(dialog.getByText('Azrieli Center, Tel-Aviv', { exact: true }).filter({ visible: true })).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Close' }).click();

  // The Work chip replaces "Add Home & Work" and plans in one tap.
  await expect(page.getByRole('button', { name: 'Add Home & Work' })).toBeHidden();
  await page.getByRole('button', { name: 'Work', exact: true }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Recommended' })).toBeVisible();

  // Saved places are offered first in the search.
  await page.getByRole('button', { name: 'Clear trip' }).click();
  await page.getByRole('combobox', { name: 'To' }).focus();
  await expect(page.getByRole('option').first()).toContainText('Work');

  // And survive a reload (stored on the device).
  await page.reload();
  await expect(page.getByRole('button', { name: 'Work', exact: true })).toBeVisible();
});

test('"Are you OK with…" questions re-plan the trip', async ({ page }) => {
  await chooseDestination(page);
  const recommended = page.getByRole('article').filter({ hasText: 'Recommended' });
  await expect(recommended).toBeVisible();
  const questions = page.getByRole('group', { name: 'Are you OK with…' });
  const paid = questions.getByRole('button', { name: 'Paid parking (free first)' });
  await expect(paid).toHaveAttribute('aria-pressed', 'true');
  await expect(questions.getByRole('button', { name: 'Walking over 1 km' })).toHaveAttribute('aria-pressed', 'false');
  await expect(questions.getByRole('button', { name: 'Parking in Tel Aviv-Yafo' })).toHaveAttribute('aria-pressed', 'false');

  // Free parking only: the paid lots disappear, the free one stays.
  await paid.click();
  await expect(paid).toHaveAttribute('aria-pressed', 'false');
  await expect(recommended).toContainText('Kiryat Arye lot');
  await expect(page.getByRole('article').filter({ hasText: 'Price unknown' })).toHaveCount(0);
});

test('a dropped request does not fail the whole plan', async ({ page }) => {
  // Every street route to one lot fails at the network level (Safari reports "Load failed").
  await page.route('https://api.transitous.org/api/v6/plan?*', (route) => {
    const url = new URL(route.request().url());
    return url.searchParams.get('toPlace') === '32.145000,34.810000' ? route.abort('failed') : route.fallback();
  });
  await chooseDestination(page);
  await expect(page.getByRole('article').filter({ hasText: 'Recommended' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('1 lot could not be checked (connection problem)')).toBeVisible();
});

test('a full outage shows a plain message, not "Load failed"', async ({ page }) => {
  await page.route('https://api.transitous.org/api/v6/plan?*', (route) => route.abort('failed'));
  await page.route('https://api.transitous.org/api/v1/one-to-many?*', (route) => route.abort('failed'));
  await chooseDestination(page);
  await expect(page.getByRole('alert')).toContainText('Couldn’t reach the routing service. Check your connection and try again.', { timeout: 30_000 });
});
