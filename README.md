# 🧪 Stripe + Eveve Unified Booking & Payment Test App

A **developer-facing tool** for validating the complete Eveve booking flow **and** Stripe payment / card-on-file logic – **now wrapped in a single unified React form**.  
It exposes every request/response, lets you replay steps, and guarantees **payment is processed first** before any Eveve `/web/update` call.

---

## 🚀 Tech Stack
| Layer | Library | Notes |
|-------|---------|-------|
| Front-end | **React 18** + **Vite** | SPA served from `/stripetest/` path |
| Styling | **Tailwind CSS** | Utility-first classes |
| Payments | **Stripe Elements** | Payment & Setup Intents |
| Booking API | **Eveve REST** | hold · pi-get · deposit-get · pm-id · update |
| Logging | Custom React Context | Axios interceptor → JSON viewer & cURL export |

---

## 🎯 Purpose
1. **Visualise** the **full booking → payment → confirmation** pipeline.  
2. **Guarantee data integrity** – booking updates only occur *after* successful payment.  
3. Provide **step-by-step testing controls** for QA & integration teams.  
4. Serve as **reference implementation** (see `TECHNICAL_DOCUMENTATION.md`) for porting to other apps.

---

## 🌐 Unified Booking Form Overview
```
Hold URL ➜ UnifiedBookingForm
   ├─ Eveve /web/hold
   ├─ Customer Details
   ├─ (optional) Stripe Elements card entry
   └─ Complete Booking
        ├─ processPayment()        ← payment / setup intent
        ├─ updateBooking()         ← Eveve /web/update
        └─ attachPaymentMethod()   ← Eveve /pm-id
```
**Sequential processing:** if `processPayment()` fails (card declined, network, etc.) **no further Eveve calls are made**.

---

## 🔄 End-to-End Flow (Happy Path)

| Step | API                       | Purpose |
|------|---------------------------|---------|
| 1 | `GET /web/hold`            | Reserve table; returns `uid`, `card` flag |
| 2 | `GET /int/pi-get`          | Retrieve `client_secret` + `public_key` |
| 3 | `GET /int/deposit-get`     | Determine deposit vs no-show amount |
| 4 | **Stripe confirm**         | `confirmCardPayment` or `confirmCardSetup` |
| 5 | `GET /web/update`          | Send customer details (executed **only if 4 succeeds**) |
| 6 | `GET /int/pm-id`           | Attach Stripe `payment_method` to Eveve booking |

---

## 🆕 Key Improvements
1. **Single Unified Form** – users never jump between separate screens.  
2. **Sequential “payment-first” logic** – prevents customer data writes on card decline.  
3. **Comprehensive logging** – every request, response, timing, and cURL snippet.  
4. **Live progress indicator** – HOLD ✔︎ / Details ✔︎ / Payment ✔︎ / Completed ✔︎.  
5. **Technical docs bundle** – see `TECHNICAL_DOCUMENTATION.md`.

---

## ▶️ Quick Start for Developers / Testers

```bash
git clone https://github.com/Scoots78/stripe-booking-form-test.git
cd stripe-booking-form-test
npm install
npm run dev           # http://localhost:3000/stripetest/
```

1. **Paste or click** a sample Eveve *HOLD* URL in the form.  
2. Fill minimal customer details (first, last, email).  
3. If a card is required, follow on-screen buttons to:  
   1. Fetch Stripe keys  
   2. Fetch deposit/no-show info  
   3. Enter card details (Stripe Elements)  
4. Press **Complete Booking** – observe sequential payment → update → attach flow.  
5. Inspect logs, copy cURLs, or download full JSON transcript.

> Reset the flow at any point with the **Reset** button in the header.

---

## 🧪 Testing Scenarios

| Scenario | HOLD URL Button | Test Card | Expected Outcome |
|----------|-----------------|-----------|------------------|
| Deposit required | “Deposit Required (card=2)” | `4242 4242 4242 4242` | Card charged, deposit taken; booking updated |
| No-show protection | “No-Show (card=1)” | `4242 4242 4242 4242` | Card stored; no immediate charge |
| Card decline | use any sample | `4000 0000 0000 0002` | Payment fails, **/web/update not called** |
| Invalid phone / email | N/A | Valid card | Form validation blocks submission |

---

## 💳 Stripe Test Cards
| Result | Number | Notes |
|--------|--------|-------|
| Success | `4242 4242 4242 4242` | Any future date / any CVC |
| Decline | `4000 0000 0000 0002` | Triggers `card_declined` |
| Insufficient funds | `4000 0000 0000 9995` | Triggers `insufficient_funds` |

---

## 🛠️ Troubleshooting

| Symptom | Resolution |
|---------|------------|
| **Stripe form not loading** | Ensure HTTPS (Stripe requirement) & correct `public_key`. |
| **Booking updated but payment missing** | Confirm sequential patch is applied; `processPayment` must resolve `success=true` before `/web/update`. |
| **CORS errors** | If hosting elsewhere, whitelist origin on Eveve test server. |
| **Timer expired** | HOLD URLs expire in 15 min; reset flow and request a new hold. |
| **Assets 404 in production** | Verify app is deployed under `/stripetest/` and `vite.config.js` `base` matches. |

---

## 🏗️ Updated Architecture

```
src/
 ├─ components/
 │   └─ UnifiedBookingForm.jsx   (all flow logic + UI)
 ├─ context/
 │   └─ FlowContext.jsx          (global state machine)
 ├─ api/
 │   ├─ eveve.js                 (Axios wrapper + logging)
 │   └─ stripe.js                (intent helpers)
 ├─ hooks/useLogger.js           (structured log utilities)
 └─ TECHNICAL_DOCUMENTATION.md   (in-depth design & porting guide)
```

*One component* drives the entire sequence – easier to port into other apps.

---

## 🌍 Deployment

1. Build: `npm run build` → `dist/` with paths rooted at **`/stripetest/`**  
2. Serve via any static host (Netlify, S3, Nginx).  
   ```nginx
   location /stripetest/ {
     alias /var/www/stripetest/;
     try_files $uri $uri/ /stripetest/index.html;
   }
   ```
3. HTTPS required for Stripe Elements.

---

## 📜 Comprehensive Logging & Docs
• All network activity captured by Axios interceptors → displayed in **LogDisplay** with copy/download buttons.  
• In-depth architecture, flow charts, and migration guide live in **`TECHNICAL_DOCUMENTATION.md`** – read it before porting.

---

## 🛡️ Disclaimer
**Test environment only** – use Stripe test mode and Eveve sandbox establishments (`TestNZA`). Never submit real payment data.

---

## 📬 Support
Contact the integration team on Slack `#stripe-eveve-testing` or open an issue in this repository.
