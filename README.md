# ANVAYA

Handcrafted Indian ethnic wear: **Alankritha** (women's kurtas) and **Ayanaa** (women's sarees).

A static React + Vite site, deployed on Cloudflare Pages from `main`. Products, stock,
reviews, orders and admin access live in Supabase (see `supabase/drafts/`).

## Run locally

Prerequisites: Node.js 22+.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` (the public publishable key only, never a secret key).
3. Start the dev server: `npm run dev` (http://localhost:3000)

## Checks

- `npm run lint`: TypeScript type check
- `npm test`: unit tests
- `npm run build`: production build into `dist/` (what Cloudflare Pages publishes)

## Deployment

Cloudflare Pages installs with `bun install --frozen-lockfile`, so keep `bun.lock` in step
with `package.json`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for both
Production and Preview; they are built into the site.
