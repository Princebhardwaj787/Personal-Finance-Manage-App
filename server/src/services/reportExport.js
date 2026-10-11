import { stringify } from 'csv-stringify';
import PDFDocument from 'pdfkit';
import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { round2 } from '../utils/goalCalculator.js';
import { buildTransactionWhere } from './transactionService.js';
import { resolveRange } from '../utils/dateRange.js';
import { getReport, recordReportHistory } from './reportService.js';

/**
 * REPORT EXPORT SERVICE (Phase 8 §13–16)
 * ======================================
 * CSV and PDF exports are generated entirely on the server from database
 * aggregates — the browser never receives a raw transaction history to do
 * financial maths (§15).
 *
 * CSV: streamed to the response in keyset batches of 500 rows so memory stays
 * bounded no matter how large the history is (§16). `csv-stringify` handles
 * RFC-4180 escaping (commas, quotes, newlines) and the UTF-8 BOM.
 *
 * PDF: pdfkit streams straight into the response. The report data is fully
 * built BEFORE the first byte is written, so a validation error is still a
 * clean JSON 400 and an empty period produces no misleading blank PDF (§24).
 *
 * Filenames are derived from the resolved range (never from user text) and
 * sanitized (§22).
 */

const CSV_BATCH_SIZE = 500;

const CSV_TYPES = Object.freeze(['transactions', 'categories', 'budgets', 'accounts']);
const PDF_TYPES = Object.freeze(['monthly', 'yearly']);

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const formatMoney = (value) => {
  const num = Number(value) || 0;
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** Predictable, sanitized download filename (§22). */
const buildFilename = (base, period, ext) => {
  const { startISO, endInclusiveISO } = period;
  let rangePart;
  if (startISO.slice(0, 7) === endInclusiveISO.slice(0, 7)) {
    rangePart = startISO.slice(0, 7); // single month -> YYYY-MM
  } else if (startISO.slice(0, 4) === endInclusiveISO.slice(0, 4)) {
    rangePart = startISO.slice(0, 4); // single year  -> YYYY
  } else {
    rangePart = `${startISO}_${endInclusiveISO}`; // custom range
  }
  const safe = (text) => String(text).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
  return `${safe(base)}-${rangePart}.${ext}`;
};

const sendHistory = (userId, type, format, period) =>
  recordReportHistory(userId, {
    type,
    format,
    startDate: period.startISO,
    endDate: period.endInclusiveISO
  });

/* ------------------------------------------------------------------ */
/* CSV exports                                                         */
/* ------------------------------------------------------------------ */

const CSV_COLUMNS = {
  transactions: ['Date', 'Description', 'Category', 'Account', 'Type', 'Amount', 'Notes'],
  categories: ['Category', 'Total Amount', 'Percentage of Expenses', 'Number of Transactions'],
  budgets: ['Category', 'Budget', 'Spent', 'Remaining', 'Usage %', 'Status'],
  accounts: ['Account', 'Current Balance', 'Total Income', 'Total Expenses', 'Number of Transactions', 'Transfers In', 'Transfers Out']
};

const CSV_SELECT = {
  id: true,
  date: true,
  description: true,
  notes: true,
  type: true,
  amount: true,
  account: { select: { name: true } },
  category: { select: { name: true } }
};

const transactionToCsvRow = (txn) => [
  txn.date.toISOString().slice(0, 10),
  txn.description ?? '',
  txn.category?.name ?? 'Uncategorized',
  txn.account?.name ?? '',
  txn.type,
  round2(txn.amount),
  txn.notes ?? ''
];

/**
 * Stream every matching transaction to the response in keyset batches.
 * `id: { gt: lastId }` gives correct, index-backed pagination without
 * loading the whole history into memory.
 */
const streamTransactionsCsv = async (userId, where, res, filename) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const stringifier = stringify({ header: true, columns: CSV_COLUMNS.transactions, bom: true });
  stringifier.pipe(res);

  try {
    let lastId;
    for (;;) {
      const batchWhere = lastId ? { ...where, id: { gt: lastId } } : where;
      const batch = await prisma.transaction.findMany({
        where: batchWhere,
        orderBy: { id: 'asc' },
        take: CSV_BATCH_SIZE,
        select: CSV_SELECT
      });
      if (batch.length === 0) break;
      for (const txn of batch) stringifier.write(transactionToCsvRow(txn));
      if (batch.length < CSV_BATCH_SIZE) break;
      lastId = batch[batch.length - 1].id;
    }
    stringifier.end();
  } catch (error) {
    // Headers are already sent; the only safe way to signal failure is to
    // tear the connection down. The error is logged by the process.
    console.error('CSV transaction export failed mid-stream:', error.message);
    stringifier.end();
    res.destroy();
  }
};

const writeCsvFromRows = (res, filename, columns, rows) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const stringifier = stringify({ header: true, columns, bom: true });
  stringifier.pipe(res);
  rows.forEach((row) => stringifier.write(row));
  stringifier.end();
};

const exportTransactionsCsv = async (userId, query, res) => {
  const { period, where, filename } = await resolveExportContext(userId, query, 'transactions');
  await streamTransactionsCsv(userId, where, res, filename);
  await sendHistory(userId, 'transactions', 'csv', period);
};

const exportCategoriesCsv = async (userId, query, res) => {
  const { period, filename } = await resolveExportContext(userId, query, 'categories');
  const report = await getReport(userId, 'categories', query);
  const rows = report.categories.map((cat) => [
    cat.name,
    round2(cat.amount),
    cat.sharePercent,
    cat.count
  ]);
  writeCsvFromRows(res, filename, CSV_COLUMNS.categories, rows);
  await sendHistory(userId, 'categories', 'csv', period);
};

const exportBudgetsCsv = async (userId, query, res) => {
  const { period, filename } = await resolveExportContext(userId, query, 'budgets');
  const report = await getReport(userId, 'budgets', query);
  const rows = report.budgets.map((b) => [
    b.category?.name ?? 'Uncategorized',
    round2(b.budgetAmount),
    round2(b.spentAmount),
    round2(b.remainingAmount),
    b.percentageUsed,
    b.status
  ]);
  writeCsvFromRows(res, filename, CSV_COLUMNS.budgets, rows);
  await sendHistory(userId, 'budgets', 'csv', period);
};

const exportAccountsCsv = async (userId, query, res) => {
  const { period, filename } = await resolveExportContext(userId, query, 'accounts');
  const report = await getReport(userId, 'accounts', query);
  const rows = report.accounts.map((a) => [
    a.name,
    round2(a.balance),
    round2(a.income),
    round2(a.expenses),
    a.transactionCount,
    round2(a.transfersIn),
    round2(a.transfersOut)
  ]);
  writeCsvFromRows(res, filename, CSV_COLUMNS.accounts, rows);
  await sendHistory(userId, 'accounts', 'csv', period);
};

/**
 * Resolve the range + where-clause + filename shared by every CSV export.
 * Runs BEFORE any header is written so validation errors stay JSON 400s.
 */
const resolveExportContext = async (userId, query, type) => {
  const {
    period: periodParam,
    startDate,
    endDate,
    accountId,
    categoryId,
    type: txnType,
    minAmount,
    maxAmount,
    search
  } = query;

  // resolveRange defaults period to 'this_month', which would ignore custom
  // startDate/endDate. Use 'custom' when dates are given without a period —
  // the same rule reportService.resolveContext applies to JSON reports.
  const effectivePeriod = periodParam || (startDate || endDate ? 'custom' : 'this_month');
  const range = resolveRange({ period: effectivePeriod, startDate, endDate });
  const where = buildTransactionWhere(userId, {
    accountId,
    categoryId,
    type: txnType,
    minAmount,
    maxAmount,
    search,
    startDate: range.startISO,
    endDate: range.endInclusiveISO
  });

  const period = { startISO: range.startISO, endInclusiveISO: range.endInclusiveISO };
  const filename = buildFilename(`${type}-report`, period, 'csv');

  return { period, where, filename };
};

/* ------------------------------------------------------------------ */
/* PDF exports (pdfkit)                                               */
/* ------------------------------------------------------------------ */

const PDF_MARGIN = 50;
const PDF_CONTENT_WIDTH = 595 - PDF_MARGIN * 2; // A4 width minus margins

const drawTable = (doc, columns, rows) => {
  const rowHeight = 22;
  const startX = PDF_MARGIN;
  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);

  const drawHeader = () => {
    let x = startX;
    doc.rect(startX, doc.y, totalWidth, rowHeight).fill('#e8e8e8');
    columns.forEach((col) => {
      doc.fillColor('#000').fontSize(9)
        .text(col.header, x + 4, doc.y + 6, { width: col.width - 8, align: col.align || 'left' });
      x += col.width;
    });
    doc.y += rowHeight;
    doc.moveTo(startX, doc.y).lineTo(startX + totalWidth, doc.y).strokeColor('#cccccc').stroke();
  };

  const drawRow = (cells) => {
    if (doc.y + rowHeight > doc.page.height - PDF_MARGIN) {
      doc.addPage();
      drawHeader();
    }
    let x = startX;
    cells.forEach((cell, i) => {
      const col = columns[i];
      doc.fillColor('#333').fontSize(9)
        .text(String(cell ?? ''), x + 4, doc.y + 6, { width: col.width - 8, align: col.align || 'left' });
      x += col.width;
    });
    doc.y += rowHeight;
    doc.moveTo(startX, doc.y).lineTo(startX + totalWidth, doc.y).strokeColor('#e0e0e0').stroke();
  };

  drawHeader();
  rows.forEach((row) => drawRow(row));
};

const pdfHeader = (doc, report) => {
  doc.fontSize(20).fillColor('#1a1a1a')
    .text(`${report.period.label} Financial Report`, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#666666')
    .text('All amounts in Indian Rupees (INR)', { align: 'center' });
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor('#666666')
    .text(`Period: ${report.period.startISO} to ${report.period.endInclusiveISO}`, { align: 'center' });
  doc.moveDown(1);
};

const pdfSummaryLine = (doc, label, value) => {
  doc.fontSize(10).fillColor('#333333').text(`${label}: ${value}`);
};

const renderMonthlyPdf = (doc, report) => {
  pdfHeader(doc, report);

  doc.fontSize(14).fillColor('#1a1a1a').text('Summary');
  doc.moveDown(0.3);
  pdfSummaryLine(doc, 'Income', formatMoney(report.summary.totalIncome));
  pdfSummaryLine(doc, 'Expenses', formatMoney(report.summary.totalExpenses));
  pdfSummaryLine(doc, 'Net Savings', formatMoney(report.summary.netSavings));
  pdfSummaryLine(doc, 'Savings Rate', `${report.summary.savingsRate ?? 0}%`);
  doc.moveDown(1);

  if (report.budget.budgetCount > 0) {
    doc.fontSize(14).fillColor('#1a1a1a').text('Budget Summary');
    doc.moveDown(0.3);
    pdfSummaryLine(doc, 'Total Budget', formatMoney(report.budget.totalBudget));
    pdfSummaryLine(doc, 'Total Spent', formatMoney(report.budget.totalSpent));
    pdfSummaryLine(doc, 'Usage', `${report.budget.usagePercent}%`);
    doc.moveDown(1);
  }

  if (report.topCategories.length > 0) {
    doc.fontSize(14).fillColor('#1a1a1a').text('Top Spending Categories');
    doc.moveDown(0.3);
    report.topCategories.forEach((cat) => {
      pdfSummaryLine(doc, cat.name, `${formatMoney(cat.amount)} (${cat.sharePercent}%)`);
    });
  }
};

const renderYearlyPdf = (doc, report) => {
  pdfHeader(doc, report);

  doc.fontSize(14).fillColor('#1a1a1a').text('Summary');
  doc.moveDown(0.3);
  pdfSummaryLine(doc, 'Total Income', formatMoney(report.summary.totalIncome));
  pdfSummaryLine(doc, 'Total Expenses', formatMoney(report.summary.totalExpenses));
  pdfSummaryLine(doc, 'Total Savings', formatMoney(report.summary.totalSavings));
  pdfSummaryLine(doc, 'Average Monthly Income', formatMoney(report.summary.averageMonthlyIncome));
  pdfSummaryLine(doc, 'Average Monthly Expenses', formatMoney(report.summary.averageMonthlyExpenses));
  pdfSummaryLine(doc, 'Average Monthly Savings', formatMoney(report.summary.averageMonthlySavings));
  pdfSummaryLine(doc, 'Savings Rate', `${report.summary.savingsRate ?? 0}%`);
  doc.moveDown(1);

  doc.fontSize(14).fillColor('#1a1a1a').text('Monthly Breakdown');
  doc.moveDown(0.5);

  const columns = [
    { header: 'Month', width: 195, align: 'left' },
    { header: 'Income', width: 100, align: 'right' },
    { header: 'Expenses', width: 100, align: 'right' },
    { header: 'Savings', width: 100, align: 'right' }
  ];
  const rows = report.months.map((m) => [
    m.label,
    formatMoney(m.income),
    formatMoney(m.expenses),
    formatMoney(m.savings)
  ]);
  drawTable(doc, columns, rows);
};

const exportPdf = async (userId, type, query, res) => {
  // Build the report fully BEFORE writing any byte: validation errors stay
  // JSON 400s and an empty period never produces a misleading blank PDF.
  const report = await getReport(userId, type, query);
  if (!report.hasData) {
    throw new AppError('No financial data is available for the selected period.', 400);
  }

  const filename = buildFilename(`${type}-report`, report.period, 'pdf');
  const doc = new PDFDocument({
    margin: PDF_MARGIN,
    size: 'A4',
    info: { Title: `${report.period.label} Financial Report` }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  if (type === 'monthly') {
    renderMonthlyPdf(doc, report);
  } else {
    renderYearlyPdf(doc, report);
  }

  doc.end();
  await sendHistory(userId, type, 'pdf', report.period);
};

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

const CSV_EXPORTERS = {
  transactions: exportTransactionsCsv,
  categories: exportCategoriesCsv,
  budgets: exportBudgetsCsv,
  accounts: exportAccountsCsv
};

const PDF_EXPORTERS = {
  monthly: exportPdf,
  yearly: exportPdf
};

/**
 * Export a report as CSV or PDF. The format/type combination is validated
 * here (§13–14) before any byte is written.
 */
export const exportReport = async (userId, type, format, query, res) => {
  if (format === 'csv') {
    const exporter = CSV_EXPORTERS[type];
    if (!exporter) {
      throw new AppError(`CSV export is available for: ${CSV_TYPES.join(', ')}`, 400);
    }
    await exporter(userId, query, res);
    return;
  }

  const exporter = PDF_EXPORTERS[type];
  if (!exporter) {
    throw new AppError(`PDF export is available for: ${PDF_TYPES.join(', ')}`, 400);
  }
  await exporter(userId, type, query, res);
};
