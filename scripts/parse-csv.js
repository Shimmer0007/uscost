import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvPath = path.join(__dirname, '../cost.csv');
const dataDir = path.join(__dirname, '../src/data');
const jsonPath = path.join(dataDir, 'cost.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function parseCurrency(val) {
  if (!val) return 0;
  let clean = val.replace(/[\$¥￥\s,""()（）]/g, '');
  if (!clean || clean === '-') return 0;
  return parseFloat(clean);
}

// Helper to convert "YYYY/M/D" or "YYYY/MM/DD" into a standard Date object
function parseDateString(dateStr) {
  if (!dateStr || dateStr === '-') return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    return new Date(y, m - 1, d);
  }
  return null;
}

function run() {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  
  const transactions = [];
  let summaryRow = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split CSV line respecting quotes
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

    if (cells.length < 6) continue;

    const dateStr = cells[0];
    const usdStr = cells[1];
    const rmbStr = cells[2];
    const rateStr = cells[3];
    const totalStr = cells[4];
    const remark = cells[5] || '';

    // Handle row 2 (total summary row in CSV)
    if (dateStr === '-') {
      summaryRow = {
        usd: parseCurrency(usdStr),
        rmb: parseCurrency(rmbStr),
        rateText: rateStr,
        total: parseCurrency(totalStr),
        remark: remark
      };
      continue;
    }

    // Skip empty lines or headers
    if (!dateStr || dateStr === '日期') continue;

    const usd = parseCurrency(usdStr);
    const rmb = parseCurrency(rmbStr);
    const rate = parseFloat(rateStr) || 1.0;
    const total = parseCurrency(totalStr);

    const isNegative = usdStr.includes('-') || rmbStr.includes('-') || totalStr.includes('-') || line.includes('-$') || line.includes('-¥') || line.includes('-“¥');

    let category = '其他';
    let subCategory = '其他';
    let isIncome = false;
    let isReimbursement = false;
    let isTransfer = false;

    const remarkLower = remark.toLowerCase();

    if (remark.includes('跨境汇款') || remark.includes('收汇')) {
      isTransfer = true;
      category = '账户划转';
      subCategory = remark.includes('跨境汇款') ? '汇出资金' : '收到汇款';
    } 
    else if (isNegative) {
      if (remark.includes('工资') || remark.includes('奖学金') || remark.includes('返现') || remark.includes('Discover返现') || remark.includes('Wells Fargo返现')) {
        isIncome = true;
        category = '收入';
        if (remark.includes('工资') || remark.includes('TA')) {
          subCategory = 'TA工资';
        } else if (remark.includes('奖学金')) {
          subCategory = '奖学金';
        } else {
          subCategory = '返现奖励';
        }
      } else {
        isReimbursement = true;
        category = '回款与退款';
        if (remark.includes('退款') || remark.includes('退货')) {
          subCategory = '退货退款';
        } else {
          subCategory = '均摊回款';
        }
      }
    } 
    else {
      if (/房租|电费|网费|押金|aep|rent|utility|network/i.test(remarkLower)) {
        category = '居住开销';
        if (remark.includes('房租')) subCategory = '房租';
        else if (remark.includes('电费') || remark.includes('AEP')) subCategory = '电费';
        else if (remark.includes('网费') || remark.includes('Network')) subCategory = '网费';
        else subCategory = '押金/中介费';
      } else if (/学费|教材|书|课程|案例包|学士服|成绩单|签证|sevis|evus|goventure|考试|驾考|dmv/i.test(remarkLower)) {
        category = '学业与学杂费';
        if (remark.includes('学费')) subCategory = '学费';
        else if (remark.includes('案例包') || remark.includes('书') || remark.includes('教材')) subCategory = '学习资料';
        else if (remark.includes('签证') || remark.includes('SEVIS') || remark.includes('EVUS')) subCategory = '签证相关';
        else if (remark.includes('成绩单')) subCategory = '成绩单';
        else subCategory = '考试与认证';
      } else if (/采购|kroger|weee|oasis|walmart|dollar tree|tjmaxx|生鲜|油|香皂|洗洁精/i.test(remarkLower)) {
        category = '超市采购';
        if (remark.includes('Kroger')) subCategory = 'Kroger';
        else if (remark.includes('Weee')) subCategory = 'Weee';
        else if (remark.includes('Oasis')) subCategory = 'Oasis';
        else if (remark.includes('Walmart')) subCategory = 'Walmart';
        else subCategory = '其他超市/百货';
      } else if (/麦当劳|wendy|chipotle|披萨|benny|火锅|日料|subway|点单|mami house|applebees|jersey|canes|owens|早餐|panda express|pizza|rex|涮锅|血亏|三明治|面/i.test(remarkLower)) {
        category = '餐饮美食';
        if (remark.includes('麦当劳')) subCategory = '麦当劳';
        else if (remark.includes('火锅') || remark.includes('涮锅')) subCategory = '火锅';
        else if (remark.includes('Chipotle') || remark.includes('Subway') || remark.includes('Wendy') || remark.includes('Panda Express')) subCategory = '快餐美式';
        else subCategory = '餐馆聚餐';
      } else if (/机票|酒店|车票|租车|加油|地铁|amtrak|车费|航意险|延意险|门票|春假|day|潜艇|庄园|灯塔|rdu|roa|exxon|kenly|amoco|chevron|enterprise|打车|uber|燃油|出行/i.test(remarkLower)) {
        category = '交通与旅行';
        if (remark.includes('机票') || remark.includes('航意险') || remark.includes('延意险')) subCategory = '机票';
        else if (remark.includes('酒店')) subCategory = '酒店住宿';
        else if (remark.includes('车票') || remark.includes('Amtrak') || remark.includes('车费') || remark.includes('地铁')) subCategory = '大巴/火车/地铁';
        else if (remark.includes('租车') || remark.includes('Enterprise')) subCategory = '租车服务';
        else if (remark.includes('加油') || remark.includes('Exxon') || remark.includes('Kenly') || remark.includes('Amoco') || remark.includes('Chevron') || remark.includes('燃油')) subCategory = '汽车加油';
        else if (remark.includes('Uber') || remark.includes('打车')) subCategory = '打车/网约车';
        else subCategory = '景点门票';
      } else if (/医保|药|cvs|医疗|账单|insurance/i.test(remarkLower)) {
        category = '医疗健康';
        if (remark.includes('医保')) subCategory = '医疗保险';
        else if (remark.includes('药') || remark.includes('CVS')) subCategory = '药品医疗';
        else subCategory = '医疗账单';
      } else if (/话费|移动|us-mobile|us mobile|新增号/i.test(remarkLower)) {
        category = '通信话费';
        subCategory = '手机话费';
      } else if (/锅|餐桌|书桌|床架|床垫|枕芯|毯|洗洁精|洗衣机/i.test(remarkLower)) {
        category = '家居与电器';
        subCategory = '家具与生活电器';
      } else if (/寄件|报税|自动售货机|reese|oreo|lemonade|保险/i.test(remarkLower)) {
        category = '杂项支出';
        subCategory = '杂项';
      }
    }

    // Robust Date-based Event classification
    let event = null;
    const txDate = parseDateString(dateStr);
    if (txDate) {
      const isSpringBreak = txDate >= new Date(2026, 2, 7) && txDate <= new Date(2026, 2, 19); // March is index 2
      const isEastCoastTrip = txDate >= new Date(2025, 10, 20) && txDate <= new Date(2025, 10, 27); // November is index 10
      const isGraduationTrip = txDate >= new Date(2026, 4, 16) && txDate <= new Date(2026, 4, 25); // May is index 4

      if (remark.includes('春假') || (isSpringBreak && !remark.includes('房租') && !remark.includes('电费') && !remark.includes('TA工资'))) {
        event = '2026春假佛罗里达行';
      } else if (remark.includes('美东出行') || (isEastCoastTrip && !remark.includes('学费') && !remark.includes('房租') && !remark.includes('奖学金'))) {
        event = '2025美东纽约感恩节出行';
      } else if (remark.includes('南部-华盛顿') || (isGraduationTrip && !remark.includes('学费') && !remark.includes('房租') && !remark.includes('工资') && !remark.includes('奖学金'))) {
        event = '2026毕业旅行(南部-华盛顿)';
      }
    }

    const signedTotal = isNegative ? -Math.abs(total) : Math.abs(total);
    const signedUsd = isNegative ? -Math.abs(usd) : Math.abs(usd);
    const signedRmb = isNegative ? -Math.abs(rmb) : Math.abs(rmb);

    transactions.push({
      id: i,
      date: dateStr,
      usd: signedUsd,
      rmb: signedRmb,
      rate: rate,
      total: signedTotal,
      remark: remark,
      category,
      subCategory,
      isIncome,
      isReimbursement,
      isTransfer,
      event
    });
  }

  const output = {
    summary: summaryRow,
    transactions: transactions
  };

  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Parsed ${transactions.length} transactions. Saved to ${jsonPath}`);
}

run();
