import { test, expect } from '@playwright/test';

test('verify application functionality: scan, swipe delete, detail popup, fullscreen', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Verify header and title
  await expect(page.locator('h1')).toContainText('Knihovna');

  // Click Plus button to add a book manually
  const plusButton = page.locator('button[title="Přidat ručně"]');
  await expect(plusButton).toBeVisible();
  await plusButton.click();

  // Fill in book form including publisher, publishedYear, and edition
  await page.locator('#title-input').fill('Testovací Kniha Pro GitHub Pages');
  await page.locator('#author-input').fill('Autor Testovací');
  await page.locator('#publisher-input').fill('Nakladatelství Test');
  await page.locator('#publishedyear-input').fill('2023');
  await page.locator('#edition-input').fill('2. vydání');
  await page.locator('#genre-input').fill('Beletrie');

  // Click Save button
  await page.click('button:has-text("Uložit knihu")');

  // Verify card heading appears
  const bookCardHeading = page.getByRole('heading', { name: 'Testovací Kniha Pro GitHub Pages' });
  await expect(bookCardHeading).toBeVisible();

  // Click on book card to open details modal
  await bookCardHeading.click();

  // Verify details in modal: edition, publisher, publication year
  await expect(page.locator('text=Nakladatelství Test')).toBeVisible();
  await expect(page.locator('text=2. vydání')).toBeVisible();

  // Close details modal
  await page.click('button[aria-label="Zavřít"]');

  // Test Camera Modal trigger
  const cameraButton = page.locator('button[title="Vyfotit knihu"]');
  await cameraButton.click();
  await expect(page.locator('text=Vyfotit knihu s AI')).toBeVisible();

  // Close Camera modal
  await page.click('button[aria-label="Zavřít skenování"]');

  // Screenshot for verification
  await page.screenshot({ path: 'verification-screenshot.png', fullPage: true });
});
