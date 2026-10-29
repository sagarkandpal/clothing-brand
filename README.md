# Clothing Store — catalogue + WhatsApp ordering

A mobile-first streetwear catalogue for a local vendor. Customers browse products, pick a size and colour, and send a pre-filled WhatsApp enquiry. The vendor manages everything from a private admin dashboard. No code changes and no redeploys are needed.

- **Frontend:** React 18, Vite, TypeScript, React Router, hand-written CSS design system
- **Backend:** one Netlify Function (`/api/*`) using the MongoDB Node.js driver
- **Database and images:** MongoDB Atlas (free cluster). Product photos are stored in **GridFS**.
- **Hosting:** Netlify (free plan)

The temporary brand name is **UNRULED**. Rebrand in one place (see [Rebranding](#rebranding)).

---

## Quick start: try it locally without any accounts

```bash
npm install
npm run dev:memory
```

This starts a real local MongoDB (data is kept in `.localdb/`). On the first run it adds 13 clearly-labelled **demo products**, then serves the site and API at http://localhost:5173.

- Store: http://localhost:5173
- Admin: http://localhost:5173/admin. If `.env` doesn't set admin credentials, the local-only login is `admin@local.test` / `local-admin-123`. These defaults are never used in production.

## Local development with MongoDB Atlas

```bash
cp .env.example .env      # fill in the values (see below)
npm run dev               # site + API on http://localhost:5173
npm run seed:demo         # optional: add the demo products
```

`npm run dev` runs the same API handler that Netlify deploys (`server/api.ts`) inside Vite. You don't need the Netlify CLI. Running `netlify dev` also works.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | yes | Atlas connection string. Server-side only, never sent to the browser. |
| `MONGODB_DB_NAME` | no (default `store`) | Database name. |
| `SESSION_SECRET` | yes | 32+ random characters, used to hash session tokens. Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ADMIN_EMAIL` | yes | The only email that can sign in to `/admin`. |
| `ADMIN_PASSWORD` | yes | Its password (8+ characters). Changing either one signs everyone out and the new login works at once. `ADMIN_INITIAL_EMAIL` / `ADMIN_INITIAL_PASSWORD` are accepted as older names. |
| `IMAGE_STORAGE_LIMIT_MB` | no (default `380`) | Uploads are refused above this much photo storage. |
| `WHATSAPP_NUMBER` | no | Fallback number if none is saved in Admin → Settings. |
| `DEVELOPER_WHATSAPP` | no | Developer's number for the "Contact developer" button shown when storage is full. |

Plan limits shown on the admin Storage card (database size, photo limit, warning percentages) live in
`limits.config.json`. Change them there when the plan changes; no code change is needed.

`.env` is git-ignored. `.env.example` contains placeholders only.

## Database setup (MongoDB Atlas)

1. Create a free account at mongodb.com/atlas and deploy a **Free** cluster. Choose a region close to India, e.g. Mumbai (`ap-south-1`).
2. **Database Access:** create a database user with a strong password.
3. **Network Access:** add `0.0.0.0/0`. Netlify Functions don't have fixed IP addresses, so they can't be allow-listed individually. Access is still protected by the user/password in the connection string.
4. **Connect → Drivers:** copy the connection string into `MONGODB_URI`, with your password filled in.

You don't need to create any collections or indexes manually. The app creates its indexes on first connection: unique `slug`, category/date, price, featured, image references, unique admin email, and TTL indexes for sessions and login attempts.

**Admin login:** set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then open `/admin` and sign in with them. The login always comes from these env vars; there is no registration and no password change inside the admin. To change it, edit the env vars (Netlify: Site configuration → Environment variables, then redeploy).

**Forgotten password:** run `npm run admin:reset-password -- owner@example.com` locally with `MONGODB_URI` set in `.env`. It asks for a new password and signs out all devices.

## Deploying to Netlify

1. Push this folder to a GitHub repository.
2. In Netlify: **Add new site → Import an existing project**, then pick the repo. Build settings come from `netlify.toml`: build `npm run build`, publish `dist`, functions `netlify/functions`.
3. **Site configuration → Environment variables:** add `MONGODB_URI`, `MONGODB_DB_NAME`, `SESSION_SECRET`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
4. Deploy. Open `https://<your-site>.netlify.app/admin` and sign in.
5. In **Admin → Settings**, add the WhatsApp number, plus Instagram if you have one. Until a number is saved, WhatsApp buttons are hidden or disabled. They never link to a made-up number.
6. Add your products. Then go to **Dashboard → Remove demo products**, if you seeded them.

What the config already handles:

- **Refreshing deep links** (`/product/...`, `/shop/...`, `/admin`): a SPA fallback in `netlify.toml`. The API function declares `path: "/api/*"`, so per Netlify's documented request order it is matched before that rewrite.
- **Cookies:** on HTTPS the session cookie is `__Host-admin_session` with `Secure; HttpOnly; SameSite=Strict`. Nothing needs configuring. Custom domains work the same way.
- **Security headers** (CSP, HSTS, frame-deny, nosniff) are set in `netlify.toml`.

## Using the admin

On the shop, tapping a colour dot on a product card shows that colour's photo, and the product page opens on that colour.

The public site has three pages: **all products** (`/`, also the homepage), **product details** (`/product/<slug>`) and **About** (`/about`).

Admin screens:

- **Dashboard:** counts, Storage card (database and photo meters: green below 70%, yellow 70–90%, red above 90%, with cleanup tips, and a "Contact developer" button at 100%), and a **Download backup** button.
- **Products:** search, list, "On shop" switch, edit, delete. Delete moves the product to the Trash.
- **Add / edit product:** one page.
  1. Upper Wear or Bottom Wear (big buttons; sizes switch to S–XL or 28–36)
  2. Name, price, MRP (optional), details (optional)
  3. Sizes: tap the chips
  4. Colours: each colour row has its own photos and a big **Available / Sold out** button. There are no stock numbers.
     - **Copy colours from another product** adds a full list (for example 15 colours) in one tap.
     - **Pick from list** offers preset colours; **Add** creates a custom one.
     - **All available** and **All sold out** change every colour at once.
     - A product with no colours gets one Available / Sold out switch.
  5. Photos for all colours (size chart, back, close-up). The first one is the cover.
  6. Show on shop / Featured switches, then **Save**.
- **Trash:** Restore, or delete for good. Products are deleted for good after 30 days; the clean-up runs whenever the Dashboard or Trash opens, so no cron is needed. A backup file downloads automatically before anything is deleted for good.
- **Settings:** WhatsApp number, Instagram, store name, announcement bar, About page text and photo, password.

Limits: up to 20 colours and 30 photos per product. Photos are resized in the browser to 1200 px (thumbnail 480 px) WebP before upload, so they take little space in the free 512 MB database.

Conflict protection: if a product was changed on another device, saving is refused instead of silently overwriting it.

`GET /api/health` returns 200 when the database answers and 503 otherwise. Point an uptime monitor such as UptimeRobot at it (HTTP monitor, 5-minute interval).

## Product photos and mockups

- `product-photos/` holds the vendor's original sample photos. `npm run seed:photos` removes all demo products and (re)creates one product per photo from `scripts/photo-products.ts`. Prices, sizes and stock in that file are **placeholders** — edit them in the admin.
- Every product image is marked **Original photo** or **Mockup** (Admin → Edit product → photo tile). When a product has both, the product page labels which one the customer is looking at. The first image is the cover on cards.
- The app does **not** generate mockups — no image-generation service is connected. To add one: create it in an external tool (e.g. an AI photo editor or a free mockup template), then Admin → Products → Edit → *Add photos* → set it to **Mockup** → drag it to the first position → save. The original photo stays in the gallery.

## Rebranding

- Default name and copy: `shared/brand.ts`. Most of it can also be changed from Admin → Settings without a redeploy.
- Colours, fonts and spacing: CSS tokens at the top of `src/styles/base.css`.
- Favicon: `public/favicon.svg`.
- Categories: `shared/catalog.ts`. Products store the category `slug`, so renaming a label is safe. Changing a slug requires updating existing products.

## Architecture notes

```
netlify/functions/api.mts   Netlify entry (Functions v2, path /api/*)
server/                     API: router, auth, validation, products, GridFS media, settings
shared/                     Types, categories, brand defaults, WhatsApp helpers (client + server)
src/                        Storefront (pages, components) + lazy-loaded admin bundle
scripts/                    Demo seed, local Mongo dev, tests
```

**API**

Public, cached at Netlify's CDN for 60 s and purged automatically when the admin saves:

- `GET /api/products?category=&q=&size=&color=&inStock=1&sort=newest|price-asc|price-desc|featured&page=&limit=`
- `GET /api/products/:slug` (the product plus related products)
- `GET /api/categories`
- `GET /api/settings`
- `GET /api/images/:id/sm|lg`

Admin (session required, checked on the server for every route):

- `POST /api/admin/login`, `POST /api/admin/logout`
- `GET /api/admin/session`, `PUT /api/admin/password`
- `GET /api/admin/stats`
- `GET|POST /api/admin/products`
- `GET|PUT|PATCH|DELETE /api/admin/products/:id`
- `POST /api/admin/media`
- `GET|PUT /api/admin/settings`
- `POST /api/admin/demo/clear`

**Why GridFS works here.** Netlify Functions accept about 6 MB per request. Binary uploads are base64-encoded, so the effective limit is about 4.5 MB. To stay well under it, the browser shrinks each photo to a ~1600 px WebP/JPEG (usually 150–400 KB) and a ~640 px thumbnail before upload. The server checks the file signature (JPEG, PNG or WebP only), the size and the dimensions, and stores both versions in GridFS. Product documents hold only small media ids, never base64. Images are served from `/api/images/...` with `Cache-Control: immutable` and a durable Netlify CDN cache. Each image is fetched from MongoDB roughly once, and every later request is served by the CDN.

**Security**

- scrypt password hashing.
- Random session tokens stored only as HMAC hashes, with server-side expiry and logout.
- HttpOnly + SameSite=Strict cookies, plus an Origin check on all writes.
- Login rate limit: 8 attempts per 15 minutes per IP and per email.
- Strict type validation on every input, so no operator injection is possible.
- Search terms are regex-escaped.
- Errors are generic, with no stack traces sent to clients.
- Prices, stock and image references are always recomputed on the server.

## Free-tier limits the vendor should know (checked October 2026)

**MongoDB Atlas free cluster:** 512 MB storage, 100 operations/second, 10 GB in and 10 GB out per week, 500 connections. It is paused after 30 days with zero connections. The app caps photo storage at 380 MB by default (`limits.config.json`). New photos are about 100–200 KB each (large + thumbnail). A product with 15 colours and one photo per colour therefore uses roughly 2–3 MB, so expect a few hundred such products. The Storage card shows the real numbers and an approximate "room for N more products".

**Netlify free plan:** credit-based, 300 credits per month. Third-party summaries put bandwidth at about 20 credits per GB and each production deploy at about 15 credits. If credits run out, the site is paused until the next month. Day-to-day product edits don't need deploys, and CDN caching keeps function and database usage low. For a small shop this should fit comfortably, but it is not guaranteed for unlimited traffic. Check current numbers in the Netlify dashboard.

These limits are set by the providers and can change.

## Testing

```bash
npm run build      # typecheck + production build
npm run test:api   # 23 API checks against a real temporary MongoDB
npm run dev:memory # then, in another terminal:
npm run test:ui    # 18 browser checks (uses your installed Chrome/Edge); screenshots → .screenshots/
```

**API checks:**

- Anonymous requests to admin routes are rejected.
- Forged cookies are rejected.
- Wrong passwords are rejected.
- NoSQL operator injection is rejected.
- Cross-origin writes are blocked.
- First-admin bootstrap works.
- GridFS upload works, non-images are rejected, and images are served with immutable caching.
- Invalid product data is rejected.
- Product create, list, detail and categories work.
- Search, size, colour, in-stock, price-sort, category and pagination filters work.
- Duplicate names get unique slugs.
- Editing stock works, and stale versions are refused.
- Deactivated products are hidden from the store.
- Images shared between products survive deleting one of them.
- WhatsApp numbers are validated and normalised.
- Logout invalidates the session on the server.
- Login rate limiting works.

**Browser checks (mobile, tablet, desktop):**

- The homepage renders with no horizontal scroll.
- The mobile menu works.
- Search works.
- Filters and sorting update the results and the URL.
- Product page: colour and size selection, disabled sold-out sizes, and WhatsApp disabled when no number is set.
- Deep-link refresh and the 404 page work.
- Admin login, including wrong-password handling.
- Dashboard.
- Saving the WhatsApp setting.
- Adding a product with a real photo upload, colours and stock, through the review step.
- The product appears in New Arrivals.
- The WhatsApp link contains the correct product, price, size, colour and URL.
- The image survives a refresh.
- Editing stock is reflected on the storefront.
- Hiding and deleting a product work.
- The admin pages have no horizontal scroll on mobile.
- Sign-out works.
- No console errors during the run.

**Not tested here:** a real Atlas cluster and a live Netlify deploy. No credentials were available. The function bundle was built with esbuild and exercised through its Netlify entry point locally. Netlify CDN cache purging can only be verified on Netlify itself; if a purge fails, the storefront updates within about 60 seconds anyway.

## Known limitations

- **Demo imagery** consists of original illustrations stamped "Sample image · demo product". They are not photos of real stock. Replace them with real product photos.
- There is no 3D viewer. The gallery is built around high-quality 2D photos. Product images are a list of media ids, so a future 3D model could be added as another media type without redesigning the page.
- The shop has two segments, **Upper Wear** and **Bottom Wear** (`shared/catalog.ts`). The admin just taps one. Older category names (T-Shirts, Jeans…) are moved to their segment automatically on start-up, and old links like `/shop/jeans` redirect.
- HEIC photos upload only in browsers that can decode them, such as Safari. Elsewhere the admin shows a clear message asking for JPG/PNG.
- There is a single admin account, with no staff roles.
