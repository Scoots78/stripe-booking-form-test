# Eveve API Field Name Change - pi-get Endpoint

## Problem
The `/int/pi-get` endpoint response field names were changed by the API developer, causing "Missing Stripe keys" errors.

## API Response Changes

### Old Format (snake_case)
```json
{
  "client_secret": "seti_...",
  "public_key": "pk_test_...",
  "cust": "cus_..."
}
```

### New Format (camelCase)
```json
{
  "clientSecret": "seti_...",
  "publishableKey": "pk_test_...",
  "stripePK": "pk_test_...",
  "cust": "cus_..."
}
```

**Changes:**
- `client_secret` → `clientSecret`
- `public_key` → `publishableKey` (also available as `stripePK`)

## Solution

### Find Code That Reads pi-get Response

Search for:
```javascript
response.data.client_secret
response.data.public_key
```

### Replace With Backward-Compatible Code

**Before:**
```javascript
const response = await eveveApi.piGet(piGetParams);

if (!response.data.client_secret || !response.data.public_key) {
  throw new Error('Missing Stripe keys in pi-get response');
}

setStripeKeys({
  clientSecret: response.data.client_secret,
  publicKey: response.data.public_key,
  cust: response.data.cust
});
```

**After:**
```javascript
const response = await eveveApi.piGet(piGetParams);

// Handle both old and new API field names for backward compatibility
const clientSecret = response.data.clientSecret || response.data.client_secret;
const publicKey = response.data.publishableKey || response.data.public_key || response.data.stripePK;

if (!clientSecret || !publicKey) {
  throw new Error('Missing Stripe keys in pi-get response');
}

setStripeKeys({
  clientSecret,
  publicKey,
  cust: response.data.cust
});
```

## Files to Check

Search your codebase for any references to:
- `client_secret`
- `public_key`
- `pi-get`
- `piGet`

Update all locations that parse the pi-get API response.

## Testing

After fixing, test with a real booking:
1. Create booking via `/web/hold`
2. Call `/int/pi-get` with booking UID
3. Verify Stripe keys are extracted correctly
4. Confirm Stripe Elements load properly

## Example API Response (Current)
```json
{
  "ok": true,
  "noshow": true,
  "code": 1,
  "total": 20000,
  "perHead": 5000,
  "totalFloat": 200,
  "amount": "$200.00",
  "currency": "nzd",
  "error": "",
  "message": "A charge of 50.00 per person will be applied...",
  "stripePK": "pk_test_QZqsbhatlQf5Jv0jYkGGjk3Y001i4qFtLZ",
  "est": "TestNZB",
  "uid": "189864",
  "clientSecret": "seti_1SUxiYDXdlJD3I0qB4YCsd2c_secret_...",
  "publishableKey": "pk_test_QZqsbhatlQf5Jv0jYkGGjk3Y001i4qFtLZ",
  "account": "",
  "cust": "cus_TRrRWCAmxf0rgY",
  "provider": "Stripe"
}
```
