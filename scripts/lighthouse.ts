// Lighthouse run against the production build (`npm run build` first).
// Starts `vite preview`, audits the app with mobile emulation, writes lighthouse-report.html,
// and fails when accessibility, best practices or SEO score below the gate.
//
// Performance is reported but not gated: it is dominated by WebGL map rendering, which depends on
// the machine's GPU (headless CI runners render WebGL in software).
//
// Usage: npm run lighthouse            (CHROME_PATH may point to a Chrome/Chromium binary)

import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const PORT = 4174;
const URL_UNDER_TEST = `http://localhost:${PORT}/ParkNGo/`;
const GATED: Record<string, number> = { accessibility: 95, 'best-practices': 95, seo: 95 };
const REPORT_PATH = new URL('../lighthouse-report.html', import.meta.url);

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const ok = await fetch(url).then(
      (response) => response.ok,
      () => false, // not listening yet
    );
    if (ok) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Preview server did not start at ${url}`);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
try {
  await waitForServer(URL_UNDER_TEST);
  const result = await lighthouse(URL_UNDER_TEST, {
    port: chrome.port,
    output: 'html',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  });
  if (result === undefined) {
    throw new Error('Lighthouse returned no result');
  }
  await writeFile(REPORT_PATH, result.report as string);

  const failures: string[] = [];
  for (const [id, category] of Object.entries(result.lhr.categories)) {
    if (category.score === null) {
      throw new Error(`Lighthouse category ${id} has no score`);
    }
    const score = Math.round(category.score * 100);
    const gate = GATED[id];
    console.log(`${category.title.padEnd(16)} ${String(score).padStart(3)}${gate === undefined ? '  (reported, not gated)' : `  (gate ≥ ${gate})`}`);
    if (gate !== undefined && score < gate) {
      failures.push(`${category.title} ${score} < ${gate}`);
    }
  }
  for (const id of ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift']) {
    const audit = result.lhr.audits[id];
    if (audit === undefined) {
      throw new Error(`Missing Lighthouse audit ${id}`);
    }
    console.log(`  ${audit.title}: ${audit.displayValue}`);
  }
  console.log(`Report: ${REPORT_PATH.pathname}`);
  if (failures.length > 0) {
    throw new Error(`Lighthouse gate failed: ${failures.join(', ')}`);
  }
} finally {
  await chrome.kill();
  server.kill();
}
