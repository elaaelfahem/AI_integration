import { expect, test } from '@playwright/test';

test('login route renders an accessible form', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('main')).toBeVisible();
  await expect(page).toHaveTitle(/DME Workspace/);
  await expect(page.locator('main > section[aria-label]')).toBeVisible();
});

test('robots route prevents indexing the private workspace', async ({
  request,
}) => {
  const response = await request.get('/robots.txt');
  expect(response.ok()).toBeTruthy();
  expect(await response.text()).toContain('Disallow: /');
});

test('login form displays validation feedback', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Connecter' }).click();
  await expect(page.getByRole('status')).toContainText('Échec de la connexion');
  await expect(
    page.getByText('email must be an email', { exact: true }),
  ).toBeVisible();
});

test('invalid invitation displays an actionable error', async ({ page }) => {
  await page.goto('/invite?token=invalid-token');
  await expect(
    page.getByRole('heading', { name: 'Invitation unavailable' }),
  ).toBeVisible();
  await expect(page.locator('p[role="alert"]')).toContainText(
    /invalid|expired/i,
  );
});

test.describe('protected routes', () => {
  for (const route of [
    '/dashboard',
    '/users',
    '/agents',
    '/companies',
    '/assignments',
    '/meetings',
    '/data-sources',
    '/prospection',
    '/reports',
    '/profile',
  ]) {
    test(`${route} redirects anonymous users to login`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL('**/login');
      await expect(page).toHaveURL(/\/login$/);
    });
  }
});
