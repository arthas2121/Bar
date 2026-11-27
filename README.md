# The Pour House — QR Bar Ordering

A modern, mobile-first bilingual (English / 中文) bar menu and table-ordering starter built with React + Vite.

## Included in this first version
- Table number read from the QR URL, for example `/?table=12`.
- English / Chinese menu labels and category filters.
- Cart quantity controls and order submission.
- Order confirmation and order history in the current browser session.
- No online payment; guests pay at the bar.

## Run locally
```bash
npm install
npm run dev
```

## Demo limitations — read before using in a real bar
This is a front-end prototype. Orders are currently held in browser memory only, so different phones and a staff terminal do **not** share orders. It does not yet include a live staff dashboard, database, staff authentication, menu-management screen, or QR-code image generator.

Before real-world service, add a hosted database/realtime service (for example Supabase), a protected staff dashboard, persistent menu/order storage, and generated QR codes for each table. Replace the sample drinks and prices in `src/main.jsx` with the venue's actual menu and pricing.
