import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mockNetwork } from './mocks.ts';

const AXE_PATH = fileURLToPath(new URL('../node_modules/axe-core/axe.min.js', import.meta.url));

interface Violation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[] }[];
}

/** Runs axe-core (WCAG 2.2 A/AA) and returns serious or critical violations. */
async function seriousViolations(page: Page): Promise<Violation[]> {
  await page.addScriptTag({ path: AXE_PATH });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: Violation[] }> } }).axe;
    const result = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    return result.violations;
  });
  return violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
}

const describe = (violations: Violation[]) => violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`).join('\n');

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test.beforeEach(async ({ page }) => {
      await mockNetwork(page);
      await page.goto('./');
    });

    test('home, results and settings have no serious violations', async ({ page }) => {
      expect(await seriousViolations(page), 'home').toEqual([]);

      await page.getByRole('combobox', { name: 'To' }).fill('Azrieli');
      await page.getByRole('option', { name: /Azrieli Center/ }).click();
      await expect(page.getByRole('article').filter({ hasText: 'Recommended' })).toBeVisible();
      const results = await seriousViolations(page);
      expect(results, describe(results)).toEqual([]);

      await page.getByRole('button', { name: 'Settings' }).first().click();
      const settings = await seriousViolations(page);
      expect(settings, describe(settings)).toEqual([]);
    });

    test('navigation has no serious violations', async ({ page }) => {
      await page.getByRole('combobox', { name: 'To' }).fill('Azrieli');
      await page.getByRole('option', { name: /Azrieli Center/ }).click();
      await page.getByRole('article').filter({ hasText: 'Recommended' }).getByRole('button', { name: 'Start' }).click();
      await expect(page.getByRole('heading', { name: 'Navigate' })).toBeAttached();
      const navigation = await seriousViolations(page);
      expect(navigation, describe(navigation)).toEqual([]);
    });
  });
}
