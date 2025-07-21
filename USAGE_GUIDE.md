# 🛠️ Usage Guide – Stripe + Eveve Test App  
*(manual-step edition)*

Welcome!  
This guide explains **exactly** how to drive the developer tool now that **every API stage is manually triggered**.  
Follow it from top-to-bottom the first time; later you can jump straight to the section you need.

---

## 1. Prerequisites

| Item | Notes |
|------|-------|
| Node 18+ | `npm install && npm run dev` |
| Eveve test system | Use URLs from the **TestNZA** environment (sample buttons provided). |
| Stripe | Test mode only (built-in test cards). |
| Browser | Any modern browser with CORS disabled/allowed for the Eveve domains. |

---

## 2. Quick App Tour

```
Header              – Status bar, progress, 3-minute hold countdown
BookingForm         – Enter HOLD URL + Manual step buttons  (keys / deposit / card)
StripePaymentForm   – Appears after you click “Proceed to Card Entry”
UserDetailsForm     – Final customer details & booking completion
LogDisplay          – Live JSON console (copy, export, cURL)
```

Each main area is **self-contained**; nothing progresses until you click its button.

---

## 3. The Full Flow (step-by-step)

| # | Component / Button | API Called | Purpose |
|---|--------------------|------------|---------|
| 0 | **Start Test** (BookingForm) | `/web/hold` | Reserves the slot (3-min hold). |
| 1 | **1. Fetch Stripe Keys** | `/int/pi-get` | Gets `client_secret` + `public_key`. |
| 2 | **2. Fetch Deposit Info** | `/int/deposit-get` | Identifies deposit vs no-show & amount. |
| 3 | **3. Proceed to Card Entry** | — | Renders StripePaymentForm. |
| 4 | **Initialize Stripe Elements** (StripePaymentForm) | — | Loads Stripe.js with Eveve’s `public_key`. |
| 5 | **1. Validate Booking** | `/api/restore` | Confirms UID still valid. |
| 6 | **2. Process Payment** | `Stripe confirm*` | Charges (deposit) or saves (setup) card. |
| 7 | **3. Attach Payment Method** | `/int/pm-id` | Associates PM with booking on Eveve. |
| 8 | **4. Proceed to Customer Details** | — | Shows UserDetailsForm. |
| 9 | **Complete Booking** | `/web/update` | Sends customer info & finalises. |

Only when a step turns **green (✓)** should you move on.

---

## 4. Detailed Button Behaviour

### BookingForm Buttons

| Button | Active When | Disabled When | Result in Log |
|--------|-------------|---------------|---------------|
| **Start Test** | HOLD URL present, state = IDLE | During any active flow | “Booking hold successful …” |
| **1. Fetch Stripe Keys** | Booking card > 0 **AND** no keys yet | After keys retrieved | Logs `pi-get` request & response. |
| **2. Fetch Deposit Info** | Stripe keys loaded | After deposit info loaded | Logs `deposit-get`. |
| **3. Proceed to Card Entry** | Keys **and** deposit info loaded | — | Flow state → ENTERING_CARD. |
| **Proceed to Customer Details** | Booking card = 0 | — | Flow state → COLLECTING_USER. |
| **Reset** | Any time | — | Clears all state & logs. |

### StripePaymentForm Buttons

| Button | Purpose |
|--------|---------|
| **Initialize Stripe Elements** | Loads Stripe.js with Eveve’s key (must run once) |
| **1. Validate Booking** | Calls `/api/restore` to ensure hold still active |
| **2. Process Payment** | `confirmCardPayment` (deposit) **or** `confirmCardSetup` (no-show) |
| **3. Attach Payment Method** | `/int/pm-id` – required for Eveve to know the PM ID |
| **4. Proceed to Customer Details** | Advances to UserDetailsForm |

Green tick ✓ appears beside each button when finished.

---

## 5. What to Expect in LogDisplay

• Each request/response is **captured automatically** via Axios/Stripe interceptors.  
• Click a log row to expand JSON.  
• Use **Copy** to clipboard or **cURL** to grab a ready-to-run command.  
• **Export** downloads full session logs.

Colour code:  
• 🟩 green – success  
• 🟥 red – error  
• 🟦 blue – in-progress/info

---

## 6. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| “Booking validation failed” | Hold expired (3 min) | Click **Reset**, start again. |
| Infinite spinner / disabled buttons | Forgot a prior step | Check step list, complete missing green ✓. |
| Stripe Elements not loading | Public key missing | Ensure **Fetch Stripe Keys** done & click *Initialize*. |
| CORS errors in console | Browser blocking Eveve/Stripe domains | Use dev proxy or disable CORS for localhost. |
| Declined card | Using Stripe test decline card (`4000-0000-0000-0002`) | Use success card `4242-4242-4242-4242`. |

---

## 7. Best Practices

1. **Work quickly after HOLD** – watch the countdown in the header.  
2. Always progress **top-to-bottom**; skipping steps will disable later buttons.  
3. Use the **Reset** button liberally; it clears state & logs without page refresh.  
4. Keep LogDisplay open while testing – all the answers are in the JSON.

---

## 8. Sample End-to-End Session

1. Paste sample Deposit URL → **Start Test**  
2. Button 1 ✓, Button 2 ✓ → **Proceed to Card Entry**  
3. **Initialize Stripe Elements**  
4. **Validate Booking** → ✓  
5. Enter `4242 4242 4242 4242`, any future date, CVC.  
6. **Process Payment** → ✓  
7. **Attach Payment Method** → ✓  
8. **Proceed to Customer Details**  
9. Fill form → **Complete Booking** – App shows 🎉 success banner.  
10. Export logs for auditing.

---

Happy debugging!  
For issues/ideas open an internal ticket or ping the integration team.  
