/**
 * Verification test: full FFmpeg pipeline
 * Run: npx playwright test --reporter=list
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_VIDEO = path.join(__dirname, '..', 'test-video.mp4');

test('upload, analyze loudness, process with FFmpeg, and download', async ({ page }) => {
  // ── Load app ─────────────────────────────────────
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.app-header')).toBeVisible();

  // ── Upload video ─────────────────────────────────
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('.upload-placeholder').click(),
  ]);
  await fileChooser.setFiles(TEST_VIDEO);
  await expect(page.locator('.file-uploaded')).toBeVisible({ timeout: 30000 });

  // ── Wait for loudness analysis to complete ───────
  // The detected-loudness element appears when analysis finishes
  await expect(page.locator('.detected-loudness')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.dl-main strong')).toContainText('LUFS');

  // Verify it's not the fallback 0 LUFS
  const lufsText = await page.locator('.dl-main strong').textContent();
  const lufsValue = parseFloat(lufsText || '0');
  expect(lufsValue).toBeLessThan(0); // should be negative, not 0
  console.log(`  ✅ Detected loudness: ${lufsValue} LUFS`);

  // ── Select loudness & process ────────────────────
  await page.locator('.loudness-option').nth(3).click(); // -23db EBU R128
  await page.locator('button:has-text("Process Video")').click();

  // ── Wait for processing to complete ──────────────
  await expect(page.locator('.processing-complete')).toBeVisible({ timeout: 120000 });

  // ── Verify download button ───────────────────────
  await expect(page.locator('button:has-text("Download Processed Video")')).toBeVisible();
  console.log('  ✅ FFmpeg processing verified — download ready');
});
