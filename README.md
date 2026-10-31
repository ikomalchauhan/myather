# Rizta Dash

A small installable dashboard for your Ather Rizta's mileage and charging status. It has no connection to Ather on its own — it only reads from two sources you connect yourself:

1. **Your ride-log Google Sheet**, filled by the community `@ev_log_bot` Telegram bot (OCR of your ride-log screenshots).
2. **Your own `ether-dash` instance**, for live battery % and charging status, if it exposes a JSON status endpoint.

## 1. Deploy it (needed for install + live data to work)

Opening `index.html` straight from your file system will *not* work properly — browsers block the sheet fetch and the "Add to Home Screen" install prompt from a `file://` page. Put these files on free static hosting instead, for example:

**GitHub Pages**
1. Create a new GitHub repo, upload all the files in this folder to it.
2. Repo Settings → Pages → Deploy from branch → `main` → `/ (root)`.
3. Your dashboard is live at `https://<you>.github.io/<repo>/`.

**Netlify / Vercel** (drag-and-drop, no git needed)
- Netlify: go to app.netlify.com/drop and drag this folder in.
- Vercel: `npx vercel` from inside this folder (needs Node installed).

Either way you'll get an `https://` URL in under a minute — that's what you open on your phone.

## 2. Install it on your phone

Open the deployed URL in your phone's browser:
- **Android (Chrome)**: menu → "Add to Home screen" / "Install app".
- **iPhone (Safari)**: Share → "Add to Home Screen".

It'll then open full-screen like a native app, with its own icon.

## 3. Connect your ride-log sheet

1. Make sure you're registered with `@ev_log_bot` on Telegram and have shared at least one ride-log screenshot, so your copy of the sheet has data.
2. Open your Google Sheet → **File → Share → Publish to web**.
3. Pick the sheet/tab with your ride data, set the format to **CSV**, click Publish.
4. Copy the link it gives you (ends in `output=csv`).
5. In the app, tap the gear icon → paste that link into **Ride-log sheet (CSV)** → Save.

The dashboard reads distance, odometer and date columns from that sheet (it looks for columns with "distance"/"km", "odo", and "date" in their names — adjust your sheet's headers if nothing shows up).

## 4. Connect ether-dash (optional, for live charging status)

Ather doesn't publish a documented API, so `ether-dash`'s internal endpoints aren't fixed or guaranteed — this app makes a best-effort attempt at a couple of common paths (`/api/status`, `/api/vehicle`, `/status.json`) and shows whatever battery%/charging fields it can find in the response. If none of those match your instance, or your browser blocks the cross-site request, the mileage side of the dashboard still works fine — just open ether-dash directly for live charging status in that case.

If you find the actual working endpoint on your instance (check your browser's Network tab while ether-dash's own page loads), you can paste that full URL into the ether-dash field instead of just the base URL.

## Notes

- All settings are stored only in your phone's browser (`localStorage`) — nothing is sent anywhere except the two URLs you provide, fetched directly from your phone.
- Not affiliated with, endorsed by, or connected to Ather Energy. "Ather" is a trademark of Ather Energy Ltd., referenced here only to describe what this reads from.
