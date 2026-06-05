import { useState, useMemo } from 'react';
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
  Award
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
  Cell
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

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'mcdonalds' | 'groceries' | 'travel'>('dashboard');
  const [excludeMajors, setExcludeMajors] = useState(true); // Default true to show everyday costs clearly, or false. Let's default true so the user is wowed by clean scale!
  const [accountingMode, setAccountingMode] = useState<'cash' | 'accrual'>('accrual');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [eventFilter, setEventFilter] = useState('all');
  const [sortField, setSortField] = useState<'date' | 'total'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const rawTransactions = costData.transactions as Transaction[];

  // Data processing and calculations
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
        return; // Exclude raw fund transfers from direct expense and income
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

    const transferLoss = Math.max(0, transferOut - transferIn); // 149855 - 149428.44 = 426.56 RMB exchange loss
    
    // Add transfer loss to gross expenses to align with Excel's bottom-line sum
    const adjustedGross = grossExpensesRmb + transferLoss;
    const netExpensesRmb = adjustedGross - totalReimbursementRmb;
    const selfFundedNetCostRmb = netExpensesRmb - totalIncomeRmb;

    return {
      grossExpensesRmb: adjustedGross,
      totalIncomeRmb,
      totalReimbursementRmb,
      netExpensesRmb,
      selfFundedNetCostRmb,
      totalTuitionRmb,
      transferLoss
    };
  }, [rawTransactions]);

  // McDonald's Specific Metrics
  const mcdStats = useMemo(() => {
    const mcdTrans = rawTransactions.filter(t => t.remark.includes('麦当劳'));
    const count = mcdTrans.length;
    const totalUSD = mcdTrans.reduce((sum, t) => sum + Math.abs(t.usd), 0);
    const totalRMB = mcdTrans.reduce((sum, t) => sum + Math.abs(t.total), 0);
    const avgRMB = count > 0 ? totalRMB / count : 0;
    
    // Sort McDonald's transactions by date
    const monthlyFrequency: Record<string, number> = {};
    mcdTrans.forEach(t => {
      const month = t.date.substring(0, 7); // YYYY/MM
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
      monthlyFrequency: Object.entries(monthlyFrequency).map(([month, freq]) => ({ month, count: freq }))
    };
  }, [rawTransactions]);

  // Grocery stores metrics (Kroger vs Weee vs Oasis vs Walmart)
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
    if (loss > 0) {
      aggregates['杂项支出'] = (aggregates['杂项支出'] || 0) + loss;
    }

    return Object.entries(aggregates)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [rawTransactions, excludeMajors]);

  // Helper to determine target month based on accounting mode (Cash vs Accrual)
  const getTargetMonth = (t: Transaction, mode: 'cash' | 'accrual'): string => {
    const normDate = t.date.replace(/\//g, '-');
    if (mode === 'cash') {
      return normDate.substring(0, 7); // YYYY-MM
    }
    
    // Accrual mode: look for target month in remark for rent, utilities, internet
    if (t.category === '居住开销') {
      const match = t.remark.match(/(\d+)-(\d+)月|(\d+)月/);
      if (match) {
        const targetMonthNum = parseInt(match[1] || match[3]);
        const txDateParts = normDate.split('-');
        const txYear = parseInt(txDateParts[0]);
        const txMonth = parseInt(txDateParts[1]);
        
        let targetYear = txYear;
        // Handle year boundaries (e.g. paying Dec rent in Jan, or Jan rent in Dec)
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

  // Monthly trends for area chart
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

  // Filtering and Sorting Transactions Table
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

    // Sorting
    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      // Clean check for dates
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

  // Paginated data
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

  const formatRMB = (val: number) => {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(val);
  };

  const formatUSD = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(val);
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <TrendingUp size={22} />
          </div>
          <span className="brand-name">CostAnalytics</span>
        </div>
        
        <ul className="nav-list">
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
      </aside>

      {/* Main Panel */}
      <main className="main-content animated-fade-in">
        {/* Header */}
        <div className="dashboard-header">
          <div className="header-title">
            <h1>留学开销与收入数据挖掘</h1>
            <p>基于 2025.05 - 2026.05 期间留学账本的多维度统计与分析</p>
          </div>
          <div className="badge badge-event" style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}>
            数据量：{rawTransactions.length} 笔记录
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

            {/* Stat row */}
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-title">原始总开支 (Gross)</span>
                  <div className="stat-icon" style={{ backgroundColor: 'var(--danger-light)', color: 'var(--danger)' }}>
                    <ArrowUpRight size={20} />
                  </div>
                </div>
                <div className="stat-value">{formatRMB(stats.grossExpensesRmb)}</div>
                <div className="stat-desc">包含他人机票、酒店和餐费的合并垫付</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-title">他人均摊回款与退款</span>
                  <div className="stat-icon" style={{ backgroundColor: 'var(--info-light)', color: 'var(--info)' }}>
                    <ArrowDownLeft size={20} />
                  </div>
                </div>
                <div className="stat-value" style={{ color: 'var(--info)' }}>{formatRMB(stats.totalReimbursementRmb)}</div>
                <div className="stat-desc">剔除回赠、均摊和多余垫付干扰</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-title">留学个人净支出 (Net)</span>
                  <div className="stat-icon" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
                    <TrendingUp size={20} />
                  </div>
                </div>
                <div className="stat-value" style={{ color: 'var(--primary)' }}>{formatRMB(stats.netExpensesRmb)}</div>
                <div className="stat-desc">个人真实生活与学习开销</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-title">总体学费开支</span>
                  <div className="stat-icon" style={{ backgroundColor: 'var(--study-bg)', color: 'var(--study-color)' }}>
                    <Award size={20} />
                  </div>
                </div>
                <div className="stat-value" style={{ color: 'var(--study-color)' }}>{formatRMB(stats.totalTuitionRmb)}</div>
                <div className="stat-desc">25-26学年三学期学费总和</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-title">TA与奖学金总收益</span>
                  <div className="stat-icon" style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                    <Award size={20} />
                  </div>
                </div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>{formatRMB(stats.totalIncomeRmb)}</div>
                <div className="stat-desc">TA助研工资 + 一二等奖学金 + 信用卡返现</div>
              </div>
            </div>

            {/* Visuals Row */}
            <div className="visuals-grid">
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <TrendingUp /> 月度收支走势 & 汇率波动
                  </div>
                  <span className="stat-desc">柱状图代表收支金额 (¥)，折线代表当月平均汇率 ($1兑￥)</span>
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
                    <Layers /> 支出构成分析 (CNY)
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

            {/* Summary Insights */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <Info /> 关键洞察
                </div>
              </div>
              <div style={{ fontSize: '0.95rem', display: 'flex', flexDirection: 'column', gap: '1rem', color: 'var(--text-secondary)' }}>
                <p>
                  🎓 <strong>学业相关支出占比巨大：</strong> 在一整年的账单中，<strong>学费与学杂费</strong>（共计三学期，秋季/冬季/春季）占领了总开支的半壁江山。
                </p>
                <p>
                  💰 <strong>收支对冲模型：</strong> 虽然总开支达到了惊人的 <strong>{formatRMB(stats.grossExpensesRmb)}</strong>，但在回款了均摊资金 <strong>{formatRMB(stats.totalReimbursementRmb)}</strong>，并结合TA（助教）岗位工资与各项奖学金带来的 <strong>{formatRMB(stats.totalIncomeRmb)}</strong> 额外收益后，用户的<strong>真实净自付费用（Self-Funded Cost）</strong>实际为 <span className="highlight-text">{formatRMB(stats.netExpensesRmb - stats.totalIncomeRmb)}</span> 人民币。这对于一整年的留学项目而言是一个非常理想的数据。
                </p>
                <p>
                  📉 <strong>汇率红利：</strong> 汇率从 2025 年 5 月份的 <strong>7.22</strong> 一路震荡下降至 2026 年 5 月的 <strong>6.80</strong>，这使后期结汇学费或美元消费时，人民币的换算损耗大幅度减轻。
                </p>
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
                  <option value="2025美东纽约感恩节出行">2025 美东感恩节纽约行</option>
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
                通过挖掘，我们发现您在美留学的一年内是<strong>麦当劳的超级狂热粉丝</strong>！这是您专属的麦当劳趣味统计：
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
                <div style={{ fontSize: '0.9rem', display: 'flex', flexGrow: 1, flexDirection: 'column', gap: '0.75rem', color: 'var(--text-secondary)' }}>
                  <p>
                    🍔 <strong>最便宜的一单：</strong> 2025.12.24/2026.01.22 仅消费了 <strong>$1.66</strong> (麦当劳点单)。
                  </p>
                  <p>
                    📅 <strong>全美芝士汉堡日：</strong> 2025.09.18 专门打卡了麦当劳的<strong>芝士汉堡节特惠</strong>，花费了 <strong>$2.99</strong>。
                  </p>
                  <p>
                    📈 <strong>消费规律：</strong> 麦当劳大多发生在繁重的上课期间（例如 2026 年 1 月频次高达 6 次），作为快捷能量补给的首选。
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
                在美留学期间，采购食材自己做饭是节省开销的重要手段。您经常光顾的各大超市消费分布如下：
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
                在学期空闲和毕业期间，您组织了多次精彩的旅行。由于旅行费用大多由您<strong>垫付酒店或门票</strong>后统一回款，在此我们帮您计算了每次出行的<strong>总支出、回款金额和真实个人自付开销</strong>：
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
                        包含您为同伴统一订购的酒店、门票等
                      </p>
                    </div>
                    <div className="insight-metric-item" style={{ textAlign: 'left', padding: '1rem' }}>
                      <span className="insight-metric-label">同伴回款/均摊 (Split Recieved)</span>
                      <span className="insight-metric-val" style={{ fontSize: '1.5rem', color: 'var(--info)' }}>{formatRMB(t.reimbursement)}</span>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        同伴均摊汇入的账款与航空公司退款
                      </p>
                    </div>
                    <div className="insight-metric-item" style={{ textAlign: 'left', padding: '1rem', gridColumn: 'span 2' }}>
                      <span className="insight-metric-label">您的真实自付净额 (Real Net Cost)</span>
                      <span className="insight-metric-val" style={{ fontSize: '1.75rem', color: 'var(--primary)' }}>{formatRMB(t.netCost)}</span>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        扣除回款后，本次旅行中您个人的实际机票、餐饮及娱乐支出
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
