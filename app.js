/**
 * 全能私人借贷计算器 - 核心逻辑
 * 纯前端，数据存储于 localStorage
 */

// ===== 数据管理 =====
const STORAGE_KEY = 'loan_calculator_data';

function getData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { loans: [] };
  } catch (e) {
    return { loans: [] };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

// ===== 工具函数 =====
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function daysBetween(d1, d2) {
  return Math.round((new Date(d2) - new Date(d1)) / 86400000);
}

// ===== 计算引擎 =====

function calcInterest(principal, annualRate, days, isCompound) {
  const dailyRate = annualRate / 365;
  let interest, formula;
  if (days <= 0) return { interest: 0, formula: '天数为0，无利息' };
  
  if (isCompound) {
    interest = principal * (Math.pow(1 + dailyRate, days) - 1);
    formula = principal.toFixed(2) + ' × (1 + ' + annualRate.toFixed(4) + '/365)^' + days + ' - ' + principal.toFixed(2) + ' = ' + interest.toFixed(2);
  } else {
    interest = principal * dailyRate * days;
    formula = principal.toFixed(2) + ' × ' + annualRate.toFixed(4) + '/365 × ' + days + ' = ' + interest.toFixed(2);
  }
  return { interest: Math.round(interest * 100) / 100, formula: formula };
}

function calcLoanStatus(loan, asOfDate) {
  if (!asOfDate) asOfDate = new Date().toISOString().split('T')[0];
  
  const payments = (loan.payments || []).filter(function(p) { return !p.deleted; });
  payments.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
  
  var remainingPrincipal = loan.principal;
  var totalInterestPaid = 0;
  var totalPrincipalPaid = 0;
  var lastDate = loan.startDate;
  var details = [];
  
  for (var i = 0; i < payments.length; i++) {
    var payment = payments[i];
    var days = daysBetween(lastDate, payment.date);
    if (days < 0) days = 0;
    
    var rate = loan.annualRate;
    var isOverdue = false;
    if (loan.dueDate && payment.date > loan.dueDate) {
      rate = loan.penaltyRate || loan.annualRate;
      isOverdue = true;
    }
    
    var result = calcInterest(remainingPrincipal, rate, days, loan.isCompound);
    var interest = result.interest;
    var formula = result.formula;
    
    var interestPortion = 0;
    var principalPortion = 0;
    
    switch (payment.mode) {
      case 'auto':
        interestPortion = Math.min(payment.amount, interest);
        principalPortion = Math.max(0, payment.amount - interest);
        break;
      case 'interest_only':
        interestPortion = payment.amount;
        principalPortion = 0;
        break;
      case 'principal_only':
        interestPortion = 0;
        principalPortion = payment.amount;
        break;
      case 'manual':
        interestPortion = payment.interestPart || 0;
        principalPortion = payment.principalPart || 0;
        break;
      default:
        interestPortion = Math.min(payment.amount, interest);
        principalPortion = Math.max(0, payment.amount - interest);
    }
    
    principalPortion = Math.min(principalPortion, remainingPrincipal);
    remainingPrincipal -= principalPortion;
    totalInterestPaid += interestPortion;
    totalPrincipalPaid += principalPortion;
    
    details.push({
      id: payment.id, date: payment.date, days: days,
      accruedInterest: interest, formula: formula,
      amount: payment.amount, interestPortion: interestPortion,
      principalPortion: principalPortion, remainingPrincipal: remainingPrincipal,
      mode: payment.mode, isOverdue: isOverdue, rate: rate, note: payment.note || ''
    });
    
    lastDate = payment.date;
  }
  
  var daysToNow = daysBetween(lastDate, asOfDate);
  if (daysToNow < 0) daysToNow = 0;
  var currentRate = loan.annualRate;
  var currentOverdue = false;
  if (loan.dueDate && asOfDate > loan.dueDate) {
    currentRate = loan.penaltyRate || loan.annualRate;
    currentOverdue = true;
  }
  var currentInterest = calcInterest(remainingPrincipal, currentRate, daysToNow, loan.isCompound);
  
  return {
    remainingPrincipal: remainingPrincipal,
    totalInterestPaid: totalInterestPaid,
    totalPrincipalPaid: totalPrincipalPaid,
    accruedInterest: currentInterest.interest,
    accruedFormula: currentInterest.formula,
    totalOwed: remainingPrincipal + currentInterest.interest,
    details: details,
    daysToNow: daysToNow,
    currentRate: currentRate,
    currentOverdue: currentOverdue,
    isSettled: remainingPrincipal <= 0.005
  };
}

function generateSchedule(loan) {
  if (!loan.repaymentType || loan.repaymentType === 'custom') return null;
  var schedule = [];
  var months = loan.termMonths || 12;
  var monthlyRate = loan.annualRate / 12;
  var remaining = loan.principal;
  
  if (loan.repaymentType === 'equal_payment') {
    var factor = Math.pow(1 + monthlyRate, months);
    var monthly = monthlyRate === 0 ? loan.principal / months : loan.principal * monthlyRate * factor / (factor - 1);
    for (var i = 1; i <= months; i++) {
      var interest = remaining * monthlyRate;
      var principal = monthly - interest;
      remaining -= principal;
      schedule.push({ month: i, payment: Math.round(monthly*100)/100, principal: Math.round(principal*100)/100, interest: Math.round(interest*100)/100, remaining: Math.max(0, Math.round(remaining*100)/100) });
    }
  } else if (loan.repaymentType === 'equal_principal') {
    var mp = loan.principal / months;
    for (var i = 1; i <= months; i++) {
      var interest = remaining * monthlyRate;
      remaining -= mp;
      schedule.push({ month: i, payment: Math.round((mp+interest)*100)/100, principal: Math.round(mp*100)/100, interest: Math.round(interest*100)/100, remaining: Math.max(0, Math.round(remaining*100)/100) });
    }
  } else if (loan.repaymentType === 'interest_first') {
    for (var i = 1; i <= months; i++) {
      var interest = loan.principal * monthlyRate;
      if (i < months) {
        schedule.push({ month: i, payment: Math.round(interest*100)/100, principal: 0, interest: Math.round(interest*100)/100, remaining: loan.principal });
      } else {
        schedule.push({ month: i, payment: Math.round((loan.principal+interest)*100)/100, principal: loan.principal, interest: Math.round(interest*100)/100, remaining: 0 });
      }
    }
  } else if (loan.repaymentType === 'principal_first') {
    var mp = loan.principal / months;
    for (var i = 1; i <= months; i++) {
      var interest = remaining * monthlyRate;
      remaining -= mp;
      schedule.push({ month: i, payment: Math.round((mp+interest)*100)/100, principal: Math.round(mp*100)/100, interest: Math.round(interest*100)/100, remaining: Math.max(0, Math.round(remaining*100)/100) });
    }
  } else if (loan.repaymentType === 'lump_sum') {
    var totalInt = calcInterest(loan.principal, loan.annualRate, months * 30, loan.isCompound).interest;
    schedule.push({ month: months, payment: Math.round((loan.principal+totalInt)*100)/100, principal: loan.principal, interest: Math.round(totalInt*100)/100, remaining: 0 });
  }
  
  return schedule.length > 0 ? schedule : null;
}

// ===== 页面渲染 =====
var currentPage = 'home';
var currentLoanId = null;

function showPage(page, loanId) {
  currentPage = page;
  currentLoanId = loanId || null;
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById('page-' + page).classList.add('active');
  if (page === 'home') renderHome();
  else if (page === 'detail') renderDetail(loanId);
}

function renderHome() {
  var data = getData();
  var container = document.getElementById('home-content');
  
  if (!data.loans || data.loans.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>还没有借款记录</p><button class="btn btn-primary" onclick="showAddLoanModal()">+ 新增借款</button></div>';
    return;
  }
  
  var groups = {};
  data.loans.forEach(function(loan) {
    var name = loan.borrower || '未分组';
    if (!groups[name]) groups[name] = [];
    groups[name].push(loan);
  });
  
  var html = '';
  for (var borrower in groups) {
    html += '<div class="borrower-group"><div class="borrower-name">👤 ' + escHtml(borrower) + '</div>';
    groups[borrower].forEach(function(loan) {
      var status = calcLoanStatus(loan);
      var settled = status.isSettled;
      html += '<div class="loan-item" onclick="showPage(\'detail\', \'' + loan.id + '\')">';
      html += '<div class="loan-item-info">';
      html += '<div class="amount">' + (settled ? '✅ 已结清' : '¥' + status.totalOwed.toFixed(2)) + '</div>';
      html += '<div class="meta">本金 ¥' + loan.principal.toLocaleString() + ' · 年利率 ' + (loan.annualRate * 100).toFixed(2) + '% · ' + loan.startDate;
      if (loan.isCompound) html += ' · <span class="badge badge-blue">复利</span>';
      if (status.currentOverdue) html += ' · <span class="badge badge-red">逾期</span>';
      html += '</div></div><div class="loan-item-arrow">›</div></div>';
    });
    html += '</div>';
  }
  container.innerHTML = html;
}

function renderDetail(loanId) {
  var data = getData();
  var loan = data.loans.find(function(l) { return l.id === loanId; });
  if (!loan) { showPage('home'); return; }
  
  var status = calcLoanStatus(loan);
  var container = document.getElementById('detail-content');
  document.getElementById('detail-title').textContent = loan.borrower + ' 的借款';
  
  var typeNames = { 'custom':'自定义', 'interest_first':'先息后本', 'principal_first':'先本后息', 'equal_payment':'等额本息', 'equal_principal':'等额本金', 'lump_sum':'到期一次性还本付息' };
  
  var html = '';
  
  // 概览
  html += '<div class="card"><div class="summary-grid">';
  html += '<div class="summary-item"><div class="label">原始本金</div><div class="value">¥' + loan.principal.toLocaleString() + '</div></div>';
  html += '<div class="summary-item"><div class="label">剩余本金</div><div class="value danger">¥' + status.remainingPrincipal.toFixed(2) + '</div></div>';
  html += '<div class="summary-item"><div class="label">当前应计利息</div><div class="value danger">¥' + status.accruedInterest.toFixed(2) + '</div></div>';
  html += '<div class="summary-item"><div class="label">总欠款</div><div class="value ' + (status.isSettled ? 'success' : 'danger') + '">' + (status.isSettled ? '已结清' : '¥' + status.totalOwed.toFixed(2)) + '</div></div>';
  html += '<div class="summary-item"><div class="label">已还本金</div><div class="value success">¥' + status.totalPrincipalPaid.toFixed(2) + '</div></div>';
  html += '<div class="summary-item"><div class="label">已还利息</div><div class="value">¥' + status.totalInterestPaid.toFixed(2) + '</div></div>';
  html += '</div></div>';
  
  // 借款信息
  html += '<div class="card"><div class="card-title">📝 借款信息</div><div style="font-size:14px;line-height:2;">';
  html += '<p><strong>借款人：</strong>' + escHtml(loan.borrower) + '</p>';
  html += '<p><strong>本金：</strong>¥' + loan.principal.toLocaleString() + '</p>';
  html += '<p><strong>年利率：</strong>' + (loan.annualRate*100).toFixed(2) + '%（日利率 ' + (loan.annualRate/365*10000).toFixed(4) + '‱）</p>';
  html += '<p><strong>计息方式：</strong>' + (loan.isCompound ? '复利' : '单利') + '</p>';
  html += '<p><strong>还款方式：</strong>' + (typeNames[loan.repaymentType] || '自定义') + '</p>';
  html += '<p><strong>起借日期：</strong>' + loan.startDate + '</p>';
  if (loan.dueDate) html += '<p><strong>到期日期：</strong>' + loan.dueDate + '</p>';
  if (loan.penaltyRate) html += '<p><strong>逾期罚息利率：</strong>' + (loan.penaltyRate*100).toFixed(2) + '%</p>';
  if (loan.termMonths) html += '<p><strong>期限：</strong>' + loan.termMonths + ' 个月</p>';
  if (loan.note) html += '<p><strong>备注：</strong>' + escHtml(loan.note) + '</p>';
  html += '</div><div class="action-row">';
  html += '<button class="btn btn-outline btn-sm" onclick="showEditLoanModal(\'' + loan.id + '\')">✏️ 编辑</button>';
  html += '<button class="btn btn-danger btn-sm" onclick="deleteLoan(\'' + loan.id + '\')">🗑️ 删除借款</button>';
  html += '</div></div>';
  
  // 当前利息计算
  if (!status.isSettled) {
    html += '<div class="card"><div class="card-title">🧮 当前利息计算</div><div class="detail-block">';
    html += '距上次还款/起借已 ' + status.daysToNow + ' 天\n';
    if (status.currentOverdue) html += '⚠️ 已逾期，使用罚息利率 ' + (status.currentRate*100).toFixed(2) + '%\n';
    html += '计算公式：' + escHtml(status.accruedFormula);
    html += '</div></div>';
  }
  
  // 还款记录
  html += '<div class="card"><div class="card-title">💰 还款记录</div>';
  if (status.details.length === 0) {
    html += '<p style="color:var(--gray-500);text-align:center;padding:20px;">暂无还款记录</p>';
  } else {
    html += '<div style="overflow-x:auto;"><table class="record-table"><thead><tr><th>日期</th><th>天数</th><th>还款额</th><th>扣息</th><th>扣本</th><th>剩余本金</th><th>操作</th></tr></thead><tbody>';
    status.details.forEach(function(d) {
      html += '<tr><td>' + d.date + '</td><td>' + d.days + '天</td><td>¥' + d.amount.toFixed(2) + '</td><td>¥' + d.interestPortion.toFixed(2) + '</td><td>¥' + d.principalPortion.toFixed(2) + '</td><td>¥' + d.remainingPrincipal.toFixed(2) + '</td><td><button class="delete-btn" onclick="undoPayment(\'' + loan.id + '\',\'' + d.id + '\')">撤销</button></td></tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '<div class="action-row"><button class="btn btn-primary btn-sm" onclick="showAddPaymentModal(\'' + loan.id + '\')">+ 新增还款</button></div></div>';
  
  // 对账明细
  html += '<div class="card"><div class="card-title">📊 对账明细（含计算过程）</div><div class="detail-block">' + generateDetailText(loan, status) + '</div></div>';
  
  // 还款计划
  var schedule = generateSchedule(loan);
  if (schedule && schedule.length > 0) {
    html += '<div class="card"><div class="card-title">📅 还款计划表</div><div style="overflow-x:auto;"><table class="record-table"><thead><tr><th>期数</th><th>应还总额</th><th>本金</th><th>利息</th><th>剩余本金</th></tr></thead><tbody>';
    schedule.forEach(function(s) {
      html += '<tr><td>第' + s.month + '期</td><td>¥' + s.payment.toFixed(2) + '</td><td>¥' + s.principal.toFixed(2) + '</td><td>¥' + s.interest.toFixed(2) + '</td><td>¥' + s.remaining.toFixed(2) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
  }
  
  // 导出
  html += '<div class="card"><div class="card-title">📤 导出</div><div class="btn-group">';
  html += '<button class="btn btn-outline btn-sm" onclick="exportExcel(\'' + loan.id + '\')">📊 导出 Excel</button>';
  html += '<button class="btn btn-outline btn-sm" onclick="exportTxt(\'' + loan.id + '\')">📄 下载 TXT</button>';
  html += '<button class="btn btn-outline btn-sm" onclick="copyDetail(\'' + loan.id + '\')">📋 复制明细</button>';
  html += '</div></div>';
  
  container.innerHTML = html;
}

function generateDetailText(loan, status) {
  var text = '';
  text += '借款人：' + loan.borrower + '\n';
  text += '本金：¥' + loan.principal.toLocaleString() + '\n';
  text += '年利率：' + (loan.annualRate*100).toFixed(2) + '%（' + (loan.isCompound ? '复利' : '单利') + '）\n';
  text += '起借日期：' + loan.startDate + '\n';
  if (loan.dueDate) text += '到期日期：' + loan.dueDate + '\n';
  if (loan.penaltyRate) text += '逾期罚息利率：' + (loan.penaltyRate*100).toFixed(2) + '%\n';
  text += '\n───── 还款明细 ─────\n\n';
  
  if (status.details.length === 0) {
    text += '暂无还款记录\n';
  } else {
    status.details.forEach(function(d, idx) {
      text += '【第' + (idx+1) + '笔还款】' + d.date + '\n';
      text += '  计息天数：' + d.days + ' 天\n';
      text += '  应计利息：¥' + d.accruedInterest.toFixed(2) + '\n';
      text += '  计算公式：' + d.formula + '\n';
      text += '  还款金额：¥' + d.amount.toFixed(2) + '\n';
      text += '  抵扣利息：¥' + d.interestPortion.toFixed(2) + '\n';
      text += '  抵扣本金：¥' + d.principalPortion.toFixed(2) + '\n';
      text += '  剩余本金：¥' + d.remainingPrincipal.toFixed(2) + '\n';
      if (d.isOverdue) text += '  ⚠️ 逾期，使用罚息利率 ' + (d.rate*100).toFixed(2) + '%\n';
      if (d.note) text += '  备注：' + d.note + '\n';
      text += '\n';
    });
  }
  
  text += '───── 当前状态 ─────\n\n';
  text += '剩余本金：¥' + status.remainingPrincipal.toFixed(2) + '\n';
  text += '当前应计利息（' + status.daysToNow + '天）：¥' + status.accruedInterest.toFixed(2) + '\n';
  text += '公式：' + status.accruedFormula + '\n';
  text += '总欠款：¥' + status.totalOwed.toFixed(2) + '\n';
  text += '已还本金合计：¥' + status.totalPrincipalPaid.toFixed(2) + '\n';
  text += '已还利息合计：¥' + status.totalInterestPaid.toFixed(2) + '\n';
  return escHtml(text);
}

// ===== 弹窗 =====
function showAddLoanModal() {
  document.getElementById('loan-form').reset();
  document.getElementById('loan-modal-title').textContent = '新增借款';
  document.getElementById('loan-form-id').value = '';
  document.getElementById('loan-start-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('loan-modal').classList.add('active');
}

function showEditLoanModal(loanId) {
  var data = getData();
  var loan = data.loans.find(function(l) { return l.id === loanId; });
  if (!loan) return;
  document.getElementById('loan-modal-title').textContent = '编辑借款';
  document.getElementById('loan-form-id').value = loan.id;
  document.getElementById('loan-borrower').value = loan.borrower;
  document.getElementById('loan-principal').value = loan.principal;
  document.getElementById('loan-rate').value = (loan.annualRate*100).toFixed(2);
  document.getElementById('loan-start-date').value = loan.startDate;
  document.getElementById('loan-due-date').value = loan.dueDate || '';
  document.getElementById('loan-penalty-rate').value = loan.penaltyRate ? (loan.penaltyRate*100).toFixed(2) : '';
  document.getElementById('loan-compound').checked = loan.isCompound;
  document.getElementById('loan-type').value = loan.repaymentType || 'custom';
  document.getElementById('loan-term').value = loan.termMonths || '';
  document.getElementById('loan-note').value = loan.note || '';
  document.getElementById('loan-modal').classList.add('active');
}

function closeLoanModal() {
  document.getElementById('loan-modal').classList.remove('active');
}

function saveLoan(e) {
  e.preventDefault();
  var data = getData();
  var id = document.getElementById('loan-form-id').value;
  
  var loanData = {
    borrower: document.getElementById('loan-borrower').value.trim(),
    principal: parseFloat(document.getElementById('loan-principal').value),
    annualRate: parseFloat(document.getElementById('loan-rate').value) / 100,
    startDate: document.getElementById('loan-start-date').value,
    dueDate: document.getElementById('loan-due-date').value || null,
    penaltyRate: document.getElementById('loan-penalty-rate').value ? parseFloat(document.getElementById('loan-penalty-rate').value) / 100 : null,
    isCompound: document.getElementById('loan-compound').checked,
    repaymentType: document.getElementById('loan-type').value,
    termMonths: parseInt(document.getElementById('loan-term').value) || null,
    note: document.getElementById('loan-note').value.trim()
  };
  
  if (!loanData.borrower || !loanData.principal || !loanData.annualRate || !loanData.startDate) {
    showToast('请填写必填项');
    return;
  }
  
  if (id) {
    var idx = data.loans.findIndex(function(l) { return l.id === id; });
    if (idx >= 0) {
      data.loans[idx] = Object.assign(data.loans[idx], loanData);
    }
  } else {
    loanData.id = genId();
    loanData.payments = [];
    data.loans.push(loanData);
  }
  
  saveData(data);
  closeLoanModal();
  showToast(id ? '已更新' : '已添加');
  if (currentPage === 'detail') renderDetail(currentLoanId);
  else renderHome();
}

function deleteLoan(loanId) {
  if (!confirm('确定删除这笔借款？所有还款记录也将删除，不可恢复！')) return;
  var data = getData();
  data.loans = data.loans.filter(function(l) { return l.id !== loanId; });
  saveData(data);
  showToast('已删除');
  showPage('home');
}

// ===== 还款操作 =====
function showAddPaymentModal(loanId) {
  document.getElementById('payment-form').reset();
  document.getElementById('payment-loan-id').value = loanId;
  document.getElementById('payment-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('payment-mode').value = 'auto';
  toggleManualFields();
  document.getElementById('payment-modal').classList.add('active');
}

function closePaymentModal() {
  document.getElementById('payment-modal').classList.remove('active');
}

function toggleManualFields() {
  var mode = document.getElementById('payment-mode').value;
  var manual = document.getElementById('manual-fields');
  manual.style.display = mode === 'manual' ? 'block' : 'none';
}

function savePayment(e) {
  e.preventDefault();
  var data = getData();
  var loanId = document.getElementById('payment-loan-id').value;
  var loan = data.loans.find(function(l) { return l.id === loanId; });
  if (!loan) return;
  
  var mode = document.getElementById('payment-mode').value;
  var amount = parseFloat(document.getElementById('payment-amount').value);
  var date = document.getElementById('payment-date').value;
  var note = document.getElementById('payment-note').value.trim();
  
  if (!amount || !date) { showToast('请填写还款金额和日期'); return; }
  
  var payment = { id: genId(), date: date, amount: amount, mode: mode, note: note };
  
  if (mode === 'manual') {
    payment.interestPart = parseFloat(document.getElementById('payment-interest-part').value) || 0;
    payment.principalPart = parseFloat(document.getElementById('payment-principal-part').value) || 0;
    payment.amount = payment.interestPart + payment.principalPart;
  }
  
  if (!loan.payments) loan.payments = [];
  loan.payments.push(payment);
  
  saveData(data);
  closePaymentModal();
  showToast('还款已记录');
  renderDetail(loanId);
}

function undoPayment(loanId, paymentId) {
  if (!confirm('确定撤销这笔还款？账务将自动回滚。')) return;
  var data = getData();
  var loan = data.loans.find(function(l) { return l.id === loanId; });
  if (!loan) return;
  
  var payment = loan.payments.find(function(p) { return p.id === paymentId; });
  if (payment) payment.deleted = true;
  
  saveData(data);
  showToast('还款已撤销');
  renderDetail(loanId);
}

// ===== 导出功能 =====

function getDetailTextRaw(loanId) {
  var data = getData();
  var loan = data.loans.find(function(l) { return l.id === loanId; });
  if (!loan) return '';
  var status = calcLoanStatus(loan);
  
  var text = '';
  text += '═══════════════════════════════════\n';
  text += '         私人借贷对账单\n';
  text += '═══════════════════════════════════\n\n';
  text += '借款人：' + loan.borrower + '\n';
  text += '本金：¥' + loan.principal.toLocaleString() + '\n';
  text += '年利率：' + (loan.annualRate*100).toFixed(2) + '%（' + (loan.isCompound ? '复利' : '单利') + '）\n';
  text += '起借日期：' + loan.startDate + '\n';
  if (loan.dueDate) text += '到期日期：' + loan.dueDate + '\n';
  if (loan.penaltyRate) text += '逾期罚息利率：' + (loan.penaltyRate*100).toFixed(2) + '%\n';
  text += '\n───── 还款明细 ─────\n\n';
  
  status.details.forEach(function(d, idx) {
    text += '【第' + (idx+1) + '笔还款】' + d.date + '\n';
    text += '  计息天数：' + d.days + ' 天\n';
    text += '  应计利息：¥' + d.accruedInterest.toFixed(2) + '\n';
    text += '  计算公式：' + d.formula + '\n';
    text += '  还款金额：¥' + d.amount.toFixed(2) + '\n';
    text += '  抵扣利息：¥' + d.interestPortion.toFixed(2) + '\n';
    text += '  抵扣本金：¥' + d.principalPortion.toFixed(2) + '\n';
    text += '  剩余本金：¥' + d.remainingPrincipal.toFixed(2) + '\n';
    if (d.isOverdue) text += '  ⚠️ 逾期\n';
    text += '\n';
  });
  
  text += '───── 当前状态 ─────\n\n';
  text += '剩余本金：¥' + status.remainingPrincipal.toFixed(2) + '\n';
  text += '当前应计利息：¥' + status.accruedInterest.toFixed(2) + '\n';
  text += '总欠款：¥' + status.totalOwed.toFixed(2) + '\n';
  text += '已还本金合计：¥' + status.totalPrincipalPaid.toFixed(2) + '\n';
  text += '已还利息合计：¥' + status.totalInterestPaid.toFixed(2) + '\n';
  text += '\n生成时间：' + new Date().toLocaleString('zh-CN') + '\n';
  return text;
}

function exportTxt(loanId) {
  var text = getDetailTextRaw(loanId);
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, '借贷对账单.txt');
  showToast('TXT 已下载');
}

function copyDetail(loanId) {
  var text = getDetailTextRaw(loanId);
  navigator.clipboard.writeText(text).then(function() {
    showToast('已复制到剪贴板');
  }).catch(function() {
    // fallback
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('已复制到剪贴板');
  });
}

function exportExcel(loanId) {
  var data = getData();
  var loan = data.loans.find(function(l) { return l.id === loanId; });
  if (!loan) return;
  var status = calcLoanStatus(loan);
  
  // 构建工作表数据
  var wsData = [];
  wsData.push(['借贷对账单']);
  wsData.push([]);
  wsData.push(['借款人', loan.borrower]);
  wsData.push(['本金', loan.principal]);
  wsData.push(['年利率', (loan.annualRate*100).toFixed(2) + '%']);
  wsData.push(['计息方式', loan.isCompound ? '复利' : '单利']);
  wsData.push(['起借日期', loan.startDate]);
  if (loan.dueDate) wsData.push(['到期日期', loan.dueDate]);
  wsData.push([]);
  wsData.push(['还款明细']);
  wsData.push(['日期', '计息天数', '应计利息', '还款金额', '抵扣利息', '抵扣本金', '剩余本金', '计算公式']);
  
  status.details.forEach(function(d) {
    wsData.push([d.date, d.days, d.accruedInterest, d.amount, d.interestPortion, d.principalPortion, d.remainingPrincipal, d.formula]);
  });
  
  wsData.push([]);
  wsData.push(['当前状态']);
  wsData.push(['剩余本金', status.remainingPrincipal]);
  wsData.push(['当前应计利息', status.accruedInterest]);
  wsData.push(['总欠款', status.totalOwed]);
  wsData.push(['已还本金合计', status.totalPrincipalPaid]);
  wsData.push(['已还利息合计', status.totalInterestPaid]);
  
  // 使用简易 xlsx 生成
  var xlsx = generateXlsx(wsData);
  downloadBlob(xlsx, loan.borrower + '_借贷对账单.xlsx');
  showToast('Excel 已下载');
}

// ===== 简易 XLSX 生成器 =====
// 不依赖外部库，纯 JS 生成符合 OOXML 标准的 xlsx 文件
function generateXlsx(data) {
  // xlsx 是一个 ZIP 文件，包含 XML 文件
  // 我们使用最小化的 xlsx 结构
  
  function escXml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  
  // 构建 sheet XML
  var sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  sheetXml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
  sheetXml += '<sheetData>';
  
  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    sheetXml += '<row r="' + (r+1) + '">';
    for (var c = 0; c < row.length; c++) {
      var cell = row[c];
      var ref = String.fromCharCode(65 + c) + (r+1);
      if (typeof cell === 'number') {
        sheetXml += '<c r="' + ref + '"><v>' + cell + '</v></c>';
      } else {
        sheetXml += '<c r="' + ref + '" t="inlineStr"><is><t>' + escXml(cell || '') + '</t></is></c>';
      }
    }
    sheetXml += '</row>';
  }
  
  sheetXml += '</sheetData></worksheet>';
  
  // 其他必需文件
  var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
  
  var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  
  var workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="对账单" sheetId="1" r:id="rId1"/></sheets></workbook>';
  
  var wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
  
  // 使用 miniZip 生成 ZIP
  var zip = new MiniZip();
  zip.addFile('[Content_Types].xml', contentTypes);
  zip.addFile('_rels/.rels', rels);
  zip.addFile('xl/workbook.xml', workbook);
  zip.addFile('xl/_rels/workbook.xml.rels', wbRels);
  zip.addFile('xl/worksheets/sheet1.xml', sheetXml);
  
  return zip.generate();
}

// ===== 极简 ZIP 生成器 =====
function MiniZip() {
  this.files = [];
}

MiniZip.prototype.addFile = function(name, content) {
  this.files.push({ name: name, content: content });
};

MiniZip.prototype.generate = function() {
  var files = this.files;
  var localHeaders = [];
  var centralHeaders = [];
  var offset = 0;
  
  function str2bytes(str) {
    var arr = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 128) {
        arr.push(code);
      } else if (code < 2048) {
        arr.push(192 | (code >> 6));
        arr.push(128 | (code & 63));
      } else {
        arr.push(224 | (code >> 12));
        arr.push(128 | ((code >> 6) & 63));
        arr.push(128 | (code & 63));
      }
    }
    return new Uint8Array(arr);
  }
  
  function crc32(bytes) {
    var table = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  
  function writeU16(arr, pos, val) { arr[pos] = val & 0xFF; arr[pos+1] = (val >> 8) & 0xFF; }
  function writeU32(arr, pos, val) { arr[pos] = val & 0xFF; arr[pos+1] = (val >> 8) & 0xFF; arr[pos+2] = (val >> 16) & 0xFF; arr[pos+3] = (val >> 24) & 0xFF; }
  
  // 计算总大小
  var totalSize = 0;
  var processedFiles = [];
  
  for (var i = 0; i < files.length; i++) {
    var nameBytes = str2bytes(files[i].name);
    var contentBytes = str2bytes(files[i].content);
    var crc = crc32(contentBytes);
    processedFiles.push({ nameBytes: nameBytes, contentBytes: contentBytes, crc: crc });
    totalSize += 30 + nameBytes.length + contentBytes.length; // local header + data
    totalSize += 46 + nameBytes.length; // central header
  }
  totalSize += 22; // end of central directory
  
  var buffer = new Uint8Array(totalSize);
  var pos = 0;
  var centralStart = 0;
  
  // Write local file headers + data
  for (var i = 0; i < processedFiles.length; i++) {
    var f = processedFiles[i];
    var headerOffset = pos;
    
    // Local file header (30 bytes + name + data)
    writeU32(buffer, pos, 0x04034b50); pos += 4; // signature
    writeU16(buffer, pos, 20); pos += 2; // version needed
    writeU16(buffer, pos, 0); pos += 2; // flags
    writeU16(buffer, pos, 0); pos += 2; // compression (none)
    writeU16(buffer, pos, 0); pos += 2; // mod time
    writeU16(buffer, pos, 0); pos += 2; // mod date
    writeU32(buffer, pos, f.crc); pos += 4; // crc32
    writeU32(buffer, pos, f.contentBytes.length); pos += 4; // compressed size
    writeU32(buffer, pos, f.contentBytes.length); pos += 4; // uncompressed size
    writeU16(buffer, pos, f.nameBytes.length); pos += 2; // filename length
    writeU16(buffer, pos, 0); pos += 2; // extra field length
    buffer.set(f.nameBytes, pos); pos += f.nameBytes.length;
    buffer.set(f.contentBytes, pos); pos += f.contentBytes.length;
    
    // Save info for central directory
    centralHeaders.push({ headerOffset: headerOffset, file: f });
  }
  
  centralStart = pos;
  
  // Write central directory
  for (var i = 0; i < centralHeaders.length; i++) {
    var ch = centralHeaders[i];
    var f = ch.file;
    
    writeU32(buffer, pos, 0x02014b50); pos += 4; // signature
    writeU16(buffer, pos, 20); pos += 2; // version made by
    writeU16(buffer, pos, 20); pos += 2; // version needed
    writeU16(buffer, pos, 0); pos += 2; // flags
    writeU16(buffer, pos, 0); pos += 2; // compression
    writeU16(buffer, pos, 0); pos += 2; // mod time
    writeU16(buffer, pos, 0); pos += 2; // mod date
    writeU32(buffer, pos, f.crc); pos += 4; // crc32
    writeU32(buffer, pos, f.contentBytes.length); pos += 4; // compressed size
    writeU32(buffer, pos, f.contentBytes.length); pos += 4; // uncompressed size
    writeU16(buffer, pos, f.nameBytes.length); pos += 2; // filename length
    writeU16(buffer, pos, 0); pos += 2; // extra field length
    writeU16(buffer, pos, 0); pos += 2; // comment length
    writeU16(buffer, pos, 0); pos += 2; // disk number start
    writeU16(buffer, pos, 0); pos += 2; // internal file attributes
    writeU32(buffer, pos, 0); pos += 4; // external file attributes
    writeU32(buffer, pos, ch.headerOffset); pos += 4; // relative offset
    buffer.set(f.nameBytes, pos); pos += f.nameBytes.length;
  }
  
  var centralEnd = pos;
  var centralSize = centralEnd - centralStart;
  
  // End of central directory
  writeU32(buffer, pos, 0x06054b50); pos += 4; // signature
  writeU16(buffer, pos, 0); pos += 2; // disk number
  writeU16(buffer, pos, 0); pos += 2; // central directory disk
  writeU16(buffer, pos, files.length); pos += 2; // entries on this disk
  writeU16(buffer, pos, files.length); pos += 2; // total entries
  writeU32(buffer, pos, centralSize); pos += 4; // size of central directory
  writeU32(buffer, pos, centralStart); pos += 4; // offset of central directory
  writeU16(buffer, pos, 0); pos += 2; // comment length
  
  return new Blob([buffer.slice(0, pos)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('loan-form').addEventListener('submit', saveLoan);
  document.getElementById('payment-form').addEventListener('submit', savePayment);
  document.getElementById('payment-mode').addEventListener('change', toggleManualFields);
  showPage('home');
});
