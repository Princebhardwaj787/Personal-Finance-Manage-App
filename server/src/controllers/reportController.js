import * as reportService from '../services/reportService.js';
import * as reportExport from '../services/reportExport.js';

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reports/:type — JSON report preview.
 * The report is built from existing services, then a history row (params
 * only) is recorded so the user can see and re-run past reports (§18).
 */
export const getReport = handle(async (req, res) => {
  const { type } = req.params;
  const report = await reportService.getReport(req.user.id, type, req.query);

  await reportService.recordReportHistory(req.user.id, {
    type,
    format: 'json',
    startDate: report.period.startISO,
    endDate: report.period.endInclusiveISO
  });

  res.json(report);
});

/**
 * GET /api/reports/:type/export?format=csv|pdf — file download.
 * The export service streams the file and records history itself.
 */
export const exportReport = handle(async (req, res) => {
  const { type } = req.params;
  const { format } = req.query;
  await reportExport.exportReport(req.user.id, type, format, req.query, res);
});

/** GET /api/reports/history — previously generated reports (§18). */
export const getReportHistory = handle(async (req, res) => {
  const { page, limit } = req.query;
  const result = await reportService.getReportHistory(req.user.id, { page, limit });
  res.json(result);
});
