# 🏕️ Barrett Cove Campground Availability Checker

Automated bot to check campsite availability at **Barrett Cove Campground** (Lake McClure) via the Campspot booking system.

**Pre-configured for:**
- **Dates:** March 13–14, 2026
- **Campsite Type:** Travel Trailer
- **RV Length:** 30 ft

---

## Quick Start

```bash
# Install dependencies
npm install

# Run a single check (headless)
npm run check

# Run with visible browser (for debugging)
npm run check:visible

# Loop mode — checks every 15 min with desktop notifications
npm run loop

# Fast loop — checks every 5 min
npm run loop:fast
```

## Custom Options

```bash
node check-availability.js \
  --check-in 2026-03-13 \
  --check-out 2026-03-14 \
  --rv-type "travel trailer" \
  --rv-length 30 \
  --loop \
  --interval 10 \
  --notify
```

| Option | Default | Description |
|--------|---------|-------------|
| `--check-in` | `2026-03-13` | Check-in date (YYYY-MM-DD) |
| `--check-out` | `2026-03-14` | Check-out date (YYYY-MM-DD) |
| `--rv-type` | `travel trailer` | RV type filter |
| `--rv-length` | `30` | RV length in feet |
| `--loop` | off | Continuously re-check |
| `--interval` | `15` | Minutes between checks |
| `--notify` | off | Desktop notification on find |
| `--no-headless` | off | Show the browser window |

## How It Works

1. Launches a headless Chrome browser via Puppeteer
2. Navigates to the Barrett Cove booking page on `book.lakemcclure.com`
3. Enters the search dates and filters
4. Intercepts Campspot API responses for structured availability data
5. Scrapes the rendered page for site cards, prices, and availability
6. Reports results to the terminal (with optional desktop notifications)
7. Saves debug screenshots to `/tmp/campcheck-*.png`

## Tips

- **First run:** Use `--no-headless` to watch the browser and verify it's interacting with the booking form correctly. Campspot's SPA can change its DOM structure.
- **Screenshots:** Check `/tmp/campcheck-*.png` files to see what the bot sees at each step.
- **Rate limiting:** The default 15-minute interval is respectful to the server. Going below 5 minutes isn't recommended.
- **Notifications:** On macOS, you'll get native notifications. On Linux, it uses `notify-send`. A terminal bell also sounds.

## Troubleshooting

If the bot can't find results:

1. Run `--no-headless` to watch the browser
2. Check the screenshots in `/tmp/campcheck-*.png`
3. The Campspot widget may have changed — you may need to update the CSS selectors in the script
4. Try visiting the URL manually and check the browser's Network tab for API endpoints

## Requirements

- Node.js 18+
- npm
- Chrome/Chromium (downloaded automatically by Puppeteer)
