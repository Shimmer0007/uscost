import { useState, useMemo, useRef } from 'react';
import {
  TrendingUp,
  Coffee,
  ShoppingBag,
  Plane,
  FileText,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronLeft,
  ChevronRight,
  Info,
  Award,
  Zap,
  Home,
  Upload,
  RefreshCw,
  Download
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';

import costData from './data/cost.json';

interface Transaction {
  id: number;
  date: string;
  usd: number;
  rmb: number;
  rate: number;
  total: number;
  remark: string;
  category: string;
  subCategory: string;
  isIncome: boolean;
  isReimbursement: boolean;
  isTransfer: boolean;
  event: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  '居住开销': '#ec4899', // Pink
  '学业与学杂费': '#3b82f6', // Blue
  '超市采购': '#10b981', // Green
  '餐饮美食': '#f97316', // Orange
  '交通与旅行': '#8b5cf6', // Purple
  '医疗健康': '#06b6d4', // Cyan
  '通信话费': '#f59e0b', // Amber
  '家居与电器': '#14b8a6', // Teal
  '杂项支出': '#64748b'  // Slate
};

// Top-Level Helpers to avoid hoisting / scope errors
const formatRMB = (val: number) => {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(val);
};

const formatUSD = (val: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(val);
};

const getTargetMonth = (t: Transaction, mode: 'cash' | 'accrual'): string => {
  const normDate = t.date.replace(/\//g, '-');
  if (mode === 'cash') {
    return normDate.substring(0, 7); // YYYY-MM
  }
  
  if (t.category === '居住开销') {
    const match = t.remark.match(/(\d+)-(\d+)月|(\d+)月/);
    if (match) {
      const targetMonthNum = parseInt(match[1] || match[3], 10);
      const txDateParts = normDate.split('-');
      const txYear = parseInt(txDateParts[0], 10);
      const txMonth = parseInt(txDateParts[1], 10);
      
      let targetYear = txYear;
      if (txMonth === 12 && targetMonthNum === 1) {
        targetYear = txYear + 1;
      } else if (txMonth === 1 && targetMonthNum === 12) {
        targetYear = txYear - 1;
      }
      
      const padMonth = String(targetMonthNum).padStart(2, '0');
      return `${targetYear}-${padMonth}`;
    }
  }
  
  return normDate.substring(0, 7);
};

// Frontend CSV Parser
function parseUploadedCSV(text: string): { transactions: Transaction[] } {
  const lines = text.split(/\r?\n/);
  const transactions: Transaction[] = [];
  let idCounter = 1;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells: string[] = [];
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

    const parseCurrency = (val: string) => {
      if (!val) return 0;
      let clean = val.replace(/[\$¥￥\s,""()（）]/g, '');
      if (!clean || clean === '-') return 0;
      return parseFloat(clean);
    };

    if (!dateStr || dateStr === '日期' || dateStr === '-') continue;

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

    let event: string | null = null;
    const parseDateString = (dStr: string) => {
      const parts = dStr.split('/');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        return new Date(y, m - 1, d);
      }
      return null;
    };
    const txDate = parseDateString(dateStr);
    if (txDate) {
      const isSpringBreak = txDate >= new Date(2026, 2, 7) && txDate <= new Date(2026, 2, 19);
      const isEastCoastTrip = txDate >= new Date(2025, 10, 20) && txDate <= new Date(2025, 10, 27);
      const isGraduationTrip = txDate >= new Date(2026, 4, 16) && txDate <= new Date(2026, 4, 25);

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
      id: idCounter++,
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

  return { transactions };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'mcdonalds' | 'groceries' | 'travel' | 'recovery' | 'utilities' | 'settlement'>('dashboard');
  const [excludeMajors, setExcludeMajors] = useState(true);
  const [accountingMode, setAccountingMode] = useState<'cash' | 'accrual'>('accrual');
  
  // Custom Data Upload states
  const [customData, setCustomData] = useState<{ transactions: Transaction[] } | null>(null);
  const [isUsingCustom, setIsUsingCustom] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [eventFilter, setEventFilter] = useState('all');
  const [sortField, setSortField] = useState<'date' | 'total'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const rawTransactions = useMemo(() => {
    return isUsingCustom && customData ? customData.transactions : (costData.transactions as Transaction[]);
  }, [isUsingCustom, customData]);

  // Handle local CSV upload
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        const parsed = parseUploadedCSV(text);
        if (parsed.transactions.length > 0) {
          setCustomData(parsed);
          setIsUsingCustom(true);
          setActiveTab('dashboard');
        } else {
          alert('CSV格式不正确或无有效数据，请检查模板！');
        }
      } catch (err) {
        alert('解析失败，请确保上传了正确的CSV格式记账账单。');
      }
    };
    reader.readAsText(file);
  };

  const handleResetData = () => {
    setIsUsingCustom(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadTemplate = () => {
    const headers = '日期,美元,人民币,月均汇率,合计,备注\n';
    const rows = [
      '-,$58,785.66,$44,426.83,（$1兑￥1）,$459,872.79,汇总行(可选)\n',
      '2025/5/16,$350.00,,7.22,$2527.00,签证SEVIS-901材料费\n',
      '2025/5/16,,¥6211.00,7.22,¥6211.00,北京-迪拜-华盛顿机票+航空意外险\n',
      '2025/8/9,$20,958.50,¥1,000.00,7.17,¥151272.45,25-26 Fall学费\n',
      '2025/8/26,$4.27,,7.17,¥30.62,麦当劳点单\n',
      '2025/9/8,$552.28,,7.12,¥3932.23,9-10月房租\n',
      '2026/1/16,-$42.70,,6.97,-¥297.62,TA工资\n'
    ];
    const blob = new Blob([headers + rows.join('')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'cost_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Stats Calculation
  const stats = useMemo(() => {
    let grossExpensesRmb = 0;
    let totalIncomeRmb = 0;
    let totalReimbursementRmb = 0;
    let totalTuitionRmb = 0;
    let transferOut = 0;
    let transferIn = 0;

    rawTransactions.forEach((t) => {
      if (t.isTransfer) {
        if (t.total > 0) {
          transferOut += t.total;
        } else {
          transferIn += Math.abs(t.total);
        }
        return; // Exclude fund transfers from direct expense and income
      }
      if (t.subCategory === '学费') {
        totalTuitionRmb += Math.abs(t.total);
      }
      if (t.isIncome) {
        // TA wages, scholarships, cashback are positive incomes (sign in CSV is negative, meaning credit)
        totalIncomeRmb += Math.abs(t.total);
      } else if (t.isReimbursement) {
        // Split bills, refunds are positive reimbursements (offsetting costs)
        totalReimbursementRmb += Math.abs(t.total);
      } else {
        // Direct expense
        grossExpensesRmb += Math.abs(t.total);
      }
    });

    const transferLoss = Math.max(0, transferOut - transferIn); // Exchange loss
    const adjustedGross = grossExpensesRmb + transferLoss;
    const netExpensesRmb = adjustedGross - totalReimbursementRmb;
    const selfFundedNetCostRmb = netExpensesRmb - totalIncomeRmb;

    // Calculate daily living costs (excluding tuition and flight tickets)
    let dailyLivingCostsRmb = 0;
    rawTransactions.forEach((t) => {
      if (t.isTransfer || t.isIncome || t.isReimbursement) return;
      if (t.subCategory !== '学费' && t.subCategory !== '机票') {
        dailyLivingCostsRmb += Math.abs(t.total);
      }
    });
    dailyLivingCostsRmb += transferLoss;

    return {
      grossExpensesRmb: adjustedGross,
      totalIncomeRmb,
      totalReimbursementRmb,
      netExpensesRmb,
      selfFundedNetCostRmb,
      totalTuitionRmb,
      transferLoss,
      dailyLivingCostsRmb,
      netDailyLivingCostsRmb: dailyLivingCostsRmb - totalReimbursementRmb
    };
  }, [rawTransactions]);

  // Monthly Trends Area Chart
  const monthlyTrendData = useMemo(() => {
    const monthsData: Record<string, { month: string; expense: number; income: number; rate: number; rateCount: number }> = {};
    
    rawTransactions.forEach(t => {
      if (!t.date || t.date === '-') return;
      if (t.isTransfer) return;
      if (excludeMajors && (t.subCategory === '学费' || t.subCategory === '机票')) return;
      
      const targetMonth = getTargetMonth(t, accountingMode);
      
      if (!monthsData[targetMonth]) {
        monthsData[targetMonth] = { month: targetMonth, expense: 0, income: 0, rate: 0, rateCount: 0 };
      }

      if (t.isIncome) {
        monthsData[targetMonth].income += Math.abs(t.total);
      } else if (!t.isReimbursement) {
        monthsData[targetMonth].expense += Math.abs(t.total);
      }

      if (t.rate > 1) {
        monthsData[targetMonth].rate += t.rate;
        monthsData[targetMonth].rateCount += 1;
      }
    });

    return Object.keys(monthsData)
      .sort()
      .map(m => {
        const item = monthsData[m];
        return {
          month: m,
          expense: Math.round(item.expense),
          income: Math.round(item.income),
          avgRate: item.rateCount > 0 ? parseFloat((item.rate / item.rateCount).toFixed(2)) : 7.0
        };
      });
  }, [rawTransactions, excludeMajors, accountingMode]);

  // Category Aggregates for Pie Chart
  const categoryChartData = useMemo(() => {
    const aggregates: Record<string, number> = {};
    rawTransactions.forEach(t => {
      if (t.isTransfer) return;
      if (excludeMajors && (t.subCategory === '学费' || t.subCategory === '机票')) return;
      if (!t.isIncome && !t.isReimbursement) {
        aggregates[t.category] = (aggregates[t.category] || 0) + Math.abs(t.total);
      }
    });

    // Extract transfer/exchange loss if any and attribute it to '杂项支出' so the chart balances
    let transferOut = 0;
    let transferIn = 0;
    rawTransactions.forEach(t => {
      if (t.isTransfer) {
        if (t.total > 0) transferOut += t.total;
        else transferIn += Math.abs(t.total);
      }
    });
    const loss = Math.max(0, transferOut - transferIn);
    if (loss > 0 && (!excludeMajors || aggregates['杂项支出'] !== undefined)) {
      aggregates['杂项支出'] = (aggregates['杂项支出'] || 0) + loss;
    }

    return Object.entries(aggregates)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [rawTransactions, excludeMajors]);

  // McDonald's Specific Metrics
  const mcdStats = useMemo(() => {
    const mcdTrans = rawTransactions.filter(t => t.remark.includes('麦当劳'));
    const count = mcdTrans.length;
    const totalUSD = mcdTrans.reduce((sum, t) => sum + Math.abs(t.usd), 0);
    const totalRMB = mcdTrans.reduce((sum, t) => sum + Math.abs(t.total), 0);
    const avgRMB = count > 0 ? totalRMB / count : 0;
    
    const monthlyFrequency: Record<string, number> = {};
    mcdTrans.forEach(t => {
      const month = t.date.substring(0, 7).replace('/', '-');
      if (month) {
        monthlyFrequency[month] = (monthlyFrequency[month] || 0) + 1;
      }
    });

    return {
      count,
      totalUSD,
      totalRMB,
      avgRMB,
      transactions: mcdTrans,
      monthlyFrequency: Object.entries(monthlyFrequency).map(([month, freq]) => ({ month, count: freq })).sort((a, b) => a.month.localeCompare(b.month))
    };
  }, [rawTransactions]);

  // Grocery stores metrics
  const groceryStats = useMemo(() => {
    const stores = [
      { name: 'Kroger (美式商超)', keywords: ['kroger', 'Kroger'] },
      { name: 'Weee (中式生鲜)', keywords: ['weee', 'Weee'] },
      { name: 'Oasis (亚超)', keywords: ['oasis', 'Oasis'] },
      { name: 'Walmart (沃尔玛)', keywords: ['walmart', 'Walmart'] }
    ];

    const result = stores.map(store => {
      const trans = rawTransactions.filter(t => 
        store.keywords.some(kw => t.remark.includes(kw)) && !t.isReimbursement
      );
      const amount = trans.reduce((sum, t) => sum + Math.abs(t.total), 0);
      const count = trans.length;
      return {
        name: store.name,
        amount: Math.round(amount),
        count
      };
    });

    return result.sort((a, b) => b.amount - a.amount);
  }, [rawTransactions]);

  // Travel Events Metrics
  const travelStats = useMemo(() => {
    const events = [
      { id: '2025美东纽约感恩节出行', label: '2025 美东感恩节纽约行 (4人)', dates: '11/20 - 11/27' },
      { id: '2026春假佛罗里达行', label: '2026 佛罗里达春假行 (6人)', dates: '03/07 - 03/19' },
      { id: '2026毕业旅行(南部-华盛顿)', label: '2026 南部&华盛顿毕业旅行', dates: '05/16 - 05/25' }
    ];

    return events.map(event => {
      const eventTrans = rawTransactions.filter(t => t.event === event.id);
      
      const grossCost = eventTrans
        .filter(t => !t.isIncome && !t.isReimbursement)
        .reduce((sum, t) => sum + Math.abs(t.total), 0);

      const reimbursement = eventTrans
        .filter(t => t.isReimbursement)
        .reduce((sum, t) => sum + Math.abs(t.total), 0);

      const netCost = grossCost - reimbursement;

      return {
        id: event.id,
        label: event.label,
        dates: event.dates,
        grossCost: Math.round(grossCost),
        reimbursement: Math.round(reimbursement),
        netCost: Math.round(netCost),
        transCount: eventTrans.length
      };
    });
  }, [rawTransactions]);

  // Income & Recovery Ratio Metrics
  const recoveryStats = useMemo(() => {
    const taWages = rawTransactions.filter(t => t.subCategory === 'TA工资').reduce((sum, t) => sum + Math.abs(t.total), 0);
    const scholarships = rawTransactions.filter(t => t.subCategory === '奖学金').reduce((sum, t) => sum + Math.abs(t.total), 0);
    const cashbacks = rawTransactions.filter(t => t.subCategory === '返现奖励').reduce((sum, t) => sum + Math.abs(t.total), 0);
    
    const livingCost = stats.netDailyLivingCostsRmb;
    const recoveryRatio = livingCost > 0 ? ((taWages + scholarships + cashbacks) / livingCost) * 100 : 0;

    const monthlyIncomeData: Record<string, { month: string; wages: number; scholarship: number; cashback: number }> = {};
    rawTransactions.forEach(t => {
      if (!t.isIncome || !t.date || t.date === '-') return;
      const month = t.date.substring(0, 7).replace('/', '-');
      if (!monthlyIncomeData[month]) {
        monthlyIncomeData[month] = { month, wages: 0, scholarship: 0, cashback: 0 };
      }
      if (t.subCategory === 'TA工资') {
        monthlyIncomeData[month].wages += Math.abs(t.total);
      } else if (t.subCategory === '奖学金') {
        monthlyIncomeData[month].scholarship += Math.abs(t.total);
      } else if (t.subCategory === '返现奖励') {
        monthlyIncomeData[month].cashback += Math.abs(t.total);
      }
    });

    const incomeTrend = Object.values(monthlyIncomeData).sort((a, b) => a.month.localeCompare(b.month));

    return {
      taWages,
      scholarships,
      cashbacks,
      livingCost,
      recoveryRatio: parseFloat(recoveryRatio.toFixed(1)),
      incomeTrend
    };
  }, [rawTransactions, stats]);

  // Utilities Seasonal Variance
  const utilitiesStats = useMemo(() => {
    const electricTrans = rawTransactions.filter(t => t.subCategory === '电费');
    const internetTrans = rawTransactions.filter(t => t.subCategory === '网费');
    const phoneTrans = rawTransactions.filter(t => t.subCategory === '手机话费');

    const monthlyUtilities: Record<string, { month: string; electric: number; internet: number; phone: number }> = {};

    electricTrans.forEach(t => {
      const month = getTargetMonth(t, 'accrual');
      if (!monthlyUtilities[month]) monthlyUtilities[month] = { month, electric: 0, internet: 0, phone: 0 };
      monthlyUtilities[month].electric += Math.abs(t.total);
    });

    internetTrans.forEach(t => {
      const month = getTargetMonth(t, 'accrual');
      if (!monthlyUtilities[month]) monthlyUtilities[month] = { month, electric: 0, internet: 0, phone: 0 };
      monthlyUtilities[month].internet += Math.abs(t.total);
    });

    phoneTrans.forEach(t => {
      const month = t.date.substring(0, 7).replace('/', '-');
      if (!monthlyUtilities[month]) monthlyUtilities[month] = { month, electric: 0, internet: 0, phone: 0 };
      monthlyUtilities[month].phone += Math.abs(t.total);
    });

    const trend = Object.values(monthlyUtilities).sort((a, b) => a.month.localeCompare(b.month));

    return {
      electricTotal: electricTrans.reduce((sum, t) => sum + Math.abs(t.total), 0),
      internetTotal: internetTrans.reduce((sum, t) => sum + Math.abs(t.total), 0),
      phoneTotal: phoneTrans.reduce((sum, t) => sum + Math.abs(t.total), 0),
      trend
    };
  }, [rawTransactions]);

  // Settlement Setup Costs
  const setupStats = useMemo(() => {
    const setupItems = rawTransactions.filter(t => 
      /书桌|床架|床垫|多功能锅|圆形餐桌|枕芯|法兰绒毯|自提洗衣机|碗|洗洁精|香皂/.test(t.remark) && !t.remark.includes('退款')
    );
    const setupTotal = setupItems.reduce((sum, t) => sum + Math.abs(t.total), 0);

    const academicItems = rawTransactions.filter(t => 
      /签证|SEVIS|教材|案例包|成绩单|EVUS|学士服|课程|报名费|驾考|DMV/.test(t.remark) && !t.isIncome
    );
    const academicTotal = academicItems.reduce((sum, t) => sum + Math.abs(t.total), 0);

    return {
      setupItems,
      setupTotal,
      academicItems,
      academicTotal
    };
  }, [rawTransactions]);

  const filteredTransactions = useMemo(() => {
    let result = [...rawTransactions];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t => t.remark.toLowerCase().includes(q) || t.subCategory.toLowerCase().includes(q));
    }

    if (categoryFilter !== 'all') {
      result = result.filter(t => t.category === categoryFilter);
    }

    if (eventFilter !== 'all') {
      result = result.filter(t => t.event === eventFilter);
    }

    if (typeFilter !== 'all') {
      if (typeFilter === 'expense') {
        result = result.filter(t => !t.isIncome && !t.isReimbursement && !t.isTransfer);
      } else if (typeFilter === 'income') {
        result = result.filter(t => t.isIncome);
      } else if (typeFilter === 'reimbursement') {
        result = result.filter(t => t.isReimbursement);
      } else if (typeFilter === 'transfer') {
        result = result.filter(t => t.isTransfer);
      }
    }

    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'date') {
        valA = new Date(valA.replace(/\//g, '-')).getTime();
        valB = new Date(valB.replace(/\//g, '-')).getTime();
      } else {
        valA = Math.abs(valA);
        valB = Math.abs(valB);
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [rawTransactions, search, categoryFilter, typeFilter, eventFilter, sortField, sortOrder]);

  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <TrendingUp size={22} />
          </div>
          <span className="brand-name">CostAnalytics</span>
        </div>

        {/* Local CSV Custom Upload Panel */}
        <div style={{ backgroundColor: 'var(--border-light)', padding: '1rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
          <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>📊 分析我的记账账单</span>
          
          <input
            type="file"
            accept=".csv"
            onChange={handleCSVUpload}
            ref={fileInputRef}
            style={{ display: 'none' }}
            id="csv-file-upload"
          />

          {!isUsingCustom ? (
            <label 
              htmlFor="csv-file-upload" 
              className="select-filter" 
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer', backgroundColor: 'var(--primary)', color: 'white', border: 'none', fontWeight: 600, padding: '0.5rem' }}
            >
              <Upload size={16} /> 上传 CSV 账单
            </label>
          ) : (
            <button 
              onClick={handleResetData}
              className="select-filter"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', border: '1px solid var(--danger)', fontWeight: 600, padding: '0.5rem' }}
            >
              <RefreshCw size={16} /> 恢复演示数据
            </button>
          )}

          <button 
            onClick={handleDownloadTemplate}
            className="select-filter"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', border: '1px solid var(--border-color)', padding: '0.5rem', backgroundColor: 'var(--bg-card)' }}
          >
            <Download size={14} /> 下载记账模版
          </button>
        </div>
        
        <ul className="nav-list" style={{ flexGrow: 1 }}>
          <li 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Layers /> Dashboard
          </li>
          <li 
            className={`nav-item ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => { setActiveTab('transactions'); setCurrentPage(1); }}
          >
            <FileText /> 所有账单
          </li>
          
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', margin: '1rem 0 0.5rem 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>分析专题</div>
          
          <li 
            className={`nav-item ${activeTab === 'recovery' ? 'active' : ''}`}
            onClick={() => setActiveTab('recovery')}
          >
            <Award /> 回血率与小金库
          </li>
          <li 
            className={`nav-item ${activeTab === 'utilities' ? 'active' : ''}`}
            onClick={() => setActiveTab('utilities')}
          >
            <Zap /> 能耗温控分析
          </li>
          <li 
            className={`nav-item ${activeTab === 'settlement' ? 'active' : ''}`}
            onClick={() => setActiveTab('settlement')}
          >
            <Home /> 租房安家成本
          </li>
          <li 
            className={`nav-item ${activeTab === 'mcdonalds' ? 'active' : ''}`}
            onClick={() => setActiveTab('mcdonalds')}
          >
            <Coffee /> 麦当劳指数
          </li>
          <li 
            className={`nav-item ${activeTab === 'groceries' ? 'active' : ''}`}
            onClick={() => setActiveTab('groceries')}
          >
            <ShoppingBag /> 超市争霸赛
          </li>
          <li 
            className={`nav-item ${activeTab === 'travel' ? 'active' : ''}`}
            onClick={() => setActiveTab('travel')}
          >
            <Plane /> 旅行专题分析
          </li>
        </ul>

        {/* Footer Credit & Copyright */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.4' }}>
          <p>© 2026 Shimmer. All Rights Reserved.</p>
          <p style={{ marginTop: '0.25rem' }}>Designed by Shimmer0007</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content animated-fade-in">
        {/* Header */}
        <div className="dashboard-header">
          <div className="header-title">
            <h1>留学开销与收入数据挖掘</h1>
            <p>基于 {isUsingCustom ? '您上传的自定义' : '2025.05 - 2026.05 期间留学'}账本的多维度统计与分析</p>
          </div>
          <div className="badge badge-event" style={{ fontSize: '0.85rem', padding: '0.4rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {isUsingCustom && <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)' }}></span>}
            数据源：{isUsingCustom ? '自定义账单' : '演示数据'} ({rawTransactions.length} 条)
          </div>
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <>
            {/* Exclude major scale toggle & accounting mode */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', margin: '-1rem 0 0.5rem 0', flexWrap: 'wrap' }}>
              <button
                className="select-filter"
                onClick={() => setAccountingMode(prev => prev === 'cash' ? 'accrual' : 'cash')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  backgroundColor: accountingMode === 'accrual' ? 'var(--primary-light)' : 'var(--bg-card)',
                  color: accountingMode === 'accrual' ? 'var(--primary)' : 'var(--text-secondary)',
                  border: `1px solid ${accountingMode === 'accrual' ? 'var(--primary)' : 'var(--border-color)'}`,
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                {accountingMode === 'accrual' ? '📊 权责发生制 (账期对齐)' : '💵 收付实现制 (实际付款日)'}
              </button>
              
              <button
                className="select-filter"
                onClick={() => setExcludeMajors(prev => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  backgroundColor: excludeMajors ? 'var(--primary-light)' : 'var(--bg-card)',
                  color: excludeMajors ? 'var(--primary)' : 'var(--text-secondary)',
                  border: `1px solid ${excludeMajors ? 'var(--primary)' : 'var(--border-color)'}`,
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                {excludeMajors ? '🟢 已排除学费及机票 (展示日常)' : '⚪ 未排除学费及机票 (宏观视角)'}
              </button>
            </div>

            {/* Stat Cards */}
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-title">原始总开支 (Gross)</span>
                  <div className="stat-icon" style={{ backgroundColor: 'var(--danger-light)', color: 'var(--danger)' }}>
                    <ArrowUpRight size={20} />
                  </div>
                </div>
                <div className="stat-value">{formatRMB(stats.grossExpensesRmb)}</div>
                <div className="stat-desc">包含他人等额外垫付与汇兑折损</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-title">他人均摊回款与退款</span>
                  <div className="stat-icon" style={{ backgroundColor: 'var(--info-light)', color: 'var(--info)' }}>
                    <ArrowDownLeft size={20} />
                  </div>
                </div>
                <div className="stat-value" style={{ color: 'var(--info)' }}>{formatRMB(stats.totalReimbursementRmb)}</div>
                <div className="stat-desc">剔除回赠与均摊干扰</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-title">留学个人净支出 (Net)</span>
                  <div className="stat-icon" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
                    <TrendingUp size={20} />
                  </div>
                </div>
                <div className="stat-value" style={{ color: 'var(--primary)' }}>{formatRMB(stats.netExpensesRmb)}</div>
                <div className="stat-desc">个人真实生活与学习总开销</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-title">总体学费开支</span>
                  <div className="stat-icon" style={{ backgroundColor: 'var(--study-bg)', color: 'var(--study-color)' }}>
                    <Award size={20} />
                  </div>
                </div>
                <div className="stat-value" style={{ color: 'var(--study-color)' }}>{formatRMB(stats.totalTuitionRmb)}</div>
                <div className="stat-desc">学费栏目关联总开销</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-title">TA与奖学金总收益</span>
                  <div className="stat-icon" style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                    <Award size={20} />
                  </div>
                </div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>{formatRMB(stats.totalIncomeRmb)}</div>
                <div className="stat-desc">TA助研工资 + 各项奖学金总和</div>
              </div>
            </div>

            {/* Visuals */}
            <div className="visuals-grid">
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <TrendingUp /> 月度收支走势 & 汇率波动
                  </div>
                </div>
                <div style={{ width: '100%', height: 350 }}>
                  <ResponsiveContainer>
                    <AreaChart data={monthlyTrendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <defs>
                        <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
                      <Tooltip content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="custom-tooltip">
                              <p className="custom-tooltip-label">{data.month}</p>
                              <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>总支出: {formatRMB(data.expense)}</p>
                              <p style={{ color: 'var(--success)', fontSize: '0.85rem' }}>总收入: {formatRMB(data.income)}</p>
                              <p style={{ color: 'var(--primary)', fontSize: '0.85rem', marginTop: '0.25rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.25rem' }}>平均汇率: {data.avgRate}</p>
                            </div>
                          );
                        }
                        return null;
                      }} />
                      <Legend />
                      <Area name="月度开支" type="monotone" dataKey="expense" stroke="#ef4444" fillOpacity={1} fill="url(#colorExpense)" strokeWidth={2} />
                      <Area name="月度收入" type="monotone" dataKey="income" stroke="#10b981" fillOpacity={1} fill="url(#colorIncome)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <Layers /> 支出构成分析
                  </div>
                </div>
                <div style={{ width: '100%', height: 220, display: 'flex', justifyContent: 'center' }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={categoryChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {categoryChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || '#64748b'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatRMB(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="category-list">
                  {categoryChartData.slice(0, 5).map((entry, i) => (
                    <div className="category-item" key={i}>
                      <span className="category-dot" style={{ backgroundColor: CATEGORY_COLORS[entry.name] }}></span>
                      <span className="category-name">{entry.name}</span>
                      <span className="category-amount">{formatRMB(entry.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <Info /> 关键洞察
                </div>
              </div>
              <div style={{ fontSize: '0.95rem', display: 'flex', flexDirection: 'column', gap: '1rem', color: 'var(--text-secondary)' }}>
                <p>
                  🎓 <strong>学业开支与支出比例：</strong> 账本中<strong>学费与学杂费</strong>是大宗固定资产性投入，其余日常开销比例较为均匀。
                </p>
                <p>
                  💰 <strong>收支对冲模型：</strong> 结合TA工资、助学金与信用卡返现等 <strong>{formatRMB(stats.totalIncomeRmb)}</strong> 额外流向，真实自付负担被合理减轻。
                </p>
                {stats.transferLoss > 0 && (
                  <p>
                    📉 <strong>汇兑流失：</strong> 本次分析中自动计算并捕获了在跨境大额划拨中产生的汇兑手续费与损耗 <strong>{formatRMB(stats.transferLoss)}</strong>。
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <div className="card">
            <div className="controls-row">
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="搜索账单备注..."
                  className="search-input"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                />
                
                <select 
                  className="select-filter"
                  value={categoryFilter}
                  onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
                >
                  <option value="all">所有分类</option>
                  {Object.keys(CATEGORY_COLORS).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                <select 
                  className="select-filter"
                  value={typeFilter}
                  onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
                >
                  <option value="all">所有流水类型</option>
                  <option value="expense">支出 (Expense)</option>
                  <option value="income">收入 (Income)</option>
                  <option value="reimbursement">回款/退款</option>
                  <option value="transfer">账户划转</option>
                </select>

                <select 
                  className="select-filter"
                  value={eventFilter}
                  onChange={(e) => { setEventFilter(e.target.value); setCurrentPage(1); }}
                >
                  <option value="all">所有专项活动</option>
                  <option value="2025美东纽约感恩节出行">2025 美东纽约行</option>
                  <option value="2026春假佛罗里达行">2026 佛罗里达春假行</option>
                  <option value="2026毕业旅行(南部-华盛顿)">2026 毕业旅行(南部-华盛顿)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>排序:</span>
                <select 
                  className="select-filter"
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as any)}
                >
                  <option value="date">按日期</option>
                  <option value="total">按金额</option>
                </select>
                <button 
                  className="select-filter"
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  style={{ minWidth: '40px', padding: '0.625rem 0.75rem' }}
                >
                  {sortOrder === 'asc' ? '▲' : '▼'}
                </button>
              </div>
            </div>

            <div className="table-container">
              <table className="trans-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>分类</th>
                    <th>美元 (USD)</th>
                    <th>人民币 (RMB)</th>
                    <th>汇率</th>
                    <th>人民币合计</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTransactions.map((t) => (
                    <tr key={t.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                      <td>
                        <span 
                          className="badge" 
                          style={{ 
                            backgroundColor: CATEGORY_COLORS[t.category] ? CATEGORY_COLORS[t.category] + '20' : '#f1f5f9',
                            color: CATEGORY_COLORS[t.category] || 'var(--text-secondary)'
                          }}
                        >
                          {t.subCategory || t.category}
                        </span>
                      </td>
                      <td style={{ color: t.usd < 0 ? 'var(--success)' : 'inherit' }}>
                        {t.usd !== 0 ? formatUSD(t.usd) : '-'}
                      </td>
                      <td style={{ color: t.rmb < 0 ? 'var(--success)' : 'inherit' }}>
                        {t.rmb !== 0 ? formatRMB(t.rmb) : '-'}
                      </td>
                      <td>{t.rate}</td>
                      <td>
                        <span className={`badge ${t.isIncome ? 'badge-income' : t.isReimbursement ? 'badge-reimbursement' : t.isTransfer ? 'badge-event' : 'badge-expense'}`}>
                          {t.isIncome || t.isReimbursement ? '+' : t.isTransfer ? '' : '-'}{formatRMB(Math.abs(t.total))}
                        </span>
                      </td>
                      <td>
                        {t.remark}
                        {t.event && (
                          <span className="badge badge-event" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                            {t.event === '2026春假佛罗里达行' ? '🌴 春假' : t.event === '2025美东纽约感恩节出行' ? '🗽 美东' : '🎓 毕业旅行'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {paginatedTransactions.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        未找到符合条件的账目记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="table-footer">
                <span>显示第 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} 条，共 {filteredTransactions.length} 条数据</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className="select-filter" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    style={{ padding: '0.4rem 0.75rem', opacity: currentPage === 1 ? 0.5 : 1 }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span style={{ alignSelf: 'center', padding: '0 0.5rem' }}>页码 {currentPage} / {totalPages}</span>
                  <button 
                    className="select-filter" 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    style={{ padding: '0.4rem 0.75rem', opacity: currentPage === totalPages ? 0.5 : 1 }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recovery Tracker Tab */}
        {activeTab === 'recovery' && (
          <>
            <div className="insight-card travel animated-fade-in" style={{ background: 'linear-gradient(135deg, #ecfdf5, #ecfdf5)', border: '1px solid #a7f3d0' }}>
              <div className="insight-card-header">
                <div className="insight-icon" style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                  <Award />
                </div>
                <h2 className="insight-title" style={{ color: 'var(--success)' }}>TA与奖学金“回血率”分析 (Financial Recovery)</h2>
              </div>
              <div className="insight-body">
                分析在留学期间如何通过自身的努力和消费返现来“抵消”日常的生活费开支：
              </div>
              
              <div className="insight-metric-grid">
                <div className="insight-metric-item">
                  <span className="insight-metric-label">日常总生活费开支</span>
                  <span className="insight-metric-val">{formatRMB(recoveryStats.livingCost)}</span>
                </div>
                <div className="insight-metric-item">
                  <span className="insight-metric-label">TA与奖学金等总收益</span>
                  <span className="insight-metric-val" style={{ color: 'var(--success)' }}>{formatRMB(recoveryStats.taWages + recoveryStats.scholarships + recoveryStats.cashbacks)}</span>
                </div>
                <div className="insight-metric-item">
                  <span className="insight-metric-label">生活费回血率</span>
                  <span className="insight-metric-val" style={{ color: 'var(--primary)', fontSize: '1.5rem' }}>{recoveryStats.recoveryRatio}%</span>
                </div>
              </div>
            </div>

            <div className="visuals-grid">
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><TrendingUp /> 月度收入构成走势 (CNY)</div>
                </div>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={recoveryStats.incomeTrend} stackOffset="sign">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="month" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip formatter={(value: any) => formatRMB(value)} />
                      <Legend />
                      <Bar name="TA工资" dataKey="wages" stackId="a" fill="#3b82f6" />
                      <Bar name="奖学金" dataKey="scholarship" stackId="a" fill="#10b981" />
                      <Bar name="返现/奖励" dataKey="cashback" stackId="a" fill="#fbbf24" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">💰 回血构成</div>
                </div>
                <div className="category-list">
                  <div className="category-item">
                    <span className="category-dot" style={{ backgroundColor: '#3b82f6' }}></span>
                    <div>
                      <span className="category-name">TA 助研工资</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>多次助教与日常兼职流水</span>
                    </div>
                    <span className="category-amount">{formatRMB(recoveryStats.taWages)}</span>
                  </div>
                  <div className="category-item">
                    <span className="category-dot" style={{ backgroundColor: '#10b981' }}></span>
                    <div>
                      <span className="category-name">奖学金总收益</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>包含校一等奖、院二等奖学金</span>
                    </div>
                    <span className="category-amount">{formatRMB(recoveryStats.scholarships)}</span>
                  </div>
                  <div className="category-item">
                    <span className="category-dot" style={{ backgroundColor: '#fbbf24' }}></span>
                    <div>
                      <span className="category-name">信用卡/平台返现</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Discover与Wells Fargo平台回扣</span>
                    </div>
                    <span className="category-amount">{formatRMB(recoveryStats.cashbacks)}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Utilities Tab */}
        {activeTab === 'utilities' && (
          <>
            <div className="insight-card travel animated-fade-in" style={{ background: 'linear-gradient(135deg, #ecfeff, #ecfeff)', border: '1px solid #a5f3fc' }}>
              <div className="insight-card-header">
                <div className="insight-icon" style={{ backgroundColor: 'var(--info-light)', color: 'var(--info)' }}>
                  <Zap />
                </div>
                <h2 className="insight-title" style={{ color: 'var(--info)' }}>能耗温控与通信分析 (Energy & Communications)</h2>
              </div>
              <div className="insight-body">
                分析日常家庭基础开销，尤其是电费账单（AEP）与当地寒冷气候的关联：
              </div>
              
              <div className="insight-metric-grid">
                <div className="insight-metric-item">
                  <span className="insight-metric-label">电费支出总计</span>
                  <span className="insight-metric-val">{formatRMB(utilitiesStats.electricTotal)}</span>
                </div>
                <div className="insight-metric-item">
                  <span className="insight-metric-label">网费支出总计</span>
                  <span className="insight-metric-val">{formatRMB(utilitiesStats.internetTotal)}</span>
                </div>
                <div className="insight-metric-item">
                  <span className="insight-metric-label">手机话费总计</span>
                  <span className="insight-metric-val">{formatRMB(utilitiesStats.phoneTotal)}</span>
                </div>
              </div>
            </div>

            <div className="visuals-grid">
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><TrendingUp /> 能耗与话费月度走势 (CNY)</div>
                </div>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <LineChart data={utilitiesStats.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="month" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip formatter={(value: any) => formatRMB(value)} />
                      <Legend />
                      <Line name="电费账单 (AEP)" type="monotone" dataKey="electric" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} />
                      <Line name="网费 (Network)" type="monotone" dataKey="internet" stroke="#3b82f6" strokeWidth={2} />
                      <Line name="手机话费" type="monotone" dataKey="phone" stroke="#ec4899" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">❄️ 气候发现</div>
                </div>
                <div style={{ fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', color: 'var(--text-secondary)' }}>
                  <p>
                    ❄️ <strong>冬季取暖激增：</strong> 电费（AEP）在 <strong>12月至次年3月</strong> 期间有着极其客观的爬升，代表黑堡高寒冬季的电暖消耗。
                  </p>
                  <p>
                    🔌 <strong>春季平缓下滑：</strong> 随着 4 月和 5 月天气回暖，电费迅速滑落至低谷。
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Settlement Tab */}
        {activeTab === 'settlement' && (
          <>
            <div className="insight-card travel animated-fade-in" style={{ background: 'linear-gradient(135deg, #fffbeb, #fffbeb)', border: '1px solid #fde68a' }}>
              <div className="insight-card-header">
                <div className="insight-icon" style={{ backgroundColor: 'var(--warning-light)', color: 'var(--warning)' }}>
                  <Home />
                </div>
                <h2 className="insight-title" style={{ color: '#b45309' }}>新居安家与学业配置成本 (Setup & Academic Cost)</h2>
              </div>
              <div className="insight-body">
                展现初来乍到时，在购买新家家具、生活电器以及应对学校的行政管理/教材包方面的总投入：
              </div>
              
              <div className="insight-metric-grid">
                <div className="insight-metric-item">
                  <span className="insight-metric-label">安家安居物资总支出</span>
                  <span className="insight-metric-val" style={{ color: 'var(--primary)' }}>{formatRMB(setupStats.setupTotal)}</span>
                </div>
                <div className="insight-metric-item" style={{ gridColumn: 'span 2' }}>
                  <span className="insight-metric-label">学杂资料配置总支出 (除学费)</span>
                  <span className="insight-metric-val" style={{ color: 'var(--info)' }}>{formatRMB(setupStats.academicTotal)}</span>
                </div>
              </div>
            </div>

            <div className="visuals-grid">
              <div className="card">
                <div className="card-header">
                  <div className="card-title">🛏️ 新居物资购买明细</div>
                </div>
                <div className="table-container" style={{ maxHeight: '300px' }}>
                  <table className="trans-table">
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>物品备注</th>
                        <th>金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {setupStats.setupItems.map(t => (
                        <tr key={t.id}>
                          <td>{t.date}</td>
                          <td>{t.remark}</td>
                          <td style={{ fontWeight: 600 }}>{formatRMB(t.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">📚 学费之外的学杂资料包</div>
                </div>
                <div className="table-container" style={{ maxHeight: '300px' }}>
                  <table className="trans-table">
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>行政/资料包备注</th>
                        <th>金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {setupStats.academicItems.map(t => (
                        <tr key={t.id}>
                          <td>{t.date}</td>
                          <td>{t.remark}</td>
                          <td style={{ fontWeight: 600 }}>{formatRMB(t.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {/* McDonald's index */}
        {activeTab === 'mcdonalds' && (
          <>
            <div className="insight-card mcd animated-fade-in">
              <div className="insight-card-header">
                <div className="insight-icon" style={{ backgroundColor: '#fcd34d', color: '#b45309' }}>
                  <Coffee />
                </div>
                <h2 className="insight-title" style={{ color: '#b45309' }}>麦当劳挚爱指数 (McDonald's Index)</h2>
              </div>
              <div className="insight-body">
                展现账本中记录的麦当劳趣味统计：
              </div>
              
              <div className="insight-metric-grid">
                <div className="insight-metric-item">
                  <span className="insight-metric-label">光顾次数</span>
                  <span className="insight-metric-val" style={{ color: '#b45309' }}>{mcdStats.count} 次</span>
                </div>
                <div className="insight-metric-item">
                  <span className="insight-metric-label">消费总额</span>
                  <span className="insight-metric-val" style={{ color: '#b45309' }}>{formatUSD(mcdStats.totalUSD)}</span>
                </div>
                <div className="insight-metric-item">
                  <span className="insight-metric-label">次均单价</span>
                  <span className="insight-metric-val" style={{ color: '#b45309' }}>{formatRMB(mcdStats.avgRMB)}</span>
                </div>
              </div>
            </div>

            <div className="visuals-grid">
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <TrendingUp /> 麦当劳月度消费频次
                  </div>
                </div>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={mcdStats.monthlyFrequency}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="month" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip />
                      <Bar name="消费次数" dataKey="count" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">🍔 趣味发现</div>
                </div>
                <div style={{ fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', color: 'var(--text-secondary)' }}>
                  <p>
                    🍔 <strong>最便宜的一单：</strong> 消费了 <strong>$1.66</strong>。
                  </p>
                  <p>
                    📅 <strong>全美芝士汉堡日：</strong> 2025.09.18 专程打卡了麦当劳特惠，花费了 <strong>$2.99</strong>。
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Grocery battles */}
        {activeTab === 'groceries' && (
          <>
            <div className="insight-card groceries animated-fade-in">
              <div className="insight-card-header">
                <div className="insight-icon" style={{ backgroundColor: '#a7f3d0', color: '#047857' }}>
                  <ShoppingBag />
                </div>
                <h2 className="insight-title" style={{ color: '#047857' }}>超市采购大战 (Groceries Battle)</h2>
              </div>
              <div className="insight-body">
                采购食材自己做饭是节省开销的重要手段。账单中经常光顾的各大超市消费分布如下：
              </div>
            </div>

            <div className="visuals-grid">
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <TrendingUp /> 各超市消费占比
                  </div>
                </div>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={groceryStats} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" stroke="#94a3b8" />
                      <YAxis dataKey="name" type="category" stroke="#94a3b8" width={120} />
                      <Tooltip />
                      <Bar name="消费总额 (¥)" dataKey="amount" fill="#34d399" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">🛒 消费频率对比</div>
                </div>
                <div className="category-list">
                  {groceryStats.map((store, idx) => (
                    <div className="category-item" key={idx}>
                      <span className="category-dot" style={{ backgroundColor: idx === 0 ? '#10b981' : idx === 1 ? '#3b82f6' : '#8b5cf6' }}></span>
                      <div>
                        <span className="category-name">{store.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>打卡 {store.count} 次</span>
                      </div>
                      <span className="category-amount">{formatRMB(store.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Travel epics */}
        {activeTab === 'travel' && (
          <>
            <div className="insight-card travel animated-fade-in">
              <div className="insight-card-header">
                <div className="insight-icon" style={{ backgroundColor: '#ddd6fe', color: '#6d28d9' }}>
                  <Plane />
                </div>
                <h2 className="insight-title" style={{ color: '#6d28d9' }}>旅行专题对账 (Travel Insights)</h2>
              </div>
              <div className="insight-body">
                多次旅行支出的垫付总额、同伴回款和个人真实自付净开支明细：
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {travelStats.map((t, idx) => (
                <div className="card" key={idx}>
                  <div className="card-header">
                    <div>
                      <h3 className="card-title">{t.label}</h3>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>出行日期: {t.dates} | 关联交易: {t.transCount} 笔</span>
                    </div>
                  </div>
                  <div className="grid-cols-2">
                    <div className="insight-metric-item" style={{ textAlign: 'left', padding: '1rem' }}>
                      <span className="insight-metric-label">垫付总开支 (Gross Cost)</span>
                      <span className="insight-metric-val" style={{ fontSize: '1.5rem', color: 'var(--danger)' }}>{formatRMB(t.grossCost)}</span>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        统一代付订购的酒店、门票、机票总和
                      </p>
                    </div>
                    <div className="insight-metric-item" style={{ textAlign: 'left', padding: '1rem' }}>
                      <span className="insight-metric-label">同伴回款/均摊 (Split Recieved)</span>
                      <span className="insight-metric-val" style={{ fontSize: '1.5rem', color: 'var(--info)' }}>{formatRMB(t.reimbursement)}</span>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        同伴汇入的AA款及退票款等
                      </p>
                    </div>
                    <div className="insight-metric-item" style={{ textAlign: 'left', padding: '1rem', gridColumn: 'span 2' }}>
                      <span className="insight-metric-label">您的真实自付净额 (Real Net Cost)</span>
                      <span className="insight-metric-val" style={{ fontSize: '1.75rem', color: 'var(--primary)' }}>{formatRMB(t.netCost)}</span>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        扣除回款后，您个人在此次出行中的实际支出
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
