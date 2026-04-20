# Using the API

> **Warning:** Many people mistake the term "API" for an HTTP and/or RESTful API. Actual does not expose HTTP endpoints that can be called. We do, however, offer an NPM package — API — that allows interacting with the product programmatically.

The API gives you full programmatic access to your data. It allows you to run the UI in headless mode, interacting with it as if it were a user clicking around. If you are a developer, you can use this to import transactions from a custom source, export data to another app like Excel, or write anything you want on top of Actual.

One thing to keep in mind: Actual is not like most other apps. While your data is stored on a server, the server does not have the functionality for analyzing details of or modifying your budget. As a result, the API client contains all the code necessary to query your data and will work on a local copy. Right now, the primary use case is custom importers and exporters.

## Getting Started

We provide an official Node.js client in the `@actual-app/api` package. Other languages are not supported at this point.

The client is open-source on GitHub along with the rest of Actual if you want to see the code.

Install it with either npm or yarn:

```bash
npm install --save @actual-app/api
```

```bash
yarn add @actual-app/api
```

## TypeScript

`@actual-app/api` ships TypeScript declarations. To consume them, your `tsconfig.json` must use a modern `moduleResolution`:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler" // or "nodenext" / "node16"
  }
}
```

Legacy `"node"` / `"node10"` / `"classic"` resolution is not supported in strict TypeScript mode. The published declarations rely on `package.json` exports conditions, which older resolvers don't honor.

## Connecting to a Remote Server

Next, you'll need to connect to your running server version of Actual to access your budget files.

```js
let api = require('@actual-app/api');

(async () => {
  await api.init({
    // Budget data will be cached locally here, in subdirectories for each file.
    dataDir: '/some/path',
    // This is the URL of your running server
    serverURL: 'http://localhost:5006',
    // This is the password you use to log into the server
    password: 'hunter2',
  });

  // This is the ID from Settings → Show advanced settings → Sync ID
  await api.downloadBudget('1cfdbb80-6274-49bf-b0c2-737235a4c81f');
  // or, if you have end-to-end encryption enabled:
  await api.downloadBudget('1cfdbb80-6274-49bf-b0c2-737235a4c81f', {
    password: 'password1',
  });

  let budget = await api.getBudgetMonth('2019-10');
  console.log(budget);
  await api.shutdown();
})();
```

> **Heads up!** You probably don't want to hard-code the passwords like that, especially if you'll be using Git to track your code. You can use environment variables to store the passwords instead, read them in from a file, or request them interactively when running the script.

### Self-Signed HTTPS Certificates

If the `serverURL` is using self-signed or custom CA certificates, additional Node.js configuration will be needed for the connections to succeed.

The API communicates with the server using Node's built-in `fetch`. There are a few ways to get Node.js to trust the self-signed certificate:

- **Option 1:** Point environment variable `NODE_EXTRA_CA_CERTS` to the path of a file containing the public certificate.
- **Option 2:** Set environment variable `NODE_TLS_REJECT_UNAUTHORIZED` to `0`. Not recommended if your program reaches out to any other endpoints other than the Actual server.
- **Option 3:** Use OpenSSL CA certificates configuration for Node and add your certificate to the OpenSSL `SSL_CERT_DIR`. What this requires depends on your build of Node.js, and the configuration details are beyond the scope of this documentation. See the Node.js OpenSSL Strategy page for a starting point.

## Writing Data Importers

If you are using another app, like YNAB or Mint, you might want to migrate your data into Actual. Right now, Actual officially supports importing YNAB4 data and importing nYNAB data (and it works very well). But if you want to import all of your data into Actual, you can write a custom importer.

Note that this is **not** about importing transactions. If all you want to do is add transactions from a custom source (like your bank's API), use `importTransactions`. In this context, a custom importer is something that takes all of your data (budgets, transactions, payees, etc.) and dumps them all into a new file in Actual.

The API has a special mode for bulk importing data. In this mode, a new file is always created (you can't bulk import into an existing file), and it will run much faster than if you did it normally.

To write a custom importer, use `runImport`. It takes the name of the file you want to create and runs a function. Here is an example importer:

```js
let api = require('@actual-app/api');
let data = require('my-data.json');

async function run() {
  for (let account of data.accounts) {
    let acctId = await api.createAccount(convertAccount(account));
    await api.addTransactions(
      acctId,
      data.transactions
        .filter(t => t.acctId === acctId)
        .map(convertTransaction),
    );
  }
}

api.runImport('My-Budget', run);
```

This is very simple, but it takes some data in `my-data.json` and creates all the accounts and transactions from it. Functions used to convert items (like `convertAccount`) are not included here. Use the reference docs to learn the shape of objects that Actual expects.

> **Note:** It's important that `addTransactions` is used here. You want to use it instead of `importTransactions` when dumping raw data into Actual. The former will not run the reconciliation process (which deduplicates transactions), and won't create the other side of transfer transactions, and more. If you use `importTransactions` it may adjust your data in ways that don't match the data you're importing.

Check out the YNAB4 and YNAB5 importers to see how a real importer works.

## Methods

These are the public methods that you can use. The API also exports low-level functions like `init`, `send`, `disconnect`, and `loadBudget` if you want to manually manage the connection. You can read the source to learn about those methods (search for `export const lib`).

### `init`

```ts
init({ dataDir: string, serverURL: string, password: string, verbose: boolean }) → Promise<void>
```

Call this before attempting to use any of the API methods. This will connect to the server using the provided password and load the budget data.

- `dataDir` defaults to the current working directory.
- If no `serverURL` is provided, no network connections will be made, and you'll only be able to access budget files already downloaded locally.

You can find your budget id in the "Advanced" section of the settings page.

### `shutdown`

```ts
shutdown() → Promise<void>
```

Close the current budget file, and stop any other ongoing processes. It's recommended to call this before exiting your script.

### `utils.amountToInteger`

```ts
utils.amountToInteger(amount: number) → number
```

Convert a currency amount (such as `123.45`) represented as a floating point number to the integer format Actual uses internally (i.e. `12345`).

### `utils.integerToAmount`

```ts
utils.integerToAmount(amount: number) → number
```

Convert an integer amount as used internally by Actual (such as `12345`) to the traditional floating point (i.e. `123.45`).
