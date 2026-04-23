// scripts/a11y-audit.js
'use strict';

/**
 * Accessibility audit using Playwright + axe-core.
 *
 * Usage:
 *   BASE_URL=https://www.arcforgedigitallabs.com node scripts/a11y-audit.js
 *
 * Exits with code 1 if any page has serious or critical violations.
 * Step 7's verify-phase29.sh --post invokes this script.
 */

const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const BASE_URL =
  process.env.BASE_URL || 'https://www.arcforgedigitallabs.com';

const PAGES = [
  '/',
  '/privacy',
  '/terms',
  '/about',
  '/press',
  '/support',
];

async function auditPage(browser, path) {
  const url = `${BASE_URL}${path}`;
  // @axe-core/playwright >= 4.9 requires a Page created via an explicit
  // BrowserContext (browser.newPage() shorthand throws "Please use
  // browser.newContext()"). Create + tear down a fresh context per page.
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    return { url, violations: critical, passes: results.passes.length };
  } finally {
    await page.close();
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  const results = [];
  let hasFailures = false;

  console.log(`\naxe-core audit — base URL: ${BASE_URL}\n`);

  for (const path of PAGES) {
    try {
      const result = await auditPage(browser, path);
      const status = result.violations.length === 0 ? '✓' : '✗';
      console.log(
        `${status}  ${result.url}  `
        + `(${result.passes} passes, `
        + `${result.violations.length} serious/critical violations)`,
      );
      if (result.violations.length > 0) {
        hasFailures = true;
        for (const v of result.violations) {
          console.log(`     [${v.impact}] ${v.id}: ${v.description}`);
          for (const node of v.nodes.slice(0, 3)) {
            console.log(`       ${node.html.slice(0, 120)}`);
          }
        }
      }
      results.push(result);
    } catch (err) {
      hasFailures = true;
      console.error(`✗  ${BASE_URL}${path}  ERROR: ${err.message}`);
    }
  }

  await browser.close();

  console.log(`\nAudit complete. Pages audited: ${results.length}`);

  if (hasFailures) {
    console.error(
      '\nFAIL: one or more pages have serious/critical axe violations.',
    );
    process.exit(1);
  }

  console.log('\nPASS: zero serious/critical violations found.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
