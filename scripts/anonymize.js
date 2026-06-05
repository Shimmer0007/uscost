import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvPath = path.join(__dirname, '../cost.csv');

function run() {
  let content = fs.readFileSync(csvPath, 'utf-8');

  // Define the replacements for desensitization
  const replacements = [
    { pattern: /（LJY）/g, replacement: '（室友A）' },
    { pattern: /\(LJY\)/g, replacement: '（室友A）' },
    
    { pattern: /（ZHL）/g, replacement: '（室友B）' },
    { pattern: /\(ZHL\)/g, replacement: '（室友B）' },
    
    { pattern: /（HQY）/g, replacement: '（同伴A）' },
    { pattern: /\(HQY\)/g, replacement: '（同伴A）' },
    
    { pattern: /（ZJR）/g, replacement: '（朋友A）' },
    { pattern: /\(ZJR\)/g, replacement: '（朋友A）' },
    
    { pattern: /（ZFX）/g, replacement: '（同伴B）' },
    { pattern: /\(ZFX\)/g, replacement: '（同伴B）' },
    
    { pattern: /（LZX）/g, replacement: '（同伴C）' },
    { pattern: /\(LZX\)/g, replacement: '（同伴C）' },
    
    { pattern: /（LZC）/g, replacement: '（同伴D）' },
    { pattern: /\(LZC\)/g, replacement: '（同伴D）' },

    { pattern: /HQY、ZJR/g, replacement: '同伴A、朋友A' }
  ];

  replacements.forEach(({ pattern, replacement }) => {
    content = content.replace(pattern, replacement);
  });

  fs.writeFileSync(csvPath, content, 'utf-8');
  console.log('Anonymized cost.csv successfully.');
}

run();
