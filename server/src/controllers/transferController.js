import * as transferService from '../services/transferService.js';

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

/** GET /api/transfers — history with SQL-side filters and paging. */
export const listTransfers = handle(async (req, res) => {
  const { page, limit, startDate, endDate, accountId, search, sortBy, sortOrder } = req.query;
  const result = await transferService.getTransfers(req.user.id, {
    page,
    limit,
    startDate,
    endDate,
    accountId,
    search,
    sortBy,
    sortOrder
  });
  res.json(result);
});

/** GET /api/transfers/summary */
export const getSummary = handle(async (req, res) => {
  const { startDate, endDate } = req.query;
  res.json(await transferService.getTransferSummary(req.user.id, { startDate, endDate }));
});

/** GET /api/transfers/:id */
export const getTransfer = handle(async (req, res) => {
  const transfer = await transferService.getTransferById(req.user.id, req.params.id);
  res.json({ transfer });
});

/** POST /api/transfers — atomic: debit source, credit destination, insert row. */
export const createTransfer = handle(async (req, res) => {
  const transfer = await transferService.createTransfer(req.user.id, req.body);
  res.status(201).json({ transfer });
});

/** PUT /api/transfers/:id */
export const updateTransfer = handle(async (req, res) => {
  const transfer = await transferService.updateTransfer(req.user.id, req.params.id, req.body);
  res.json({ transfer });
});

/** DELETE /api/transfers/:id — reverses both balance movements. */
export const deleteTransfer = handle(async (req, res) => {
  await transferService.deleteTransfer(req.user.id, req.params.id);
  res.json({ message: 'Transfer deleted successfully' });
});
