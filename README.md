# 🏕️ Barrett Cove Campground Availability Checker

Automated bot to check campsite availability at **Barrett Cove Campground** (Lake McClure) via the Campspot booking system.

**Pre-configured for:**
- **Dates:** March 13–14, 2026
- **Campsite Type:** Travel Trailer
- **RV Length:** none (no filter by default)

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
| `--rv-length` | none | RV length in feet |
| `--loop` | off | Continuously re-check |
| `--interval` | `15` | Minutes between checks |
| `--notify` | off | Desktop notification on find |
| `--whatsapp-phone` | none | WhatsApp number in international format (e.g. `15551234567`) |
| `--whatsapp-key` | none | CallMeBot API key |
| `--no-headless` | off | Show the browser window |

## How It Works

1. Launches a headless Chrome browser via Puppeteer
2. Navigates to the Barrett Cove booking page with the date range: `?dates=YYYY-MM-DD,YYYY-MM-DD`
3. Clicks the matching RV type chip in the "Way to Stay" filter UI
4. If `--rv-length` is set, fills the length input using React's native setter to trigger a re-render
5. Clicks the Search/Update button if any filter was applied
6. Waits for results to load, then reads the count from the "N Sites Available" label on the page
7. Saves a debug screenshot to `/tmp/campcheck-results.png`
8. Prints the result count to the terminal and (if sites are found) sends desktop and/or WhatsApp notifications

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
