# The Pour House — Cocktail QR Ordering

A modern, mobile-first bilingual (English / 中文) cocktail menu and table-ordering starter built with React + Vite.

## Customer experience
- Cocktail-only menu (no beer, wine, or zero-proof categories).
- Table number read from the QR URL, e.g. `/?table=12`.
- English / Chinese labels, cart, and order submission.
- No online payment; guests pay at the bar.

## Staff dashboard
Open `https://YOUR-SITE/?admin=1` to sign in and manage incoming orders. The dashboard subscribes to Supabase Realtime and supports Received → Preparing → Ready.

## Enable shared live orders (required for real service)
1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/schema.sql`.
3. In Supabase Authentication, create a staff email/password user. Keep public sign-ups disabled.
4. Copy that staff user's UUID and add it to `public.staff_users` using the SQL statement shown at the bottom of the schema file.
5. In your hosting provider's environment variables, set:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase publishable/anon key
6. Redeploy the site. The staff user can then sign in at `/?admin=1`.

Never put a Supabase service-role key in frontend environment variables. The public anon/publishable key is intended for browser use and access is restricted by the Row Level Security policies in the SQL schema.

## Run locally
```bash
npm install
cp .env.example .env
npm run dev
```
Fill in the two Supabase values in `.env` to enable shared orders.

## Current limitations
The cocktail names, descriptions, and prices in `src/main.jsx` are sample content. Replace them with the venue's actual cocktail list and prices. The QR URL pattern works now, but you still need to generate/print one QR code per table and deploy the site. Supabase setup and deployment are not completed automatically by this repository update.
