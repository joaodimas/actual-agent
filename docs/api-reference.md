# API Reference

## Types of Methods

API methods are categorized into one of four types:

- `get`
- `create`
- `update`
- `delete`

Objects may have fields specific to a type of method. For example, the `payee` field of a transaction is only available in a `create` method. This field doesn't exist in objects returned from a `get` method (`payee_id` is used instead).

Fields specific to a type of request are marked as such in the notes.

`id` is a special field. All objects have an `id` field. However, you don't need to specify an `id` in a `create` method; all `create` methods will return the created id back to you.

All `update` and `delete` methods take an `id` to specify the desired object. `update` takes the fields to update as a second argument — it does not take a full object. That means even if a field is required, you don't have to pass it to `update`. For example, a category requires the `group_id` field, however `updateCategory(id, { name: "Food" })` is a valid call. Required means that an `update` can't set the field to null and a `create` must always contain the field.

> **Note:** `updateRule` is an exception — it requires the full `Rule` object including `id`, and returns `Promise<Rule>`.

## Primitives

These are types.

| Name   | Type    | Notes                                                                                                                                                              |
| ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id     | string  | UUID                                                                                                                                                               |
| month  | string  | `YYYY-MM`                                                                                                                                                          |
| date   | string  | `YYYY-MM-DD`                                                                                                                                                       |
| amount | integer | A currency amount is an integer representing the value without any decimal places. Usually it's `value * 100`, but it depends on your currency. For example, a USD amount of $120.30 would be `12030`. |

## Budgets

### `getBudgetMonths`

```ts
getBudgetMonths() → Promise<month[]>
```

### `getBudgetMonth`

```ts
getBudgetMonth(month: month) → Promise<Budget>
```

### `setBudgetAmount`

```ts
setBudgetAmount(month: month, categoryId: id, value: amount) → Promise<null>
```

### `setBudgetCarryover`

```ts
setBudgetCarryover(month: month, categoryId: id, flag: bool) → Promise<null>
```

### `holdBudgetForNextMonth`

```ts
holdBudgetForNextMonth(month: month, value: amount) → Promise<null>
```

### `resetBudgetHold`

```ts
resetBudgetHold(month: month) → Promise<null>
```

## Transactions

### Transaction

| Field           | Type            | Required? | Notes                                                                                                                       |
| --------------- | --------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| id              | id              | no        |                                                                                                                             |
| account         | id              | yes       |                                                                                                                             |
| date            | date            | yes       |                                                                                                                             |
| amount          | amount          | no        |                                                                                                                             |
| payee           | id              | no        | In a `create` request, this overrides `payee_name`.                                                                         |
| payee_name      | string          | no        | If given, a payee will be created with this name. If this matches an already existing payee, that payee will be used. *Only available in a `create` request.* |
| imported_payee  | string          | no        | This can be anything. Meant to represent the raw description when importing, allowing the user to see the original value.   |
| category        | id              | no        |                                                                                                                             |
| notes           | string          | no        |                                                                                                                             |
| imported_id     | string          | no        | A unique id usually given by the bank, if importing. Use this to avoid duplicate transactions.                              |
| transfer_id     | string          | no        | If a transfer, the id of the corresponding transaction in the other account. See transfers.                                 |
| cleared         | boolean         | no        | A flag indicating if the transaction has cleared or not.                                                                    |
| subtransactions | Transaction[]   | no        | An array of subtransactions for a split transaction. See split transactions. *Only available in a `get` or `create` request.* |

#### Split Transactions

A split transaction has several sub-transactions that split the total amount across them. You can create a split transaction by specifying an array of sub-transactions in the `subtransactions` field.

Subtransactions can specify the following fields, and `amount` is the only required field:

- `amount`
- `category`
- `notes`

If the amounts of the sub-transactions do not equal the total amount of the transaction, currently the API call will succeed but an error will be displayed within the app.

#### Transfers

Existing transfers will have the `transfer_id` field which points to the transaction on the other side. You should not change this or you will cause unexpected behavior. (You are allowed to set this when importing, however.)

If you want to create a transfer, use the transfer payee for the account you wish to transfer to/from. Load the payees, use the `transfer_acct` field of the payee to find the account you want to transfer to/from, and assign that payee to the transaction. A transfer with a transaction in both accounts will be created. (See transfer payees.)

### Methods

#### `addTransactions`

```ts
addTransactions(accountId: id, transactions: Transaction[], runTransfers?: bool = false, learnCategories?: bool = false) → Promise<id[]>
```

Adds multiple transactions at once. Does not reconcile (see `importTransactions`). Returns an array of ids of the newly created transactions.

This method does not avoid duplicates. Use `importTransactions` if you want the full reconcile behavior.

This method has the following optional flags:

- `runTransfers`: create transfers for transactions where transfer payee is given (defaults to `false`)
- `learnCategories`: update Rules based on the `category` field in the transactions (defaults to `false`)

This method is mainly for custom importers that want to skip all the automatic stuff because it wants to create raw data. You probably want to use `importTransactions`.

#### `importTransactions`

```ts
importTransactions(accountId: id, transactions: Transaction[], opts?: object = {}) → Promise<{ errors, added, updated }>
```

Adds multiple transactions at once, while going through the same process as importing a file or downloading transactions from a bank. In particular, all rules are run on the specified transactions before adding them. Use `addTransactions` instead for adding raw transactions without post-processing.

The import will "reconcile" transactions to avoid adding duplicates. Transactions with the same `imported_id` will never be added more than once. Otherwise, the system will match transactions with the same amount and with similar dates and payees and try to avoid duplicates. If not using `imported_id` you should check the results after importing.

It will also create transfers if a transfer payee is specified. See transfers.

This method has the following optional flags (passed as the `opts` object):

- `defaultCleared`: whether imported transactions should be marked as cleared (defaults to `true`)
- `dryRun`: if `true`, returns what would be added/updated without actually modifying the database (defaults to `false`)
- `reimportDeleted`: if `true`, transactions that were previously imported and then deleted will be reimported; if `false`, they will be skipped (defaults to `true` for backward compatibility — note that the file import UI defaults to `false`)

Example using `opts`:

```js
await api.importTransactions(accountId, transactions, {
  reimportDeleted: false,
  defaultCleared: false,
});
```

This method returns an object with the following fields:

- `added`: an array of ids of transactions that were added
- `updated`: an array of ids of transactions that were updated (such as being cleared)
- `errors`: any errors that occurred during the process (most likely a single error with no changes to transactions)

#### `getTransactions`

```ts
getTransactions(accountId: id, startDate: date, endDate: date) → Promise<Transaction[]>
```

Get all the transactions in `accountId` between the specified dates (inclusive). Returns an array of `Transaction` objects.

#### `updateTransaction`

```ts
updateTransaction(id: id, fields: object) → Promise<null>
```

Update fields of a transaction. `fields` can specify any field described in `Transaction`.

#### `deleteTransaction`

```ts
deleteTransaction(id: id) → Promise<null>
```

Delete a transaction.

### Examples

```js
// Create a transaction of $12.00. A payee of "Kroger" will be
// automatically created if it does not exist already and
// assigned to the transaction.

await importTransactions(accountId, [
  {
    date: '2019-08-20',
    amount: 1200,
    payee_name: 'Kroger',
    category: 'c179c3f4-28a6-4fbd-a54d-195cced07a80',
  },
]);

// Get all transactions in an account for the month of August
// (it doesn't matter that August 31st doesn't exist).

await getTransactions(accountId, '2019-08-01', '2019-08-31');

// Assign the "Food" category to a transaction

let categories = await getCategories();
let foodCategory = categories.find(cat => cat.name === 'Food');
await updateTransaction(id, { category: foodCategory.id });
```

## Accounts

### Account

| Field           | Type            | Required? | Notes                                                                                          |
| --------------- | --------------- | --------- | ---------------------------------------------------------------------------------------------- |
| id              | id              | no        |                                                                                                |
| name            | string          | yes       |                                                                                                |
| offbudget       | bool            | no        | Defaults to `false`                                                                            |
| closed          | bool            | no        | Defaults to `false`                                                                            |
| balance_current | number \| null  | no        | The current balance of the account as reported by bank sync. Can also be set manually. Defaults to `null` |

#### Account Types

The account type must be one of these valid strings:

- `checking`
- `savings`
- `credit`
- `investment`
- `mortgage`
- `debt`
- `other`

The account type does not affect anything currently. It's simply extra information about the account.

#### Closing Accounts

Avoid setting the `closed` property directly to close an account; instead use the `closeAccount` method. If the account still has money in it you will be required to specify another account to transfer the current balance to. This will help track your money correctly.

If you want to fully delete an account and remove it entirely from the system, use `deleteAccount`. Note that if it's an on budget account, any money coming from that account will disappear.

### Methods

#### `getAccounts`

```ts
getAccounts() → Promise<Account[]>
```

Get all accounts. Returns an array of `Account` objects.

#### `createAccount`

```ts
createAccount(account: Account, initialBalance?: amount = 0) → Promise<id>
```

Create an account with an initial balance of `initialBalance` (defaults to `0`). Remember that `amount` has no decimal places. Returns the id of the new account.

#### `updateAccount`

```ts
updateAccount(id: id, fields: object) → Promise<null>
```

Update fields of an account. `fields` can specify any field described in `Account`.

#### `closeAccount`

```ts
closeAccount(id: id, transferAccountId?: id, transferCategoryId?: id) → Promise<null>
```

Close an account. `transferAccountId` and `transferCategoryId` are optional if the balance of the account is `0`, otherwise see next paragraph.

If the account has a non-zero balance, you need to specify an account with `transferAccountId` to transfer the money into. If you are transferring from an on budget account to an off budget account, you can optionally specify a category with `transferCategoryId` to categorize the transfer transaction.

Transferring money to an off budget account needs a category because money is taken out of the budget, so it needs to come from somewhere.

If you want to simply delete an account, see `deleteAccount`.

#### `reopenAccount`

```ts
reopenAccount(id: id) → Promise<null>
```

Reopen a closed account.

#### `deleteAccount`

```ts
deleteAccount(id: id) → Promise<null>
```

Delete an account.

#### `getAccountBalance`

```ts
getAccountBalance(id: id, cutoff?: Date) → Promise<number>
```

Gets the balance for an account. If a `cutoff` is given, it gives the account balance as of that date. If no `cutoff` is given, it uses the current date as the cutoff.

### Examples

```js
// Create a savings account
createAccount({
  name: 'Ally Savings',
  type: 'savings',
});

// Get all accounts
let accounts = await getAccounts();
```

## Categories

### Category

| Field     | Type   | Required? | Notes                |
| --------- | ------ | --------- | -------------------- |
| id        | id     | no        |                      |
| name      | string | yes       |                      |
| group_id  | id     | yes       |                      |
| is_income | bool   | no        | Defaults to `false`  |

### Methods

#### `getCategories`

```ts
getCategories() → Promise<Category[]>
```

Get all categories.

#### `createCategory`

```ts
createCategory(category: Category) → Promise<id>
```

Create a category. Returns the id of the new category.

#### `updateCategory`

```ts
updateCategory(id: id, fields: object) → Promise<null>
```

Update fields of a category. `fields` can specify any field described in `Category`.

#### `deleteCategory`

```ts
deleteCategory(id: id) → Promise<null>
```

Delete a category.

### Examples

```js
{
  name: 'Food',
  group_id: '238d4d38-a512-4e28-9bbe-e96fd5d99251'
}
```

#### Income Categories

Set `is_income` to `true` to create an income category. The `group_id` of the category should point to the existing income group category (currently only one ever exists, see category group).

## Category Groups

### Category Group

| Field      | Type        | Required? | Notes                                                                                            |
| ---------- | ----------- | --------- | ------------------------------------------------------------------------------------------------ |
| id         | id          | no        |                                                                                                  |
| name       | string      | yes       |                                                                                                  |
| is_income  | bool        | no        | Defaults to `false`                                                                              |
| categories | Category[]  | no        | An array of categories in this group. Not valid when creating or updating a category group. Only available in a `get`. |

```js
{
  name: 'Bills';
}
```

#### Income Category Groups

There should only ever be one income category group.

### Methods

#### `getCategoryGroups`

```ts
getCategoryGroups() → Promise<CategoryGroup[]>
```

Get all category groups.

#### `createCategoryGroup`

```ts
createCategoryGroup(group: CategoryGroup) → Promise<id>
```

Create a category group. Returns the id of the new group.

#### `updateCategoryGroup`

```ts
updateCategoryGroup(id: id, fields: object) → Promise<id>
```

Update fields of a category group. `fields` can specify any field described in `CategoryGroup`.

#### `deleteCategoryGroup`

```ts
deleteCategoryGroup(id: id) → Promise<null>
```

Delete a category group.

## Payees

### Payee

| Field         | Type   | Required? | Notes                                                                              |
| ------------- | ------ | --------- | ---------------------------------------------------------------------------------- |
| id            | id     | no        |                                                                                    |
| name          | string | yes       |                                                                                    |
| category      | id     | no        |                                                                                    |
| transfer_acct | id     | no        | The id of the account this payee transfers to/from, if this is a transfer payee.   |

```js
{
  name: 'Kroger',
  category: 'a1bccbd1-039e-410a-ba05-a76b97a74fc8'
}
```

#### Transfers

Transfers use payees to indicate which accounts to transfer money to/from. This lets the system use the same payee matching logic to manage transfers as well.

Each account has a corresponding "transfer payee" already created in the system. If a payee is a transfer payee, it will have the `transfer_acct` field set to an account id. Use this to create transfer transactions with `importTransactions`.

### Methods

#### `getPayees`

```ts
getPayees() → Promise<Payee[]>
```

Get all payees.

#### `getCommonPayees`

```ts
getCommonPayees() → Promise<Payee[]>
```

Get common payees that appear frequently in transactions.

#### `createPayee`

```ts
createPayee(payee: Payee) → Promise<id>
```

Create a payee. Returns the id of the new payee.

#### `updatePayee`

```ts
updatePayee(id: id, fields: object) → Promise<id>
```

Update fields of a payee. `fields` can specify any field described in `Payee`.

#### `deletePayee`

```ts
deletePayee(id: id) → Promise<null>
```

Delete a payee.

#### `mergePayees`

```ts
mergePayees(targetId: id, mergeIds: id[]) → Promise<null>
```

Merge one or more payees into the target payee, retaining the name of the target.

## Tags

### Tag

| Field       | Type   | Required? | Notes |
| ----------- | ------ | --------- | ----- |
| id          | id     | no        |       |
| tag         | string | yes       |       |
| color       | string | no        |       |
| description | string | no        |       |

### Methods

#### `getTags`

```ts
getTags() → Promise<Tag[]>
```

Get all tags.

#### `createTag`

```ts
createTag(tag: Tag) → Promise<id>
```

Create a tag. Returns the id of the new tag.

#### `updateTag`

```ts
updateTag(id: id, fields: object) → Promise<null>
```

Update fields of a tag. `fields` can specify any field described in `Tag`.

#### `deleteTag`

```ts
deleteTag(id: id) → Promise<null>
```

Delete a tag.

### Examples

```js
// Create a tag
await createTag({
  tag: 'groceries',
  color: '#ff0000',
  description: 'Grocery shopping expenses',
});

// Get all tags
let tags = await getTags();

// Update a tag's color
await updateTag(id, { color: '#00ff00' });
```

## Rules

### ConditionOrAction

| Field | Type   | Required? | Notes |
| ----- | ------ | --------- | ----- |
| field | string | yes       |       |
| op    | string | yes       |       |
| value | string | yes       |       |

### Rule

| Field        | Type                  | Required? | Notes                                       |
| ------------ | --------------------- | --------- | ------------------------------------------- |
| id           | id                    | no        |                                             |
| stage        | string                | yes       | Must be one of `pre`, `default`, or `post`. |
| conditionsOp | string                | no        | Must be one of `and` or `or`.               |
| conditions   | ConditionOrAction[]   | no        |                                             |
| actions      | ConditionOrAction[]   | no        |                                             |

### Payee Rule

| Field        | Type                  | Required? | Notes                                       |
| ------------ | --------------------- | --------- | ------------------------------------------- |
| id           | id                    | no        |                                             |
| payee_id     | id                    | yes       |                                             |
| stage        | string                | yes       | Must be one of `pre`, `default`, or `post`. |
| conditionsOp | string                | no        | Must be one of `and` or `or`.               |
| conditions   | ConditionOrAction[]   | no        |                                             |
| actions      | ConditionOrAction[]   | no        |                                             |

### Methods

#### `getRules`

```ts
getRules() → Promise<Rule[]>
```

Get all rules.

#### `getPayeeRules`

```ts
getPayeeRules(payeeId: id) → Promise<Rule[]>
```

Get all rules associated with `payeeId`.

#### `createRule`

```ts
createRule(rule: Rule) → Promise<Rule>
```

Create a rule. Returns the new rule, including the `id`.

#### `updateRule`

```ts
updateRule(rule: Rule) → Promise<Rule>
```

Update a rule. Unlike other update methods, this requires the full rule object including `id`. Returns the updated rule.

#### `deleteRule`

```ts
deleteRule(id: id) → Promise<null>
```

Delete a rule.

### Examples

```js
{
  stage: 'pre',
  conditionsOp: 'and',
  conditions: [
    {
      field: 'payee',
      op: 'is',
      value: 'test-payee',
    },
  ],
  actions: [
    {
      op: 'set',
      field: 'category',
      value: 'fc3825fd-b982-4b72-b768-5b30844cf832',
    },
  ],
}
```

## Schedules

### Schedule

| Field             | Type                                          | Required? | Notes                                                                                                                                                              |
| ----------------- | --------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id                | id                                            | no        |                                                                                                                                                                    |
| name              | string                                        | no        | Not mandatory but schedule names must be unique.                                                                                                                   |
| rule              | string                                        | no        | All schedules have an associated underlying rule. Not to be supplied with a new schedule. It will be auto created. Rules can not updated to another rule. You can however edit the rule with the API above for `Rule`. |
| next_date         | string                                        | no        | Next occurrence of a schedule. Not to be supplied with a new schedule.                                                                                              |
| completed         | boolean                                       | no        | Not to be supplied with a new schedule.                                                                                                                            |
| posts_transaction | boolean                                       | no        | Whether the schedule should auto-post transactions on your behalf. Defaults to `false`.                                                                            |
| payee             | id \| null                                    | no        | Optional; will default to `null`.                                                                                                                                  |
| account           | id \| null                                    | no        | Optional; will default to `null`.                                                                                                                                  |
| amount            | number \| { num1: number; num2: number }      | no        | Provide only one number, except if the amount uses `isbetween` in `amountOp`, in which case `num1` and `num2` should be provided.                                  |
| amountOp          | `'is'` \| `'isapprox'` \| `'isbetween'`       | no        | Controls how `amount` is interpreted.                                                                                                                              |
| date              | date \| RecurConfig                           | yes       | Mandatory field when creating a schedule. If the schedule is a single occurrence just supply the date. Otherwise refer to `RecurConfig` details below.             |

### RecurConfig

| Field            | Type                                                  | Required? | Notes                                                                                                                                       |
| ---------------- | ----------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| frequency        | `'daily'` \| `'weekly'` \| `'monthly'` \| `'yearly'`  | yes       | How often the schedule repeats.                                                                                                             |
| interval         | number                                                | no        | The interval at which the recurrence happens. Defaults to `1` if omitted.                                                                   |
| patterns         | RecurPattern[]                                        | no        | Optional patterns to control specific dates for recurrence (e.g. certain weekdays or month days).                                           |
| skipWeekend      | boolean                                               | no        | If `true`, skips weekends when calculating recurrence dates.                                                                                |
| start            | string                                                | yes       | The ISO date string indicating the start date of the recurrence.                                                                            |
| endMode          | `'never'` \| `'after_n_occurrences'` \| `'on_date'`   | yes       | Specifies how the recurrence ends: never ends, after a number of occurrences, or on a specific date.                                        |
| endOccurrences   | number                                                | no        | Used when `endMode` is `'after_n_occurrences'`. Indicates how many times it should repeat.                                                   |
| endDate          | string                                                | no        | Used when `endMode` is `'on_date'`. The ISO date string indicating when the recurrence should end.                                          |
| weekendSolveMode | `'before'` \| `'after'`                               | no        | If a calculated date falls on a weekend and `skipWeekend` is `true`, this controls whether the date moves to the before or after weekday.   |

### Methods

#### `getSchedules`

```ts
getSchedules() → Promise<Schedule[]>
```

Get all schedules. Returns an array of `Schedule` objects.

#### `createSchedule`

```ts
createSchedule(schedule: Schedule) → Promise<id>
```

Create a schedule based on information filled in the `schedule` object. Please refer to notes of the schedule object for details on each field.

#### `updateSchedule`

```ts
updateSchedule(id: id, fields: object) → Promise<schedule>
```

Update fields of a schedule. `fields` can specify any field described in `Schedule`. Returns the updated schedule.

#### `deleteSchedule`

```ts
deleteSchedule(id: id) → Promise<null>
```

Delete a schedule.

## Misc

### BudgetFile

| Field         | Type    | Required? | Notes                                                                |
| ------------- | ------- | --------- | -------------------------------------------------------------------- |
| name          | string  | yes       | The budget's name.                                                   |
| cloudFileId   | string  | yes       | The id for the budget on the server. This is usually a UUID.         |
| groupId       | string  | yes       | The group id for the budget.                                         |
| hasKey        | boolean | yes       | If the file has an encryption key.                                   |
| encryptKeyId  | string  | no        | The encryption key ID for the file, if it is encrypted.              |
| state         | string  | no        | Remote files have this set to `"remote"`.                            |
| id            | string  | no        | The local budget file's local ID.                                    |

### InitConfig

| Field     | Type    | Required? | Notes                                                  |
| --------- | ------- | --------- | ------------------------------------------------------ |
| serverURL | string  | no        | The URL of your Actual Budget server.                  |
| password  | string  | no        | The password of your Actual Budget server.             |
| dataDir   | string  | no        | The directory to store locally cached budget files.    |
| verbose   | boolean | no        | Enable/disable logging from actual internals.          |

### Methods

#### `init`

```ts
init(config?: InitConfig) → Promise<void>
```

Initializes the API by connecting to an Actual Budget server. The `config` parameter is optional and defaults to `{}` (local-only mode).

#### `shutdown`

```ts
shutdown() → Promise<void>
```

Shuts down the API. This will close any open budget and clean up any resources.

#### `sync`

```ts
sync() → Promise<void>
```

Synchronizes the locally cached budget files with the server's copy.

#### `runBankSync`

```ts
runBankSync({ accountId: string }) → Promise<void>
```

Run the 3rd party (GoCardless, SimpleFIN) bank sync operation. This will download the transactions and insert them into the ledger.

#### `runImport`

```ts
runImport(budgetName: string, func: func) → Promise<void>
```

Creates a new budget file with the given name, and then runs the custom importer function to populate it with data.

#### `getBudgets`

```ts
getBudgets() → Promise<BudgetFile[]>
```

Returns a list of all budget files either locally cached or on the remote server. Remote files have a `state` field and local files have an `id` field.

#### `loadBudget`

```ts
loadBudget({ syncId: string }) → Promise<void>
```

Load a locally cached budget file.

#### `downloadBudget`

```ts
downloadBudget({ syncId: string, password?: string }) → Promise<void>
```

Load a budget file. If the file exists locally, it will load from there. Otherwise, it will download the file from the server.

#### `batchBudgetUpdates`

```ts
batchBudgetUpdates(func: func) → Promise<void>
```

Performs a batch of budget updates. This is useful for making multiple changes to the budget in a single call to the server.

#### `runQuery`

```ts
runQuery({ query: ActualQL }) → Promise<unknown>
```

Allows running any arbitrary ActualQL query on the open budget.

#### `getIDByName`

```ts
getIDByName({ type: string, string: string }) → Promise<string>
```

Get the ID for any Account, Payee, Category or Schedule by providing the corresponding name. Allowed types are `'accounts'`, `'schedules'`, `'categories'`, `'payees'`.

#### `getServerVersion`

```ts
getServerVersion() → Promise<{ error?: string } | { version: string }>
```

Returns either an error or the current server version.
