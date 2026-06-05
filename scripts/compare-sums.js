import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, '../src/data/cost.json');
const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

let sumPositives = 0;
let sumNegatives = 0;
let sumAll = 0;

rawData.transactions.forEach(t => {
  sumAll += t.total;
  if (t.total > 0) {
    sumPositives += t.total;
  } else {
    sumNegatives += t.total;
  }
});

console.log('--- RAW SUM FROM JSON ---');
console.log('Sum Positives (Expenses):', sumPositives);
console.log('Sum Negatives (Inflow):', sumNegatives);
console.log('Net Sum (All):', sumAll);

console.log('\n--- BY STATUS ---');
let incomeSum = 0;
let reimbSum = 0;
let transferSum = 0;
let expenseSum = 0;

rawData.transactions.forEach(t => {
  if (t.isTransfer) {
    transferSum += t.total;
  } else if (t.isIncome) {
    incomeSum += t.total;
  } else if (t.isReimbursement) {
    reimbSum += t.total;
  } else {
    expenseSum += t.total;
  }
});

console.log('Transfers Net:', transferSum);
console.log('Incomes Sum (Signed):', incomeSum);
console.log('Reimbursements Sum (Signed):', reimbSum);
console.log('Expenses Sum (Signed):', expenseSum);
console.log('Sum of parts:', transferSum + incomeSum + reimbSum + expenseSum);
