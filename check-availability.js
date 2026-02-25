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
  rvLength: 30,
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
  --rv-length FT      RV length in feet           (default: ${DEFAULT_CONFIG.rvLength})
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
  log(`   RV Length: ${config.rvLength} ft`);
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

    // Set a realistic user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // ── Intercept network to find API calls ──
    const apiResponses = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (
        url.includes('/api/') &&
        (url.includes('availability') || url.includes('search') || url.includes('sites') || url.includes('campground'))
      ) {
        try {
          const json = await response.json();
          apiResponses.push({ url, data: json });
        } catch {
          // Not JSON, ignore
        }
      }
    });

    // ── Navigate to the booking page ──
    log('📄 Loading booking page...');
    await page.goto(config.url, {
      waitUntil: 'networkidle2',
      timeout: config.timeout,
    });
    await sleep(3000);

    // ── Take a screenshot for debugging ──
    await page.screenshot({ path: '/tmp/campcheck-1-loaded.png', fullPage: false });
    log('   Page loaded. Looking for search controls...');

    // ── Strategy: Try to use the URL with query params first ──
    // Campspot sites often support ?checkIn=&checkOut= parameters
    const searchUrl = `${config.url}?checkIn=${config.checkIn}&checkOut=${config.checkOut}&adults=1`;
    log('📄 Navigating with search parameters...');
    await page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: config.timeout,
    });
    await sleep(5000);
    await page.screenshot({ path: '/tmp/campcheck-2-search.png', fullPage: false });

    // ── Try clicking the date picker and entering dates manually ──
    // Look for common Campspot UI elements
    log('🔍 Looking for date/search inputs...');

    // Try multiple selectors that Campspot might use
    const dateSelectors = [
      'input[placeholder*="Check In"]',
      'input[placeholder*="check in"]',
      'input[name*="checkIn"]',
      'input[name*="check_in"]',
      'input[name*="arrival"]',
      '[data-testid*="date"]',
      '[class*="date-picker"]',
      '[class*="datepicker"]',
      '[class*="DatePicker"]',
      '[class*="check-in"]',
      'button:has-text("Check In")',
      'button:has-text("Reservation Dates")',
      'div[class*="reservation"]',
    ];

    // Try clicking the "Edit" button first (seen in the page HTML)
    const editButton = await page.$('button:has-text("Edit"), a:has-text("Edit"), [class*="edit"]');
    if (editButton) {
      log('   Found Edit button, clicking...');
      await editButton.click();
      await sleep(2000);
      await page.screenshot({ path: '/tmp/campcheck-3-edit.png', fullPage: false });
    }

    // Try clicking on "Reservation Dates" or date area
    try {
      const dateArea = await page.evaluate(() => {
        const elements = document.querySelectorAll('button, div, span, a, input');
        for (const el of elements) {
          const text = (el.textContent || '').toLowerCase();
          if (
            text.includes('check in') ||
            text.includes('reservation date') ||
            text.includes('select date') ||
            text.includes('any dates')
          ) {
            el.click();
            return el.textContent.trim();
          }
        }
        return null;
      });
      if (dateArea) {
        log(`   Clicked date area: "${dateArea}"`);
        await sleep(2000);
        await page.screenshot({ path: '/tmp/campcheck-4-datepicker.png', fullPage: false });
      }
    } catch (e) {
      // Continue
    }

    // ── Navigate the calendar to March 2026 and select dates ──
    log('📅 Attempting to set dates via calendar...');
    
    // Try to find and interact with a calendar
    const calendarFound = await page.evaluate((checkIn, checkOut) => {
      // Look for month navigation buttons
      const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
      
      // Click forward arrows to get to March 2026
      const nextButtons = allButtons.filter((b) => {
        const text = (b.textContent || '').trim();
        const ariaLabel = (b.getAttribute('aria-label') || '').toLowerCase();
        return (
          text === '>' ||
          text === '›' ||
          text === '→' ||
          text === 'Next' ||
          ariaLabel.includes('next') ||
          ariaLabel.includes('forward') ||
          b.querySelector('svg[class*="arrow"], svg[class*="chevron"], svg[class*="next"]')
        );
      });
      
      return {
        nextButtonCount: nextButtons.length,
        allButtonTexts: allButtons.slice(0, 20).map((b) => b.textContent.trim().slice(0, 50)),
      };
    }, config.checkIn, config.checkOut);

    log(`   Calendar navigation buttons found: ${calendarFound.nextButtonCount}`);

    // ── Try a more direct approach: manipulate the URL hash / query ──
    // Many Campspot sites accept bookNow=true with dates
    const bookNowUrl = `${config.url}?bookNow=true&checkIn=${config.checkIn}&checkOut=${config.checkOut}`;
    log('📄 Trying bookNow URL pattern...');
    await page.goto(bookNowUrl, {
      waitUntil: 'networkidle2',
      timeout: config.timeout,
    });
    await sleep(5000);
    await page.screenshot({ path: '/tmp/campcheck-5-booknow.png', fullPage: false });

    // ── Wait for and collect results ──
    log('⏳ Waiting for search results...');
    await sleep(config.waitForResults);
    
    // Take final screenshot
    await page.screenshot({ path: '/tmp/campcheck-6-results.png', fullPage: true });

    // ── Scrape the page for available sites ──
    const results = await page.evaluate((rvType, rvLength) => {
      const data = {
        sitesFound: [],
        noSitesMessage: null,
        pageText: '',
        filterOptions: [],
      };

      // Look for site cards/listings
      const siteCards = document.querySelectorAll(
        '[class*="site-card"], [class*="SiteCard"], [class*="site-result"], ' +
        '[class*="campsite"], [class*="Campsite"], [class*="listing"], ' +
        '[class*="result-card"], [class*="ResultCard"], [data-testid*="site"]'
      );

      siteCards.forEach((card) => {
        const name = card.querySelector(
          '[class*="name"], [class*="title"], h2, h3, h4'
        );
        const price = card.querySelector(
          '[class*="price"], [class*="rate"], [class*="cost"]'
        );
        const details = card.querySelector(
          '[class*="detail"], [class*="info"], [class*="description"]'
        );
        const availability = card.querySelector(
          '[class*="avail"], [class*="status"]'
        );

        data.sitesFound.push({
          name: name ? name.textContent.trim() : 'Unknown',
          price: price ? price.textContent.trim() : '',
          details: details ? details.textContent.trim() : '',
          availability: availability ? availability.textContent.trim() : '',
          fullText: card.textContent.trim().slice(0, 300),
        });
      });

      // Check for "no sites available" message
      const body = document.body.textContent.toLowerCase();
      if (
        body.includes('no sites available') ||
        body.includes('no results') ||
        body.includes('no campsites') ||
        body.includes('nothing available') ||
        body.includes('no availability')
      ) {
        data.noSitesMessage = 'No sites available matching search criteria';
      }

      // Get any visible text about sites
      const mainContent = document.querySelector('main, [class*="content"], [class*="results"]');
      if (mainContent) {
        data.pageText = mainContent.textContent.trim().slice(0, 2000);
      }

      // Look for filter/category elements
      const filters = document.querySelectorAll(
        '[class*="filter"], [class*="category"], [class*="way-to-stay"]'
      );
      filters.forEach((f) => {
        data.filterOptions.push(f.textContent.trim().slice(0, 100));
      });

      return data;
    }, config.rvType, config.rvLength);

    // Also check API responses captured
    log('');
    log('═══════════════════════════════════════════════');
    log('  AVAILABILITY CHECK RESULTS');
    log('═══════════════════════════════════════════════');

    if (apiResponses.length > 0) {
      log(`\n📡 Captured ${apiResponses.length} API response(s):`);
      apiResponses.forEach((resp, i) => {
        log(`   [${i + 1}] ${resp.url}`);
        // Try to extract site availability from API data
        const data = resp.data;
        if (data && (data.sites || data.results || data.campsites || data.availability)) {
          const sites = data.sites || data.results || data.campsites || data.availability;
          if (Array.isArray(sites)) {
            log(`       → ${sites.length} site(s) in response`);
            sites.forEach((site) => {
              const name = site.name || site.siteName || site.title || 'Site';
              const price = site.price || site.rate || site.totalPrice || '';
              const available = site.available !== false;
              log(`       ${available ? '✅' : '❌'} ${name} ${price ? '- ' + price : ''}`);
            });
          }
        }
      });
    }

    if (results.sitesFound.length > 0) {
      log(`\n🏕️  Found ${results.sitesFound.length} campsite(s):`);
      results.sitesFound.forEach((site, i) => {
        log(`\n   [${i + 1}] ${site.name}`);
        if (site.price) log(`       💰 ${site.price}`);
        if (site.details) log(`       📝 ${site.details}`);
        if (site.availability) log(`       📅 ${site.availability}`);
        if (!site.price && !site.details && site.fullText) {
          log(`       📄 ${site.fullText.slice(0, 200)}`);
        }
      });

      if (config.notify) {
        sendNotification(
          '🏕️ Campsite Available!',
          `${results.sitesFound.length} site(s) available at Barrett Cove for ${config.checkIn}`
        );
      }
    } else if (results.noSitesMessage) {
      log(`\n⚠️  ${results.noSitesMessage}`);
    } else {
      log('\n❓ Could not determine availability from page.');
      log('   The site may use a single-page app that requires more interaction.');
      log('   Try running with --no-headless to see the browser and debug.');
      if (results.pageText) {
        log(`\n   Page excerpt: ${results.pageText.slice(0, 500)}`);
      }
    }

    if (results.filterOptions.length > 0) {
      log(`\n🔧 Available filters: ${results.filterOptions.join(' | ')}`);
    }

    log('\n═══════════════════════════════════════════════');
    log(`📸 Screenshots saved to /tmp/campcheck-*.png`);
    log('═══════════════════════════════════════════════\n');

    await browser.close();

    return results.sitesFound.length > 0;
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
║  🏕️  Barrett Cove Campground Availability Bot   ║
║     Lake McClure - Campspot Powered              ║
╚══════════════════════════════════════════════════╝
`);

  if (config.loop) {
    await runLoop(config);
  } else {
    await checkAvailability(config);
  }
})();
