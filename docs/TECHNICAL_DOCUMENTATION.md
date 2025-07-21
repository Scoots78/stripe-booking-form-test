# Stripe + Eveve Booking – Technical Documentation  
*(File: `TECHNICAL_DOCUMENTATION.md`)*  

---

## Table of Contents  
1. System Architecture Overview  
2. Component Structure & Responsibilities  
3. State Management (`FlowContext`)  
4. API Integration Details (Eveve & Stripe)  
5. Payment Processing Flow  
6. Booking Flow Logic  
7. Error-Handling Strategy  
8. Configuration & Environment Setup  
9. Key Implementation Patterns  
10. Deployment Considerations  
11. Testing Approach  
12. Troubleshooting Guide  
13. Migration / Porting Guide  

---

## 1  System Architecture Overview
```
Browser  ──>  UnifiedBookingForm.jsx   (React + Stripe Elements)
                │
                │ dispatch / consume state
                ▼
             FlowContext (React Context + Reducer)
                │
                ├─ Eveve API module  (axios instance with interceptor logger)
                └─ Stripe API module (wrapper helpers)
```
* **Front-end:** Vite + React, single-page, hosted under `/stripetest/`.
* **Payment Gateway:** Stripe Elements & Payment/Setup Intents.
* **Booking Provider:** Eveve REST endpoints (`/web/hold`, `/web/update`, etc.).
* **Logging:** Central log reducer pipes every request/response into a collapsible JSON viewer.

---

## 2  Component Structure & Responsibilities
| Component | Responsibility |
|-----------|----------------|
| `App.jsx` | Renders `Header`, `UnifiedBookingForm`, `LogDisplay`. |
| `Header.jsx` | Sticky status bar, countdown timer, expiry warning, Reset button. |
| `UnifiedBookingForm.jsx` | Contains the entire booking workflow. Handles customer input, card entry, additional details and **single** “Complete Booking” processing. |
| `LogDisplay.jsx` | Shows chronological API log with JSON viewer & copy/cURL helpers. |
| `JsonViewer.jsx` | Custom collapsible, syntax-highlighted JSON renderer. |
| `FlowContext.jsx` | Global reducer store – holds booking, Stripe keys, payment type, flow state, logs. |
| `api/eveve.js` | Axios wrapper for Eveve (hold, pi-get, deposit-get, pm-id, update). |
| `api/stripe.js` | Helpers to detect intent type & common Stripe logic. |

---

## 3  State Management (FlowContext)

### Store Shape
```ts
interface FlowState {
  flowState:  'IDLE' | 'HOLDING' | 'AWAITING_STRIPE' | 'ENTERING_CARD'
             | 'COLLECTING_USER' | 'COMPLETED' | 'ERROR';
  booking:    { uid, created, est, covers, date, time, card };
  stripe:     { clientSecret, publicKey, amount };
  paymentType:{ code, total };    // from deposit-get
  logs:       LogEntry[];
  error?:     { message };
  customerDetails: { firstName, lastName, email };
}
```

### Key Actions
```
SET_BOOKING          ▸ store hold data
SET_STRIPE_KEYS      ▸ save client secret & pk
SET_PAYMENT_TYPE     ▸ save deposit/no-show info
ADD_LOG / CLEAR_LOGS ▸ push structured log entries
SET_FLOW_STATE       ▸ high-level progress
SET_CUSTOMER_DETAILS ▸ first/last/email for autofill
RESET_STATE          ▸ return to pristine
```

Reducer guarantees immutability and is the single source of truth across components.

---

## 4  API Integration Details

### Eveve Endpoints
| Purpose | Method | URL | Notes |
|---------|--------|-----|-------|
| Create hold | GET | `/web/hold` | Required params: `est,lng,covers,date,time[,area]` |
| Get Stripe keys | GET | `/int/pi-get` | Params: `est,uid,type=0,desc,created` |
| Get deposit info | GET | `/int/deposit-get` | Params: `est,UID,created,lang,type=0` |
| Attach PM | GET | `/int/pm-id` | Params: `est,uid,created,pm,total,totalFloat,type=0` |
| Update booking | GET | `/web/update` | **Only called after successful payment** |
> `restore` was removed – validation no longer required.

### Stripe Touchpoints
1. `loadStripe(publicKey)` – once when entering card.
2. Elements & `CardElement`.
3. Confirm:
   ```js
   // Deposit (charge)
   stripe.confirmCardPayment(clientSecret,{payment_method:{card,billing_details}})
   // No-show protection (setup)
   stripe.confirmCardSetup(clientSecret,{payment_method:{card,billing_details}})
   ```
4. `paymentIntent`/`setupIntent` result parsed → `paymentMethodId` sent to Eveve `pm-id`.

### Logging Interceptor
Axios requester intercepts both request & response:
```js
logApiCall(label, requestMeta, responseData, [errorObj])
```
Stored in context then rendered by `LogDisplay`.

---

## 5  Payment Processing Flow

1. Customer enters card – `cardComplete true`.
2. Press “Complete Booking”.
3. `processPayment()` executes:
   * Detect intent type (`setup_intent` or `payment_intent`).
   * `stripe.confirm…`
   * On **failure**: `return {success:false,error}` (no update call).
4. If success → `updateBooking()` (Eveve `/web/update`) then `attachPaymentMethod()` (`pm-id`).
5. Logs consolidated success.  
*Parallel execution removed* to guarantee no update when declines happen.

---

## 6  Booking Flow Logic
```
IDLE
 └─[HOLD URL submit]──────────► HOLDING
      hold ok
      ▼
COLLECTING_USER
      save basic details
      ▼
ENTERING_CARD (if cardRequired) ──┐
                                  │ cardComplete
                                  ▼
ADDITIONAL_DETAILS ──► Complete Booking press
                                  │
                         ┌────────┴─────────┐
                         ▼                  ▼
               processPayment()     (if cardRequired==false) 
                   success?                    updateBooking()
                     │ yes                             │
                     ▼                                ▼
             attachPaymentMethod()              done
                     ▼
               COMPLETED
```
If payment fails → state `ERROR`, logs the error, remains un-updated.

---

## 7  Error-Handling Strategy
* Global error object in `FlowContext`.
* `Header` shows red banner if `flowState===ERROR`.
* Each async step wrapped in `try/catch` with:
  ```js
  logError('Step description', error);
  setError({message:'User-friendly text'});
  setCurrentStep('error');
  ```
* Payment declines bubble to UI via `cardError`.

---

## 8  Configuration & Environment Setup
| File | Setting |
|------|---------|
| `.env` | `VITE_STRIPE_PUBLISHABLE_KEY` (for local only if desired) |
| `vite.config.js` | `base:'/stripetest/'`, dev port 3000 |
| `index.html` | root script `/src/main.jsx`, no favicon to avoid 404 |

### Install / Run
```bash
npm install
npm run dev      # localhost:3000
npm run build    # outputs dist/stripetest/*
```

---

## 9  Key Implementation Patterns
1. **Progressive Disclosure:** Single form reveals sections upon completion flags.
2. **Context as Finite-State Machine:** `flowState` enumerates macro states.
3. **Axios Interceptor Logging:** Centralised request/response capture.
4. **Sequential Critical Path:** Payment → Update → Attach to guarantee integrity.
5. **Collapsible JSON Viewer:** In-app inspection without external tools.

---

## 10  Deployment Considerations
* Host static files under `/stripetest/` or modify `base` accordingly.
* HTTPS mandatory for Stripe Elements.
* Configure CORS on Eveve endpoints if hosting on different domain.
* Increase server timeout (>10 s) for long Eveve calls.

---

## 11  Testing Approach
### Manual
1. Use provided sample URLs (hold).
2. Test cards  
   * Success: `4242 4242 4242 4242`  
   * Decline: `4000 0000 0000 0002`
3. Observe logs & final states.

### Automated (suggested)
* Component tests with React Testing Library mocking FlowContext.
* Integration tests using MSW (mock Eveve & Stripe).

---

## 12  Troubleshooting Guide
| Symptom | Checklist |
|---------|-----------|
| Card form not loading | Check Stripe publicKey, ensure HTTPS, console errors. |
| Assets 404 in prod | Verify `base` path matches deployment dir. |
| Booking stuck on HOLDING | Eveve `/web/hold` failed → inspect network log. |
| Payment succeeds but booking not updated | Ensure `pm-id` returns `ok:true`; verify attach step. |
| Timer expired errors | Timer reached 0 – reset flow, re-hold. |

---

## 13  Migration / Porting Guide
1. **Copy Core Modules**  
   * `FlowContext.jsx`, `api/eveve.js`, `api/stripe.js`, `JsonViewer.jsx`.
2. **Wrap New UI**  
   Replace `UnifiedBookingForm.jsx` UI but reuse internal helpers.
3. **Adjust ENV**  
   * Set `base` path in build tool.  
   * Update Eveve base URLs if different region.
4. **Stripe Keys Logic**  
   Reuse `pi-get` flow; only public key + client secret needed.
5. **Routing**  
   If app isn’t SPA: mount component into target page.
6. **CSS / Tailwind**  
   Copy `form-input`, `form-button` utility classes or map to design system.
7. **Verify Payment Sequence**  
   Ensure sequential payment → update → attach order preserved.
8. **Run Integration Tests** with sample URLs and Stripe test cards.

---

### End of Document
