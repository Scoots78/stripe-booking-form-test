
# 🧪 Stripe + Eveve Test App

## 🚀 Proposed Tech Stack (Flexable to needs)

- **React** – Component-based UI rendering
- **Tailwind CSS** – Utility-first styling
- **Vite** – Fast development server and build tool

A **temporary developer tool** to explore and debug the Stripe deposit/payment integration with the Eveve restaurant booking API.

This app is designed to:
- Simulate and observe the full Stripe payment or card registration flow.
- Show all API calls and responses in real-time on the frontend.
- Allow developers to test with any Eveve `HOLD` URL input.
- Help identify logic flaws, missing keys, or errors in the Stripe-Eveve exchange.

---

## 🎯 Purpose

The primary objective of this app is to visualise and test the flow between Eveve’s booking system and Stripe’s payment infrastructure. It enables the developer to:

- **Trigger and inspect API calls** to Eveve and Stripe.
- **Visualise the flow** from booking hold to card confirmation.
- **Reorder the Stripe logic** so that the system retrieves the required Stripe keys *before* collecting user details (unlike the current Eveve logic).
- **Identify error cases** and API misalignment.

---

## ⚙️ How It Works

1. **Enter a `HOLD` booking URL** (e.g. from Eveve’s test system).
2. The app makes the `HOLD` call and inspects the response.
3. If Stripe is required (`card > 0`), the app will:
   - Call `pi-get` to get the `client_secret` and `public_key`.
   - Call `deposit-get` to determine the payment type (deposit or no-show).
4. Optionally, submit a test payment method and confirm via Stripe.
5. All steps are **logged visibly on the frontend** for debugging.

---

## 🔁 Booking + Payment Flow Overview

### 1. 🔒 HOLD Booking

Example URL:
```
https://nz.eveve.com/web/hold?est=TestNZA&lng=en&covers=10&date=2025-07-25&time=16&area=1000
```

Sample response:
```json
{
  "ok": true,
  "uid": 42015,
  "created": 1752780515,
  "card": 2,
  "perHead": 3000
}
```

If `card` is `1` or `2`, the Stripe process is initiated.

---

### 2. 🔑 pi-get (Stripe Key Exchange)

Retrieves Stripe `client_secret`, `public_key`, and customer ID.

```
https://uk6.eveve.com/int/pi-get?est=TestNZA&uid=42015&type=0&desc=0&created=1752780515
```

Sample response:
```json
{
  "client_secret": "...",
  "public_key": "...",
  "cust": "cus_..."
}
```

---

### 3. 💵 deposit-get (Determine Charge Type)

Checks if a deposit is being charged or only held as a no-show fallback.

```
https://uk6.eveve.com/int/deposit-get?est=TestNZA&UID=42015&created=1752780515&lang=english&type=0
```

Response with `code`:
- `1`: No-show protection (card stored but not charged).
- `2`: Deposit (card charged immediately).

Example:
```json
{
  "ok": true,
  "code": 2,
  "totalFloat": 300.00,
  "message": "We require a c/c deposit to complete your reservation<br/>"
}
```

---

### 4. 🛠️ restore (Booking Check)

Verifies booking UID is valid.

```
https://uk6.eveve.com/api/restore?est=TestNZA&uid=42015&type=0
```

---

### 5. 🧾 pm-id (Attach Payment Method to Intent)

Used if submitting a payment method manually.

```
https://uk6.eveve.com/int/pm-id?est=TestNZA&uid=42015&created=1752780515&pm=<stripe_pm_id>&total=30000&type=0
```

---

### 6. ✅ Stripe Confirm

Final confirmation call to Stripe if setup_intent or payment_intent is used:

```
https://api.stripe.com/v1/setup_intents/<id>/confirm
```

---

## 🖥️ Front-End Interface

The UI allows:
- Input of a full Eveve `HOLD` URL.
- On-screen JSON output of each step.
- Triggering of individual API steps manually (for testing).
- Future: Stripe Elements form to test real token submission.

---

## 📦 Tech Stack

- React + Vite
- Tailwind CSS
- Fetch / Axios for API
- Future: Stripe Elements (optional)

---

## 🧪 Development Goals

| Feature                              | Status    |
|--------------------------------------|-----------|
| Input HOLD URL                       | 🔲 Pending|
| Trigger `pi-get` + `deposit-get`     | 🔲 Pending|
| Display all JSON responses           | 🔲 Pending|
| Manual test of `pm-id`               | 🔲 Pending|
| Display Stripe Elements (test card)  | 🔲 Pending|
| Manual confirm of `setup_intent`     | 🔲 Pending|

---

## 📡 Socket Connection (Unused but Noted)

The Eveve platform uses this endpoint—usage unknown:

```
wss://us12.eveve.com/api/notifications/?EIO=4&transport=websocket
```

---

## 📝 Notes

- Booking `card` values:
  - `0` = no card required
  - `1` = no-show
  - `2` = deposit
- Stripe flow is triggered only if `card > 0`
- `perHead` and `total` are in **cents**, so divide by 100 for dollars
- Use test values only (`TestNZA`) unless coordinated with live data

---

## 🚧 Disclaimer

This is a **development-only tool**. It is not intended for production or customer use. Use Stripe's test environment and test cards only. Do not submit real customer data.

---

## 📬 Support

For any questions, contact the integration developer or internal technical lead.

---
