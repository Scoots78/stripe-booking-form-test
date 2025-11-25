# Fix Spec: Eveve pm-id Endpoint - Extract Intent ID Instead of Payment Method ID

## Problem Summary

The application is sending the wrong identifier to the Eveve `/int/pm-id` endpoint. It's sending a Stripe **payment method ID** (prefix `pm_`) when it should be sending the **SetupIntent ID** (prefix `seti_`) or **PaymentIntent ID** (prefix `pi_`).

## Background

When integrating Stripe with Eveve's booking API, the flow works as follows:

1. **Eveve `/int/pi-get`** returns a `clientSecret` from Stripe:
   - Format: `seti_XXXXX_secret_...` (for SetupIntent - example only)
   - Format: `pi_XXXXX_secret_...` (for PaymentIntent - example only)

2. **Stripe confirmation** (via `stripe.confirmCardSetup()` or `stripe.confirmCardPayment()`) returns an object containing:
   - `setupIntent.id` - The SetupIntent ID (e.g., `seti_XXXXX`)
   - `setupIntent.payment_method` - The payment method ID (e.g., `pm_XXXXX`)
   - OR
   - `paymentIntent.id` - The PaymentIntent ID (e.g., `pi_XXXXX`)
   - `paymentIntent.payment_method` - The payment method ID (e.g., `pm_XXXXX`)

3. **Eveve `/int/pm-id`** expects the **intent ID** (not the payment method ID):
   - Correct: `pm=seti_XXXXX` (SetupIntent ID)
   - Incorrect: `pm=pm_XXXXX` (Payment Method ID)

## Symptoms

- The `/int/pm-id` endpoint call fails or returns an error
- Payment succeeds in Stripe but booking is not finalized in Eveve
- Console logs show `pm=pm_xxxxx` instead of `pm=seti_xxxxx` or `pm=pi_xxxxx`
- Comparing with Eveve's own forms shows they use `seti_` or `pi_` prefixes

## How to Identify the Issue

### Step 1: Search for pm-id API Calls

Search your codebase for calls to the Eveve `/int/pm-id` endpoint:

```bash
# Search for pm-id endpoint references
grep -r "pm-id" .
# OR
rg "pm-id"
```

### Step 2: Find Where the PM Parameter is Set

Look for code that constructs the pm-id request. It might look like:

```javascript
// Example patterns to search for
await api.get('/int/pm-id', {
  params: {
    pm: someVariable
  }
});

// OR
`/int/pm-id?pm=${someVariable}&...`
```

### Step 3: Trace Back to the Source Variable

Find where the `pm` parameter value comes from. Look for code like:

```javascript
// INCORRECT - This extracts payment_method
const paymentMethodId = result.setupIntent.payment_method;  // ❌ Returns pm_xxxxx
const paymentMethodId = result.paymentIntent.payment_method; // ❌ Returns pm_xxxxx

// CORRECT - This extracts the intent ID
const paymentMethodId = result.setupIntent.id;  // ✅ Returns seti_xxxxx
const paymentMethodId = result.paymentIntent.id; // ✅ Returns pi_xxxxx
```

### Step 4: Check Stripe Confirmation Code

Look for Stripe confirmation calls:

```javascript
// SetupIntent confirmation
const result = await stripe.confirmCardSetup(clientSecret, {...});
// or
const result = await stripe.confirmSetupIntent(clientSecret, {...});

// PaymentIntent confirmation
const result = await stripe.confirmCardPayment(clientSecret, {...});
// or
const result = await stripe.confirmPaymentIntent(clientSecret, {...});
```

After these calls, check what property is being extracted from the `result` object.

## The Fix

### Locate the Extraction Code

Find code that looks like this:

```javascript
// WRONG - Extracting payment_method property
const paymentMethodId = intentType === 'setup_intent' 
  ? result.setupIntent.payment_method
  : result.paymentIntent.payment_method;
```

### Replace With Correct Code

Change it to extract the `id` property instead:

```javascript
// CORRECT - Extracting id property
const paymentMethodId = intentType === 'setup_intent' 
  ? result.setupIntent.id
  : result.paymentIntent.id;
```

### Alternative Patterns

If your code doesn't use a ternary, you might see:

```javascript
// WRONG
if (intentType === 'setup_intent') {
  paymentMethodId = result.setupIntent.payment_method; // ❌
} else {
  paymentMethodId = result.paymentIntent.payment_method; // ❌
}

// CORRECT
if (intentType === 'setup_intent') {
  paymentMethodId = result.setupIntent.id; // ✅
} else {
  paymentMethodId = result.paymentIntent.id; // ✅
}
```

Or if you only handle SetupIntents:

```javascript
// WRONG
const paymentMethodId = result.setupIntent.payment_method; // ❌

// CORRECT
const paymentMethodId = result.setupIntent.id; // ✅
```

Or if you only handle PaymentIntents:

```javascript
// WRONG
const paymentMethodId = result.paymentIntent.payment_method; // ❌

// CORRECT
const paymentMethodId = result.paymentIntent.id; // ✅
```

## Verification Steps

### 1. Check the Logs

After the fix, verify that the pm-id call uses the correct format:

```javascript
// Add logging before the pm-id call
console.log('Calling pm-id with:', {
  pm: paymentMethodId,
  prefix: paymentMethodId.substring(0, 5) // Should show "seti_" or "pi_"
});
```

### 2. Test the Flow

1. Create a test booking
2. Complete the payment form
3. Check browser console/network tab
4. Verify the `/int/pm-id` request shows:
   - `pm=seti_xxxxx` for no-show/setup intents
   - `pm=pi_xxxxx` for deposit/payment intents
   - NOT `pm=pm_xxxxx`

### 3. Verify Eveve Response

The Eveve `/int/pm-id` endpoint should return:

```json
{
  "ok": true,
  "success": "...",
  // ... other fields
}
```

If it returns an error or `ok: false`, the wrong ID might still be sent.

### 4. Run Tests

```bash
# Lint the code
npm run lint

# Build to check for syntax errors
npm run build

# Run tests if available
npm test
```

## Common Variations

### Using Async/Await with Direct Properties

```javascript
// WRONG
const { payment_method } = await stripe.confirmCardSetup(clientSecret, {...});
await eveveApi.pmId({ pm: payment_method }); // ❌

// CORRECT
const { setupIntent } = await stripe.confirmCardSetup(clientSecret, {...});
await eveveApi.pmId({ pm: setupIntent.id }); // ✅
```

### Using Promises with .then()

```javascript
// WRONG
stripe.confirmCardSetup(clientSecret, {...})
  .then(result => {
    return eveveApi.pmId({ pm: result.setupIntent.payment_method }); // ❌
  });

// CORRECT
stripe.confirmCardSetup(clientSecret, {...})
  .then(result => {
    return eveveApi.pmId({ pm: result.setupIntent.id }); // ✅
  });
```

### When Variable Names are Misleading

Sometimes the variable is named `paymentMethodId` but it should actually contain the intent ID:

```javascript
// The variable name is misleading but keep it for minimal changes
const paymentMethodId = result.setupIntent.id; // This is actually an intent ID
await eveveApi.pmId({ pm: paymentMethodId }); // Still correct!
```

Don't worry about the variable name - Eveve's API parameter is called `pm` but expects the intent ID.

## Reference: Stripe Object Structures

### SetupIntent Object (Example)
```javascript
{
  id: "seti_XXXXX",          // ✅ Use this (intent ID)
  object: "setup_intent",
  payment_method: "pm_XXXXX", // ❌ Don't use this (payment method ID)
  status: "succeeded",
  client_secret: "seti_XXXXX_secret_XXXXX",
  // ... other properties
}
```

### PaymentIntent Object (Example)
```javascript
{
  id: "pi_XXXXX",            // ✅ Use this (intent ID)
  object: "payment_intent",
  payment_method: "pm_XXXXX", // ❌ Don't use this (payment method ID)
  status: "succeeded",
  client_secret: "pi_XXXXX_secret_XXXXX",
  // ... other properties
}
```

## Implementation Checklist

- [ ] Search codebase for `/int/pm-id` or `pm-id` references
- [ ] Locate where the `pm` parameter is set
- [ ] Trace back to Stripe confirmation result
- [ ] Verify current code extracts `.payment_method` (incorrect)
- [ ] Change to extract `.id` property instead
- [ ] Add logging to verify correct prefix (`seti_` or `pi_`)
- [ ] Test with a real booking flow
- [ ] Verify `/int/pm-id` returns `ok: true`
- [ ] Run lint and build commands
- [ ] Commit changes with descriptive message

## Example Commit Message

```
Fix: Extract intent ID instead of payment method ID for pm-id endpoint

Changed to extract setupIntent.id (seti_xxx) or paymentIntent.id (pi_xxx) 
instead of payment_method (pm_xxx) to match Eveve API expectations.

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
```

## Related Documentation

- Eveve API expects intent IDs in the `pm` parameter of `/int/pm-id`
- Stripe returns both `id` (intent ID) and `payment_method` (payment method ID)
- The intent ID is what should be sent to Eveve, not the payment method ID
