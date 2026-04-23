# SimpleFIN Protocol

**Version:** 2.0.0-draft

---

## Introduction

The SimpleFIN protocol allows users to share read-only financial data with third parties. It's similar to RSS, but for financial data.

Though intended mostly for banks, it can also be used for reward points or gift certificate balances (e.g. Frequent Flyer Miles, Amazon gift card balance, etc.)

Three parties are involved in SimpleFIN:

| Party | Description |
|-------|-------------|
| User | A person using a web browser. They have an account at a bank or other institution. |
| Application | Third party software that wants read-only access to a User's financial data. |
| Server | A SimpleFIN Server operated by a bank or other financial institution. |

- Application developers should start with the [App Quickstart](#app-quickstart).
- Banks or financial institutions wanting to host their own SimpleFIN Server should start at the Server Implementation Guide.
- Users should visit the [SimpleFIN Bridge](https://bridge.simplefin.org).

---

## Flow

This diagram shows how a User gives read-only bank account access to an App, and how a User can revoke an App's access.

---

## SimpleFIN Bridge

For optimal privacy, banks ought to implement SimpleFIN Servers. In some cases, where banks haven't yet implemented SimpleFIN, the SimpleFIN Bridge can be used.

---

## App Quickstart

This section is for application developers that want to integrate financial data (bank account balances/transactions) into their application.

### 1. Start a connection

Direct your user to create a SimpleFIN Token by sending them to their institution's SimpleFIN Server `/create` URL. If their institution doesn't have a SimpleFIN Server, you can use the SimpleFIN Bridge.

```html
Connect your bank account to this app, by
<a href="https://bridge.simplefin.org/simplefin/create">clicking here.</a>
```

### 2. Receive a SimpleFIN Token

The user will return to your app with a SimpleFIN Token in their clipboard. Provide a location for them to paste the token into your app.

```html
<form method="post">
    SimpleFIN Token: <textarea name="token"></textarea>
    <button type="submit">Connect Bank</button>
</form>
```

### 3. Claim the Access URL

The SimpleFIN Token you receive from users is a Base64-encoded URL. Make an HTTP POST to that URL to claim an Access URL. Securely store the Access URL for later use.

```bash
SIMPLEFIN_TOKEN="aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0vZGVtbw=="

# Base64 decode the SimpleFIN Token to get a URL
CLAIM_URL=$(echo "${SIMPLEFIN_TOKEN}" | base64 --decode)
# https://bridge.simplefin.org/simplefin/claim/demo

# Make a POST request to the decoded URL to get an Access URL
ACCESS_URL=$(curl -X POST "${CLAIM_URL}")
# https://user123:pass456@bridge.simplefin.org/simplefin
```

### 4. Get Data

Issue GET requests to the Access URL's `/accounts` resource to get account and transaction information. Successful responses will be a JSON [Account Set](#account-set).

```bash
curl "${ACCESS_URL}/accounts"
```

**Sample response:**

```json
{
  "errlist": [
    {
      "code": "con.auth",
      "message": "Authentication required",
      "conn_id": "CON-10829309823094234"
    }
  ],
  "connections": [
    {
      "conn_id": "CON-10829309823094234",
      "name": "My Bank - James",
        "org_id": "INST-129839182938123123",
      "org_url": "https://mybank.com",
      "sfin_url": "https://mybank.com"
    }
  ],
  "accounts": [
    {
      "id": "2930002",
      "name": "Savings",
      "conn_id": "CON-10829309823094234",
      "conn_name": "My Bank - Jeff",
      "currency": "USD",
      "balance": "100.23",
      "available-balance": "75.23",
      "balance-date": 978366153,
      "transactions": []
    }
  ]
}
```

---

## Checklist

### Required

The application:

- Handles a `403` response when claiming an Access URL.
- When claiming an Access URL fails, notifies the customer that the token may be compromised so they can disable the token.
- Only makes requests to SSL/TLS URLs (i.e. HTTPS and never HTTP).
- Stores Access URLs at least as securely as the user's financial data.
- Handles a `403` response from `/accounts`.
- Displays error messages from `/accounts` to the user.
- Sanitizes all error messages from `/accounts` that are displayed to the user.
- Verifies all SSL/TLS certificates when making HTTPS requests.

### Recommended

The application:

- Handles custom currencies.

---

## Data Types

### Error

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | yes | One of the codes listed below |
| `msg` | string | yes | String error suitable for displaying to users |
| `conn_id` | string | no | Connection id. Only given if the error is specific to a particular connection. |
| `account_id` | string | no | Account id. Only given if the error is specific to a particular account. |

#### Error Codes

Error codes are in the format `prefix.[subcode]`. Valid prefixes are `gen`, `con`, or `act` — indicating General, Connection, or Account errors respectively.

Consumers of the protocol should handle unknown subcodes by falling back to treating the error like a naked `prefix.`.

| Code | Extra Attributes | Description |
|------|-----------------|-------------|
| `gen.` | | General error |
| `gen.api` | | Error in how the API is being used. Meant for the developer, not the user. |
| `gen.auth` | | General authentication error (to the SimpleFIN Server) |
| `con.` | `conn_id` | General connection-level error |
| `con.auth` | `conn_id` | Authentication issue for a connection |
| `act.` | `account_id` | General account-level error |
| `act.failed` | `account_id` | Failed to get account information. Try again later. |
| `act.missingdata` | `account_id` | Incomplete transaction listing. Try again later. |

**Examples:**

```json
{
  "code": "gen.auth",
  "msg": "No credentials provided"
}
```

```json
{
  "code": "con.auth",
  "msg": "Authentication failed for My Bank - Jim",
  "conn_id": "CON-21983498-29349823984293842"
}
```

```json
{
  "code": "act.failed",
  "msg": "Failed to get all transactions. Try again later.",
  "account_id": "ACT-1982398-12398192839182398123"
}
```

---

### Connection

Represents a single connection to an institution. Users with 2 sets of login credentials for a particular bank will have 2 different Connections, each with the same `org_*` fields.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `conn_id` | string | yes | ID of a particular connection for a financial institution. |
| `name` | string | yes | Human-friendly name for this connection. Should include the financial institution name. |
| `org_id` | string | yes | ID of the financial institution. Unique per SimpleFIN server, not guaranteed globally unique. |
| `org_url` | string | no | Domain name of the financial institution. |
| `sfin_url` | string | yes | Root URL of organization's SimpleFIN Server. |

```json
{
  "conn_id": "CON-923049234-203940293409234",
  "name": "My Bank - Jill",
  "org_id": "ORG-8293948-230482398492834",
  "org_url": "https://mybank.com",
  "sfin_url": "https://sfin.mybank.com"
}
```

---

### Account Set

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `errlist` | array of Errors | yes | List of errors |
| `errors` | array | no | **(DEPRECATED)** Array of strings suitable for displaying to a user. |
| `connections` | array of Connections | yes | List of Connections. |
| `accounts` | array of Accounts | yes | List of Accounts. |

```json
{
  "errlist": [],
  "connections": [
    {
      "conn_id": "CON-1122121298398234234",
      "name": "My Bank - Jill",
      "org_id": "INST-1298391823-129381928391823",
      "org_url": "https://mybank.com",
      "sfin_url": "https://sfin.mybank.com"
    }
  ],
  "accounts": [
    {
      "id": "2930002",
      "name": "Savings",
      "conn_id": "CON-1122121298398234234",
      "currency": "USD",
      "balance": "100.23",
      "available-balance": "75.23",
      "balance-date": 978366153,
      "transactions": [
        {
          "id": "12394832938403",
          "posted": 793090572,
          "amount": "-33293.43",
          "description": "Uncle Frank's Bait Shop"
        }
      ],
      "extra": {
        "account-open-date": 978360153
      }
    }
  ]
}
```

---

### Account

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | String that uniquely identifies the account within the Connection. Should not reveal sensitive data. |
| `name` | string | yes | A name that uniquely describes an account among all the user's accounts. |
| `conn_id` | string | yes | ID of the account's Connection. |
| `currency` | string | yes | ISO 4217 currency code (e.g. `"USD"`) or a custom currency URL. |
| `balance` | numeric string | yes | The balance of the account as of `balance-date`. |
| `available-balance` | numeric string | optional | The available balance as of `balance-date`. Omitted if same as `balance`. |
| `balance-date` | UNIX epoch timestamp | yes | Timestamp when the balance and available-balance became what they are. |
| `transactions` | array of Transactions | optional | Subset of Transactions for this account, ordered by `posted`. |
| `extra` | object | optional | Extra account-specific data not defined in this standard. |

```json
{
  "id": "2930002",
  "name": "Savings",
  "conn_id": "1238239482348382932",
  "currency": "USD",
  "balance": "100.23",
  "available-balance": "75.23",
  "balance-date": 978366153,
  "transactions": [
    {
      "id": "12394832938403",
      "posted": 793090572,
      "amount": "-33293.43",
      "description": "Uncle Frank's Bait Shop"
    }
  ],
  "extra": {
    "account-open-date": 978360153
  }
}
```

#### Custom Currencies

SimpleFIN supports custom currencies such as Frequent Flyer Miles, Rewards Points, brownie points, etc.

Custom currencies are identified by a unique URL. When an HTTP GET request is made to the URL, it should return a JSON object with:

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Human-readable name of the currency. |
| `abbr` | string | yes | Human-readable short name of the currency. |

All strings obtained from these requests must be sanitized when displaying them to users.

```json
{
  "id": "2930002",
  "name": "Savings",
  "currency": "https://www.example.com/flight-miles",
  "balance": "100.23",
  "available-balance": "75.23",
  "balance-date": 978366153,
  "transactions": []
}
```

```bash
curl https://www.example.com/flight-miles
```

```json
{
  "name": "Example Airline Miles",
  "abbr": "miles"
}
```

---

### Transaction

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Uniquely describes a transaction within an Account. IDs may be reused across accounts but never within one. |
| `posted` | UNIX epoch timestamp | yes | When the transaction posted to the account. May be `0` if pending. |
| `amount` | numeric string | yes | Amount of transaction. Positive = deposit into account. |
| `description` | string | yes | Human-readable description of what the transaction was for. |
| `transacted_at` | UNIX epoch timestamp | optional | When the transaction happened. |
| `pending` | boolean | optional | `true` indicates transaction has not yet posted. Default is `false`. |
| `extra` | object | optional | Extra transaction-specific data not defined in this standard. |

```json
{
  "id": "12394832938403",
  "posted": 793090572,
  "amount": "-33293.43",
  "description": "Uncle Frank's Bait Shop",
  "pending": true,
  "extra": {
    "category": "food"
  }
}
```

---

## HTTP Endpoints

A SimpleFIN Server has a root URL. All resources below are relative to this root URL.

```bash
ROOT="https://bridge.simplefin.org/simplefin"
```

| Endpoint | Description |
|----------|-------------|
| `GET /info` | Get supported protocol versions |
| `GET /create` | Initiate a bank-app connection |
| `POST /claim/:token` | Claim an Access URL from a SimpleFIN Token |
| `GET /accounts` | Retrieve account and transaction data |

---

### GET /info

Used by Applications to find out what versions of the SimpleFIN Protocol the server supports. Version strings are in `MAJOR.MINOR.FIX` or `MAJOR.MINOR` format.

**Response JSON:**

| Attribute | Description |
|-----------|-------------|
| `versions` | An array of version string prefixes that this server supports. |

```bash
curl https://bridge.simplefin.org/simplefin/info
```

```json
{
  "versions": ["1", "2"]
}
```

---

### GET /create

An application directs a user to this URL to initiate a bank-app connection. When a user visits this URL the server:

1. Authenticates the user
2. Guides the user to create a SimpleFIN Token
3. Tells the user to give the SimpleFIN Token to the application requesting it

```html
To connect your bank to this application,
<a href="https://bridge.simplefin.org/simplefin/create">click here</a>
```

An example SimpleFIN Token:

```
aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0vZGVtbw==
```

---

### POST /claim/:token

An application receives a SimpleFIN Token from a user. SimpleFIN Tokens are Base64-encoded URLs. A decoded SimpleFIN Token will point to this resource.

| Parameter | Description |
|-----------|-------------|
| `:token` | A one-time use code embedded within the SimpleFIN Token. |

**Responses:**

| Code | Description |
|------|-------------|
| `200` | Successful response. Body is an Access URL (a URL with included Basic Auth credentials). |
| `403` | The claim token does not exist or has already been claimed. The user's transaction information may be compromised. |

```bash
TOKEN="aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0vZGVtbw=="

# Decode the token
DECODED_TOKEN=$(echo "${TOKEN}" | base64 -D)

# Claim the Access URL
ACCESS_URL=$(curl -X POST "${DECODED_TOKEN}")
# https://demo:demo@bridge.simplefin.org/simplefin
```

---

### GET /accounts

Retrieve account and transaction data.

**Authentication:** HTTP Basic Authentication using credentials obtained from `POST /claim/:token`.

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `start-date` | optional | Restrict transactions to those on or after this Unix epoch timestamp. |
| `end-date` | optional | Restrict transactions to those before (but not on) this Unix epoch timestamp. |
| `pending` | optional | If `pending=1`, pending transactions are included (if supported). Default: excluded. |
| `account` | optional | Only return information for the given account id. May be specified multiple times. |
| `balances-only` | optional | If `balances-only=1`, no transaction data is returned. |
| `version` | optional | Must be `2` for this version of the protocol. Can be `1` for earlier versions. |

**Responses:**

| Code | Description |
|------|-------------|
| `200` | Successful response — a JSON [Account Set](#account-set). |
| `402` | Payment required. |
| `403` | Authentication failed. Access may be revoked or credentials are incorrect. |

```bash
curl "https://demo:demo@bridge.simplefin.org/simplefin/accounts?start-date=978360153"
```

```json
{
  "errlist": [],
  "connections": [
    {
      "conn_id": "10829309823094234",
      "name": "My Bank - Jeff",
      "org_id": "INST-982394823948230-2340923094",
      "org_name": "My Bank",
      "org_url": "https://mybank.com",
      "sfin_url": "https://sfin.mybank.com"
    }
  ],
  "accounts": [
    {
      "id": "2930002",
      "name": "Savings",
      "conn_id": "10829309823094234",
      "currency": "USD",
      "balance": "100.23",
      "available-balance": "75.23",
      "balance-date": 978366153,
      "transactions": []
    }
  ]
}
```

---

## Changelog

### v2.0.0 — 2026-03-19

- **BREAKING:** Deprecated `errors` list on `AccountSet` in favor of new `errlist` list for structured errors.
- **BREAKING:** Deprecated `Organization` object in favor of new, flatter `Connection` object.
- **NEW:** Added `GET /accounts?balances-only=1` parameter to skip fetching account transaction data.
- **NEW:** Added `connections` list to `AccountSet`.
- **NEW:** Added `GET /accounts?account=` parameter for filtering which accounts are returned.
- **NEW:** Added `conn_id` to `Account` object to disambiguate between two different logins to the same bank.

### v1.0.7

Started this changelog.
