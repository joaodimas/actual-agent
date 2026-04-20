#!/usr/bin/env node
import { init, listBudgets, shutdown } from './lib/actual.js';

const main = async () => {
  await init();
  const budgets = await listBudgets();
  console.log(`Found ${budgets.length} budget(s) on server:\n`);
  for (const b of budgets) {
    console.log(`  name:        ${b.name}`);
    console.log(`  cloudFileId: ${b.cloudFileId}`);
    console.log(`  groupId:     ${b.groupId}`);
    console.log(`  hasKey:      ${b.hasKey}`);
    if (b.encryptKeyId) console.log(`  encryptKey:  ${b.encryptKeyId}`);
    console.log('');
  }
};

main()
  .catch((err) => {
    console.error('Error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => shutdown());
