import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvPath = path.join(__dirname, '../cost.csv');

function parseCurrency(val) {
  if (!val) return 0;
  let clean = val.replace(/[\$¥￥\s""()（）]/g, '');
  if (!clean || clean === '-') return 0;
  
  // Keep the negative sign if present
  let hasNeg = val.includes('-') || val.includes('(') || val.includes('（'); // wait, check if negative is represented in other ways
  let num = parseFloat(clean.replace(/,/g, ''));
  if (val.includes('-') && num > 0) {
    num = -num;
  }
  return num;
}

const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split(/\r?\n/);

let sum = 0;
let rowCount = 0;
for (let i = 2; i < lines.length; i++) { // Skip header (0) and summary row (1)
  const line = lines[i].trim();
  if (!line) continue;
  
  const cells = [];
  let currentCell = '';
  let inQuotes = false;
  for (let charIdx = 0; charIdx < line.length; charIdx++) {
    const char = line[charIdx];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(currentCell.trim());
      currentCell = '';
    } else {
      currentCell += char;
    }
  }
  cells.push(currentCell.trim());
  
  if (cells.length < 5) continue;
  const totalStr = cells[4];
  const remark = cells[5] || '';
  const date = cells[0];
  
  if (!date || date === '日期') continue;
  
  const val = parseCurrency(totalStr);
  sum += val;
  rowCount++;
  console.log(`Row ${i}: ${date} | ${totalStr} -> ${val} | ${remark}`);
}

console.log(`Total rows summed: ${rowCount}`);
console.log(`Sum of all rows: ${sum}`);
