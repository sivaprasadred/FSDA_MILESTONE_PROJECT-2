/* ============================================
   EXPENSE ANALYTICS PLATFORM — main.js
   ES6+ with Chart.js
   ============================================ */

'use strict';

// ── STATE ─────────────────────────────────────────────────────────────────
const State = {
  currentPage: 'dashboard',
  month: new Date().getMonth() + 1,
  year:  new Date().getFullYear(),
  data:  {},
  charts: {},
  editingExpense: null,
  categories: [],
};

// ── API LAYER ─────────────────────────────────────────────────────────────
const API_GET  = 'php/get.php';
const API_POST = 'php/post.php';

async function apiGet(action, params = {}) {
  const p = new URLSearchParams({ action, ...params });
  const res = await fetch(`${API_GET}?${p}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(action, body = {}) {
  const res = await fetch(`${API_POST}?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── FORMAT HELPERS ────────────────────────────────────────────────────────
const fmt = {
  currency: (n) => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0
  }).format(n),
  num: (n) => new Intl.NumberFormat('en-IN').format(n),
  date: (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  dateShort: (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
  monthLabel: (m, y) => new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
  pct: (n) => `${n}%`,
};

// ── TOAST ─────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── NAVIGATION ────────────────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('headerTitle').textContent = {
    dashboard:  '📊 Dashboard',
    expenses:   '💳 All Expenses',
    analytics:  '📈 Analytics',
    budget:     '🎯 Budget & Goals',
  }[page] || page;
  State.currentPage = page;
  closeSidebar();
  loadPage(page);
}

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
}
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
}

// ── MONTH NAVIGATION ──────────────────────────────────────────────────────
function prevMonth() {
  State.month--;
  if (State.month < 1) { State.month = 12; State.year--; }
  updateMonthDisplay();
  loadPage(State.currentPage);
}
function nextMonth() {
  const now = new Date();
  if (State.year === now.getFullYear() && State.month === now.getMonth() + 1) return;
  State.month++;
  if (State.month > 12) { State.month = 1; State.year++; }
  updateMonthDisplay();
  loadPage(State.currentPage);
}
function updateMonthDisplay() {
  document.getElementById('monthLabel').textContent = fmt.monthLabel(State.month, State.year);
}

// ── CHART HELPERS ─────────────────────────────────────────────────────────
function destroyChart(key) {
  State.charts[key]?.destroy();
  delete State.charts[key];
}

function chartDefaults() {
  Chart.defaults.color = '#8A9AC7';
  Chart.defaults.font.family = "'DM Sans', sans-serif";
  Chart.defaults.font.size = 12;
}

// ── LOAD PAGE ─────────────────────────────────────────────────────────────
async function loadPage(page) {
  switch (page) {
    case 'dashboard': return loadDashboard();
    case 'expenses':  return loadExpenses();
    case 'analytics': return loadAnalytics();
    case 'budget':    return loadBudget();
  }
}

// ══════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════
async function loadDashboard() {
  const el = id => document.getElementById(id);

  // Show loaders
  el('statIncome').innerHTML = '<div class="spinner"></div>';

  try {
    const d = await apiGet('dashboard', { month: State.month, year: State.year });
    State.data.dashboard = d;

    // ── Stats ────────────────────────────────────
    el('statIncome').innerHTML = `
      <div class="stat-icon">💰</div>
      <div class="stat-value">${fmt.currency(d.income)}</div>
      <div class="stat-label">Total Income</div>
      <span class="stat-badge">+${d.income > 0 ? '+' : ''}${fmt.pct(100)}</span>
    `;
    el('statExpense').innerHTML = `
      <div class="stat-icon">💸</div>
      <div class="stat-value">${fmt.currency(d.expense)}</div>
      <div class="stat-label">Total Expenses</div>
      <span class="stat-badge">${d.budgetUsed}% of budget</span>
    `;
    el('statBalance').innerHTML = `
      <div class="stat-icon">${d.balance >= 0 ? '🏦' : '⚠️'}</div>
      <div class="stat-value">${fmt.currency(Math.abs(d.balance))}</div>
      <div class="stat-label">${d.balance >= 0 ? 'Net Savings' : 'Overspent'}</div>
      <span class="stat-badge">${d.balance >= 0 ? 'Positive' : 'Negative'}</span>
    `;
    el('statSavings').innerHTML = `
      <div class="stat-icon">📊</div>
      <div class="stat-value">${d.savingsRate}%</div>
      <div class="stat-label">Savings Rate</div>
      <span class="stat-badge">${d.savingsRate >= 20 ? '✅ Good' : '⚠️ Low'}</span>
    `;

    // ── Budget Meter ─────────────────────────────
    const budgetPct = d.budgetUsed;
    const cls = budgetPct >= 100 ? 'over' : budgetPct >= 80 ? 'warn' : '';
    el('budgetMeter').innerHTML = `
      <div class="budget-labels">
        <span>Spent: <strong>${fmt.currency(d.expense)}</strong></span>
        <span>Budget: <strong>${fmt.currency(d.budget)}</strong></span>
      </div>
      <div class="budget-bar">
        <div class="budget-fill ${cls}" style="width:${Math.min(budgetPct,100)}%"></div>
      </div>
      <div style="text-align:right;margin-top:6px;font-size:12px;color:var(--text-3)">
        ${budgetPct}% used
      </div>
    `;

    // ── Trend Chart ──────────────────────────────
    destroyChart('trend');
    const tCtx = el('trendChart').getContext('2d');
    const labels = d.trend.map(t => fmt.dateShort(t.day));
    State.charts.trend = new Chart(tCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Expenses',
            data: d.trend.map(t => t.expenses),
            borderColor: '#F4736B',
            backgroundColor: 'rgba(244,115,107,0.08)',
            tension: 0.4, fill: true, pointRadius: 3, borderWidth: 2,
          },
          {
            label: 'Income',
            data: d.trend.map(t => t.income),
            borderColor: '#3DD8BE',
            backgroundColor: 'rgba(61,216,190,0.08)',
            tension: 0.4, fill: true, pointRadius: 3, borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 12, padding: 16 } } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { maxTicksLimit: 8 } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: v => '₹' + fmt.num(v) } },
        },
      },
    });

    // ── Category Breakdown ───────────────────────
    destroyChart('catDough');
    const catEl = el('categoryList');
    if (d.categories.length > 0) {
      const topCats = d.categories.filter(c => c.spent > 0).slice(0, 6);
      catEl.innerHTML = topCats.map(c => `
        <div class="cat-row">
          <span class="cat-icon">${c.icon}</span>
          <div>
            <div class="cat-name">${c.name}</div>
            <div class="cat-sub">${c.cat_budget > 0 ? `Budget: ${fmt.currency(c.cat_budget)}` : 'No budget set'}</div>
          </div>
          <div>
            <div class="cat-amount" style="color:${c.color}">${fmt.currency(c.spent)}</div>
            ${c.cat_budget > 0 ? `<div style="font-size:10px;color:var(--text-3);text-align:right">${Math.round((c.spent/c.cat_budget)*100)}%</div>` : ''}
          </div>
        </div>
      `).join('');

      // Donut chart
      const dCtx = el('donutChart').getContext('2d');
      State.charts.catDough = new Chart(dCtx, {
        type: 'doughnut',
        data: {
          labels: topCats.map(c => c.name),
          datasets: [{
            data: topCats.map(c => c.spent),
            backgroundColor: topCats.map(c => c.color + 'CC'),
            borderColor: topCats.map(c => c.color),
            borderWidth: 2,
            hoverOffset: 8,
          }],
        },
        options: {
          cutout: '68%',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt.currency(ctx.parsed)}` } },
          },
        },
      });
      el('donutTotal').textContent = fmt.currency(d.expense);
    } else {
      catEl.innerHTML = `<div class="empty"><div class="empty-icon">📊</div><div class="empty-text">No expenses this month</div></div>`;
    }

    // ── Recent Transactions ──────────────────────
    el('recentList').innerHTML = d.recent.length
      ? d.recent.map(t => renderTxnRow(t)).join('')
      : `<div class="empty"><div class="empty-icon">💳</div><div class="empty-text">No transactions yet</div></div>`;

    // ── Payment Methods ──────────────────────────
    destroyChart('payChart');
    if (d.paymentMethods.length > 0) {
      const pColors = { cash:'#FBB647', card:'#6B8AFB', upi:'#3DD8BE', netbanking:'#F4736B', other:'#8A9AC7' };
      const pIcons  = { cash:'💵', card:'💳', upi:'📱', netbanking:'🏦', other:'❓' };
      const pCtx = el('payChart').getContext('2d');
      State.charts.payChart = new Chart(pCtx, {
        type: 'doughnut',
        data: {
          labels: d.paymentMethods.map(p => p.payment_method.toUpperCase()),
          datasets: [{
            data: d.paymentMethods.map(p => p.total),
            backgroundColor: d.paymentMethods.map(p => (pColors[p.payment_method] || '#666') + 'BB'),
            borderColor:     d.paymentMethods.map(p =>  pColors[p.payment_method] || '#666'),
            borderWidth: 2,
            hoverOffset: 6,
          }],
        },
        options: {
          cutout: '60%', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
        },
      });

      el('payLegend').innerHTML = d.paymentMethods.map(p => `
        <div class="legend-item">
          <div class="legend-dot" style="background:${pColors[p.payment_method] || '#666'}"></div>
          <span>${pIcons[p.payment_method] || '❓'} ${p.payment_method} &nbsp; <strong>${fmt.currency(p.total)}</strong></span>
        </div>
      `).join('');
    }

    // ── Smart Insights ───────────────────────────
    const insights = [];
    if (d.budgetUsed >= 90) insights.push(`⚠️ You've used <strong>${d.budgetUsed}%</strong> of your monthly budget. Consider reducing discretionary spending.`);
    if (d.savingsRate < 20) insights.push(`📉 Your savings rate is <strong>${d.savingsRate}%</strong>. Financial experts suggest saving at least 20%.`);
    if (d.savingsRate >= 30) insights.push(`🎉 Great work! You're saving <strong>${d.savingsRate}%</strong> of your income this month.`);
    if (d.categories.some(c => c.cat_budget > 0 && c.spent > c.cat_budget)) {
      const over = d.categories.find(c => c.cat_budget > 0 && c.spent > c.cat_budget);
      insights.push(`🔴 You've exceeded your <strong>${over.name}</strong> budget by ${fmt.currency(over.spent - over.cat_budget)}.`);
    }
    el('insightPanel').innerHTML = insights.length
      ? insights.slice(0, 3).map(i => `<div class="insight"><span class="insight-icon">💡</span><div class="insight-text">${i}</div></div>`).join('')
      : `<div class="insight"><span class="insight-icon">✅</span><div class="insight-text">All looking good! Keep tracking your expenses to stay on top of your finances.</div></div>`;

  } catch (e) {
    console.error(e);
    toast('Failed to load dashboard data', 'error');
  }
}

// ══════════════════════════════════════════════════════════════════
// EXPENSES PAGE
// ══════════════════════════════════════════════════════════════════
async function loadExpenses(reset = false) {
  if (reset) { document.getElementById('searchExp').value = ''; }
  const search = document.getElementById('searchExp')?.value ?? '';
  const type   = document.getElementById('filterType')?.value ?? '';
  const catId  = document.getElementById('filterCat')?.value ?? '';

  document.getElementById('expenseTableBody').innerHTML = '<tr><td colspan="7"><div class="loading"><div class="spinner"></div></div></td></tr>';

  try {
    const params = { month: State.month, year: State.year };
    if (type)  params.type = type;
    if (catId) params.category = catId;
    const data = await apiGet('expenses', params);
    State.data.expenses = data;

    // Filter by search
    let filtered = data;
    if (search) {
      const q = search.toLowerCase();
      filtered = data.filter(e => e.title.toLowerCase().includes(q) || (e.category && e.category.toLowerCase().includes(q)));
    }

    const tbody = document.getElementById('expenseTableBody');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">💳</div><div class="empty-text">No transactions found</div></div></td></tr>`;
      return;
    }
    tbody.innerHTML = filtered.map(t => `
      <tr>
        <td>${fmt.date(t.date)}</td>
        <td>
          <div style="font-weight:500">${t.title}</div>
          ${t.notes ? `<div style="font-size:11px;color:var(--text-3)">${t.notes}</div>` : ''}
        </td>
        <td>${t.icon ? `${t.icon} ` : ''}${t.category || '—'}</td>
        <td><span style="color:${t.type === 'income' ? 'var(--accent)' : 'var(--danger)'}; font-weight:700">
          ${t.type === 'income' ? '+' : '-'}${fmt.currency(t.amount)}
        </span></td>
        <td><span class="pay-badge">${payIcon(t.payment_method)} ${t.payment_method}</span></td>
        <td><span style="font-size:12px;padding:3px 8px;border-radius:4px;background:${t.type==='income'?'rgba(61,216,190,0.1)':'rgba(244,115,107,0.1)'};color:${t.type==='income'?'var(--accent)':'var(--danger)'}">
          ${t.type}
        </span></td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-secondary" onclick="editExpense(${t.id})">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="deleteExpense(${t.id})">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error(e);
    toast('Failed to load expenses', 'error');
  }
}

function payIcon(m) {
  return { cash:'💵', card:'💳', upi:'📱', netbanking:'🏦', other:'❓' }[m] || '';
}

function renderTxnRow(t) {
  return `
    <div class="txn-row" onclick="navigate('expenses')">
      <div class="txn-icon" style="background:${(t.color || '#6366f1') + '22'}">${t.icon || '💳'}</div>
      <div class="txn-info">
        <div class="txn-title">${t.title}</div>
        <div class="txn-meta">
          ${fmt.dateShort(t.date)} &nbsp;·&nbsp; 
          ${t.category || 'Uncategorized'} &nbsp;·&nbsp;
          <span class="pay-badge">${payIcon(t.payment_method)} ${t.payment_method}</span>
        </div>
      </div>
      <div class="txn-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmt.currency(t.amount)}</div>
    </div>
  `;
}

// ── EXPENSE CRUD ──────────────────────────────────────────────────
function openAddModal(type = 'expense') {
  State.editingExpense = null;
  document.getElementById('modalTitle').textContent = 'Add Transaction';
  resetExpenseForm();
  setExpenseType(type);
  openModal('expenseModal');
}

async function editExpense(id) {
  const exp = (State.data.expenses || State.data.dashboard?.recent || []).find(e => e.id == id)
    || State.data.dashboard?.recent?.find(e => e.id == id);

  if (!exp) {
    try {
      const all = await apiGet('expenses');
      const found = all.find(e => e.id == id);
      if (!found) return toast('Expense not found', 'error');
      populateEditModal(found);
    } catch { return toast('Error loading expense', 'error'); }
  } else {
    populateEditModal(exp);
  }
}

function populateEditModal(exp) {
  State.editingExpense = exp;
  document.getElementById('modalTitle').textContent = 'Edit Transaction';
  document.getElementById('expTitle').value  = exp.title;
  document.getElementById('expAmount').value = exp.amount;
  document.getElementById('expDate').value   = exp.date;
  document.getElementById('expNotes').value  = exp.notes || '';
  document.getElementById('expPayment').value = exp.payment_method || 'cash';
  document.getElementById('expCategory').value = exp.category_id || '';
  setExpenseType(exp.type);
  openModal('expenseModal');
}

function resetExpenseForm() {
  document.getElementById('expTitle').value  = '';
  document.getElementById('expAmount').value = '';
  document.getElementById('expDate').value   = new Date().toISOString().split('T')[0];
  document.getElementById('expNotes').value  = '';
  document.getElementById('expPayment').value = 'card';
  document.getElementById('expCategory').value = '';
}

function setExpenseType(type) {
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.type-btn[data-type="${type}"]`)?.classList.add('active');
  document.getElementById('expType').value = type;
}

async function saveExpense() {
  const payload = {
    title:          document.getElementById('expTitle').value.trim(),
    amount:         parseFloat(document.getElementById('expAmount').value),
    type:           document.getElementById('expType').value,
    date:           document.getElementById('expDate').value,
    notes:          document.getElementById('expNotes').value.trim(),
    payment_method: document.getElementById('expPayment').value,
    category_id:    document.getElementById('expCategory').value || null,
  };

  if (!payload.title || !payload.amount || !payload.date) {
    return toast('Please fill in all required fields', 'error');
  }

  try {
    if (State.editingExpense) {
      payload.id = State.editingExpense.id;
      await apiPost('update_expense', payload);
      toast('Transaction updated!');
    } else {
      await apiPost('add_expense', payload);
      toast('Transaction added!');
    }
    closeModal('expenseModal');
    loadPage(State.currentPage);
  } catch (e) {
    toast('Failed to save transaction', 'error');
  }
}

async function deleteExpense(id) {
  if (!confirm('Delete this transaction?')) return;
  try {
    await apiPost('delete_expense', { id });
    toast('Deleted successfully');
    loadPage(State.currentPage);
  } catch {
    toast('Failed to delete', 'error');
  }
}

// ══════════════════════════════════════════════════════════════════
// ANALYTICS PAGE
// ══════════════════════════════════════════════════════════════════
async function loadAnalytics() {
  try {
    const d = await apiGet('analytics');
    State.data.analytics = d;

    // Monthly bar chart
    destroyChart('monthly');
    const mCtx = document.getElementById('monthlyChart')?.getContext('2d');
    if (mCtx && d.monthly.length > 0) {
      State.charts.monthly = new Chart(mCtx, {
        type: 'bar',
        data: {
          labels: d.monthly.map(m => m.label),
          datasets: [
            {
              label: 'Income',
              data: d.monthly.map(m => m.income),
              backgroundColor: 'rgba(61,216,190,0.7)',
              borderRadius: 6, borderSkipped: false,
            },
            {
              label: 'Expenses',
              data: d.monthly.map(m => m.expenses),
              backgroundColor: 'rgba(244,115,107,0.7)',
              borderRadius: 6, borderSkipped: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: v => '₹' + fmt.num(v) } },
          },
        },
      });
    }

    // Top categories horizontal bar
    destroyChart('topCat');
    const tcCtx = document.getElementById('topCatChart')?.getContext('2d');
    if (tcCtx && d.topCategories.length > 0) {
      State.charts.topCat = new Chart(tcCtx, {
        type: 'bar',
        data: {
          labels: d.topCategories.map(c => `${c.icon} ${c.name}`),
          datasets: [{
            label: 'Total Spent',
            data: d.topCategories.map(c => c.total),
            backgroundColor: d.topCategories.map(c => c.color + 'BB'),
            borderColor:     d.topCategories.map(c => c.color),
            borderWidth: 1,
            borderRadius: 6,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: v => '₹' + fmt.num(v) } },
            y: { grid: { display: false } },
          },
        },
      });
    }

    // KPI bar
    const totalIncome  = d.monthly.reduce((a, m) => a + parseFloat(m.income), 0);
    const totalExpense = d.monthly.reduce((a, m) => a + parseFloat(m.expenses), 0);
    const avgMonth     = d.monthly.length > 0 ? totalExpense / d.monthly.length : 0;
    document.getElementById('anaKpis').innerHTML = `
      <div class="kpi-item"><div class="kpi-value" style="color:var(--accent)">${fmt.currency(totalIncome)}</div><div class="kpi-label">6-Month Income</div></div>
      <div class="kpi-item"><div class="kpi-value" style="color:var(--danger)">${fmt.currency(totalExpense)}</div><div class="kpi-label">6-Month Expenses</div></div>
      <div class="kpi-item"><div class="kpi-value" style="color:var(--accent2)">${fmt.currency(totalIncome - totalExpense)}</div><div class="kpi-label">Net Saved</div></div>
      <div class="kpi-item"><div class="kpi-value" style="color:var(--warn)">${fmt.currency(avgMonth)}</div><div class="kpi-label">Avg Monthly Spend</div></div>
    `;

  } catch (e) {
    console.error(e);
    toast('Failed to load analytics', 'error');
  }
}

// ══════════════════════════════════════════════════════════════════
// BUDGET & GOALS PAGE
// ══════════════════════════════════════════════════════════════════
async function loadBudget() {
  try {
    const [goals, cats, dash] = await Promise.all([
      apiGet('savings'),
      apiGet('categories'),
      apiGet('dashboard', { month: State.month, year: State.year }),
    ]);
    State.data.goals = goals;
    State.categories = cats;
    State.data.budgetDash = dash;

    // ── Savings Goals ────────────────────────────
    document.getElementById('goalsList').innerHTML = goals.length
      ? goals.map(g => {
          const pct = Math.min(Math.round((g.saved_amount / g.target_amount) * 100), 100);
          const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline) - new Date()) / 86400000) : null;
          return `
            <div class="goal-card">
              <div class="goal-header">
                <span class="goal-icon">${g.icon}</span>
                <div>
                  <div class="goal-title">${g.title}</div>
                  <div class="goal-deadline">${daysLeft !== null ? `${daysLeft > 0 ? daysLeft + ' days left' : 'Deadline passed'}` : 'No deadline'}</div>
                </div>
                <div class="goal-pct" style="margin-left:auto">${pct}%</div>
              </div>
              <div class="goal-amounts">
                <span>Saved: <strong>${fmt.currency(g.saved_amount)}</strong></span>
                <span>Target: <strong>${fmt.currency(g.target_amount)}</strong></span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--accent2))"></div>
              </div>
              <div style="display:flex;gap:8px;margin-top:12px">
                <button class="btn btn-sm btn-secondary" onclick="addToGoal(${g.id}, ${g.saved_amount}, ${g.target_amount})">+ Add</button>
              </div>
            </div>
          `;
        }).join('')
      : `<div class="empty"><div class="empty-icon">🎯</div><div class="empty-text">No savings goals yet. Add one!</div></div>`;

    // ── Category Budgets ─────────────────────────
    const catBudgets = cats.map(c => {
      const spent = dash.categories.find(dc => dc.name === c.name)?.spent || 0;
      const pct = c.budget > 0 ? Math.min(Math.round((spent / c.budget) * 100), 100) : 0;
      const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';
      return `
        <div class="cat-row" style="grid-template-columns:30px 1fr 1fr">
          <span class="cat-icon">${c.icon}</span>
          <div>
            <div class="cat-name">${c.name}</div>
            <div class="cat-sub">${c.budget > 0 ? `Budget: ${fmt.currency(c.budget)}` : 'No budget'}</div>
          </div>
          <div style="text-align:right">
            <div class="cat-amount" style="color:${c.color}">${fmt.currency(spent)}</div>
            ${c.budget > 0 ? `
              <div class="progress-bar" style="width:120px;margin-left:auto;margin-top:4px">
                <div class="progress-fill ${cls}" style="width:${pct}%;background:${cls==='over'?'var(--danger)':cls==='warn'?'var(--warn)':c.color}"></div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('catBudgetList').innerHTML = catBudgets || '<div class="empty"><div class="empty-icon">📦</div><div class="empty-text">No categories yet</div></div>';

    // Set current budget value
    document.getElementById('budgetInput').value = dash.budget || '';

  } catch (e) {
    console.error(e);
    toast('Failed to load budget page', 'error');
  }
}

async function saveBudget() {
  const amount = parseFloat(document.getElementById('budgetInput').value);
  if (!amount || amount <= 0) return toast('Enter a valid budget amount', 'error');
  try {
    await apiPost('update_budget', { month: State.month, year: State.year, total_budget: amount });
    toast('Budget updated!');
    loadBudget();
  } catch { toast('Failed to save budget', 'error'); }
}

async function addToGoal(id, current, target) {
  const amount = parseFloat(prompt(`Add amount to savings goal:\nCurrently saved: ${fmt.currency(current)}\nTarget: ${fmt.currency(target)}`));
  if (!amount || amount <= 0) return;
  try {
    await apiPost('update_goal', { id, saved_amount: Math.min(current + amount, target) });
    toast('Goal updated!');
    loadBudget();
  } catch { toast('Failed to update goal', 'error'); }
}

function openAddGoalModal() {
  document.getElementById('goalTitle').value  = '';
  document.getElementById('goalTarget').value = '';
  document.getElementById('goalDeadline').value = '';
  document.getElementById('goalIcon').value   = '🎯';
  openModal('goalModal');
}

async function saveGoal() {
  const payload = {
    title:         document.getElementById('goalTitle').value.trim(),
    target_amount: parseFloat(document.getElementById('goalTarget').value),
    deadline:      document.getElementById('goalDeadline').value || null,
    icon:          document.getElementById('goalIcon').value || '🎯',
  };
  if (!payload.title || !payload.target_amount) return toast('Fill in all fields', 'error');
  try {
    await apiPost('add_goal', payload);
    toast('Savings goal added!');
    closeModal('goalModal');
    loadBudget();
  } catch { toast('Failed to add goal', 'error'); }
}

// ── MODAL HELPERS ─────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── CATEGORY SELECT POPULATION ────────────────────────────────────
async function populateCategorySelect() {
  try {
    const cats = await apiGet('categories');
    State.categories = cats;
    ['expCategory', 'filterCat'].forEach(selId => {
      const sel = document.getElementById(selId);
      if (!sel) return;
      const opts = cats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
      if (selId === 'filterCat') {
        sel.innerHTML = `<option value="">All Categories</option>${opts}`;
      } else {
        sel.innerHTML = `<option value="">No Category</option>${opts}`;
      }
    });
  } catch (e) { console.error('Categories load failed:', e); }
}

// ── INIT ──────────────────────────────────────────────────────────
async function init() {
  chartDefaults();
  updateMonthDisplay();

  // Nav clicks
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.page));
  });

  // Type toggle
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => setExpenseType(btn.dataset.type));
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target === el) el.classList.remove('open');
    });
  });

  // Search
  document.getElementById('searchExp')?.addEventListener('input', () => loadExpenses());
  document.getElementById('filterType')?.addEventListener('change', () => loadExpenses());
  document.getElementById('filterCat')?.addEventListener('change', () => loadExpenses());

  await populateCategorySelect();
  navigate('dashboard');
}

document.addEventListener('DOMContentLoaded', init);
