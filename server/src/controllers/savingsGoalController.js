import * as savingsGoalService from '../services/savingsGoalService.js';

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

/** GET /api/savings-goals */
export const listGoals = handle(async (req, res) => {
  const goals = await savingsGoalService.listGoals(req.user.id, { status: req.query.status });
  res.json({ goals });
});

/** GET /api/savings-goals/summary */
export const getSummary = handle(async (req, res) => {
  const summary = await savingsGoalService.getSavingsSummary(req.user.id);
  res.json(summary);
});

/** GET /api/savings-goals/:id */
export const getGoal = handle(async (req, res) => {
  const goal = await savingsGoalService.getGoal(req.user.id, req.params.id);
  res.json({ goal });
});

/** POST /api/savings-goals */
export const createGoal = handle(async (req, res) => {
  const goal = await savingsGoalService.createGoal(req.user.id, req.body);
  res.status(201).json({ goal });
});

/** PUT /api/savings-goals/:id */
export const updateGoal = handle(async (req, res) => {
  const goal = await savingsGoalService.updateGoal(req.user.id, req.params.id, req.body);
  res.json({ goal });
});

/** DELETE /api/savings-goals/:id */
export const deleteGoal = handle(async (req, res) => {
  const result = await savingsGoalService.deleteGoal(req.user.id, req.params.id);
  res.json({ message: 'Savings goal deleted successfully', ...result });
});

/** POST /api/savings-goals/:id/contributions */
export const addContribution = handle(async (req, res) => {
  const result = await savingsGoalService.addContribution(
    req.user.id,
    req.params.id,
    req.body
  );
  res.status(201).json(result);
});

/** GET /api/savings-goals/:id/contributions */
export const listContributions = handle(async (req, res) => {
  const result = await savingsGoalService.listContributions(req.user.id, req.params.id, {
    page: req.query.page,
    limit: req.query.limit
  });
  res.json(result);
});
