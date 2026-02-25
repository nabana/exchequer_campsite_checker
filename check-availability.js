#!/usr/bin/env node

/**
 * Barrett Cove Campground Availability Checker
 * 
 * Checks campsite availability at Lake McClure's Barrett Cove using Puppeteer
 * to automate the Campspot booking widget.
 * 
 * Usage:
 *   node check-availability.js
 *   node check-availability.js --check-in 2026-03-13 --check-out 2026-03-14
 *   node check-availability.js --loop --interval 15
 * 
 * Options:
 *   --check-in     Check-in date (YYYY-MM-DD)      [default: 2026-03-13]
 *   --check-out    Check-out date (YYYY-MM-DD)      [default: 2026-03-14]
 *   --rv-type      RV type filter                   [default: "travel trailer"]
 *   --rv-length    RV length in feet                [default: 30]
 *   --loop         Continuously check availability
 *   --interval     Minutes between checks           [default: 15]
 *   --notify       Show desktop notification on availability (macOS/Linux)
 *   --headless     Run in headless mode             [default: true]
 *   --no-headless  Show the browser window
 */

const puppeteer = require('puppeteer');
const { execSync } = require('child_process');

// ─── Configuration ──────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  url: 'https://book.lakemcclure.com/campgrounds/barrett-cove-camping-recreation',
  checkIn: '2026-03-13',
  checkOut: '2026-03-14',
  rvType: 'travel trailer',
  rvLength: null,
  guests: 1,
  loop: false,
  interval: 15,        // minutes
  notify: false,
  headless: true,
  timeout: 60000,      // ms - page load timeout
  waitForResults: 15000, // ms - wait for search results
};

// ─── Parse CLI Arguments ────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--check-in':
        config.checkIn = args[++i];
        break;
      case '--check-out':
        config.checkOut = args[++i];
        break;
      case '--rv-type':
        config.rvType = args[++i];
        break;
      case '--rv-length':
        config.rvLength = parseInt(args[++i], 10);
        break;
      case '--loop':
        config.loop = true;
        break;
      case '--interval':
        config.interval = parseInt(args[++i], 10);
        break;
      case '--notify':
        config.notify = true;
        break;
      case '--headless':
        config.headless = true;
        break;
      case '--no-headless':
        config.headless = false;
        break;
      case '--help':
      case '-h':
        console.log(`
Barrett Cove Campground Availability Checker
─────────────────────────────────────────────
Usage:
  node check-availability.js [options]

Options:
  --check-in  DATE    Check-in date YYYY-MM-DD    (default: ${DEFAULT_CONFIG.checkIn})
  --check-out DATE    Check-out date YYYY-MM-DD   (default: ${DEFAULT_CONFIG.checkOut})
  --rv-type   TYPE    RV type                     (default: "${DEFAULT_CONFIG.rvType}")
  --rv-length FT      RV length in feet           (default: none)
  --loop              Keep checking periodically
  --interval  MIN     Minutes between checks      (default: ${DEFAULT_CONFIG.interval})
  --notify            Desktop notification on find
  --no-headless       Show the browser window
  -h, --help          Show this help
`);
        process.exit(0);
    }
  }
  return config;
}

// ─── Notification Helper ────────────────────────────────────────────────────
function sendNotification(title, message) {
  try {
    if (process.platform === 'darwin') {
      execSync(`osascript -e 'display notification "${message}" with title "${title}"'`);
    } else if (process.platform === 'linux') {
      execSync(`notify-send "${title}" "${message}"`);
    }
  } catch {
    // Notification failed silently - not critical
  }
  // Also play a bell sound in terminal
  process.stdout.write('\x07');
}

// ─── Logging ────────────────────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toLocaleString();
  console.log(`[${ts}] ${msg}`);
}

function logError(msg) {
  const ts = new Date().toLocaleString();
  console.error(`[${ts}] ❌ ${msg}`);
}

// ─── Sleep Helper ───────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Main Check Function ───────────────────────────────────────────────────
async function checkAvailability(config) {
  log('🏕️  Starting availability check...');
  log(`   Check-in:  ${config.checkIn}`);
  log(`   Check-out: ${config.checkOut}`);
  log(`   RV Type:   ${config.rvType}`);
  log(`   RV Length: ${config.rvLength !== null ? config.rvLength + ' ft' : 'any'}`);
  console.log('');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: config.headless ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1280,900',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // ── Navigate with Campspot's documented URL params ──
    // Campspot uses checkInDate/checkOutDate (not checkIn/checkOut)
    const searchUrl = `${config.url}?dates=${config.checkIn},${config.checkOut}`;
    log(`📄 Navigating to: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: config.timeout });
    await sleep(3000);

    // ── Apply RV type filter via UI ──
    log(`🔧 Applying RV filters: ${config.rvType}, ${config.rvLength} ft...`);
    const filterApplied = await page.evaluate((rvType, rvLength) => {
      const applied = { type: false, length: false };

      // Find and click RV type option (Campspot uses buttons/chips for "Way to Stay")
      const allEls = Array.from(document.querySelectorAll('button, [role="button"], [role="option"], li, label'));
      for (const el of allEls) {
        const text = (el.textContent || '').toLowerCase().trim();
        if (text === rvType.toLowerCase() || text.includes(rvType.toLowerCase())) {
          el.click();
          applied.type = true;
          break;
        }
      }

      // Find RV length input and set via React's native setter so it triggers re-render
      if (rvLength !== null) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const lengthInputs = document.querySelectorAll('input[type="number"], input[name*="length"], input[placeholder*="length"], input[placeholder*="Length"]');
        for (const input of lengthInputs) {
          const label = input.closest('label, [class*="field"], [class*="input-group"]');
          const labelText = (label ? label.textContent : '').toLowerCase();
          if (
            labelText.includes('length') ||
            input.name?.includes('length') ||
            input.placeholder?.toLowerCase().includes('length')
          ) {
            nativeSetter.call(input, String(rvLength));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            applied.length = true;
            break;
          }
        }
      }

      return applied;
    }, config.rvType, config.rvLength);

    if (filterApplied.type) log('   ✓ RV type filter applied');
    if (filterApplied.length) log('   ✓ RV length filter applied');

    // If filters were applied, look for a Search/Update button and click it
    if (filterApplied.type || filterApplied.length) {
      await sleep(1000);
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const searchBtn = btns.find((b) => {
          const t = (b.textContent || '').toLowerCase();
          return t === 'search' || t === 'update' || t === 'apply' || t === 'find sites' || t === 'check availability';
        });
        if (searchBtn) searchBtn.click();
      });
    }

    // ── Wait for results to load ──
    log('⏳ Waiting for search results...');
    await sleep(config.waitForResults);

    await page.screenshot({ path: '/tmp/campcheck-results.png', fullPage: true });

    // ── Count results from "N Sites Available" label in the page ──
    const siteCount = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const match = node.textContent.match(/(\d+)\s+sites?\s+available/i);
        if (match) return parseInt(match[1], 10);
      }
      return 0;
    });
    const sourceDesc = 'page label';

    if (config.notify && siteCount > 0) {
      sendNotification(
        '🏕️ Campsite Available!',
        `${siteCount} site(s) available at Barrett Cove for ${config.checkIn}`
      );
    }

    log('\n═══════════════════════════════════════════════');
    log(`📊 Search complete: ${siteCount} result(s) found.`);
    log('═══════════════════════════════════════════════\n');

    await browser.close();
    return siteCount > 0;
  } catch (error) {
    logError(`Check failed: ${error.message}`);
    if (browser) await browser.close();
    return false;
  }
}

// ─── Loop Mode ──────────────────────────────────────────────────────────────
async function runLoop(config) {
  log(`🔄 Loop mode: checking every ${config.interval} minute(s). Press Ctrl+C to stop.\n`);

  while (true) {
    const found = await checkAvailability(config);

    if (found) {
      log('🎉 SITES AVAILABLE! Check the results above.');
      if (config.notify) {
        sendNotification(
          '🏕️ CAMPSITE FOUND!',
          `Sites available at Barrett Cove ${config.checkIn} - ${config.checkOut}!`
        );
      }
    }

    log(`⏰ Next check in ${config.interval} minute(s)...\n`);
    await sleep(config.interval * 60 * 1000);
  }
}

// ─── Entry Point ────────────────────────────────────────────────────────────
(async () => {
  const config = parseArgs();

  console.log(`
╔══════════════════════════════════════════════════╗
║  🏕️  Barrett Cove Campground Availability Bot    ║
║     Lake McClure - Campspot Powered              ║
╚══════════════════════════════════════════════════╝
`);

  if (config.loop) {
    await runLoop(config);
  } else {
    await checkAvailability(config);
  }
})();
