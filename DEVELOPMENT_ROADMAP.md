# Personal Finance Management App - Development Roadmap

## Overview
This roadmap breaks the application into 7 logical phases, each delivering working functionality while building toward the complete feature set.

---

## Phase 1: Project Foundation & Authentication (Week 1-2)

### What will be built
- Project initialization (Vite + React + Tailwind + Express + Prisma)
- Database schema design and initial migration
- Project structure and architecture setup
- Complete authentication system (register, login, logout, JWT, protected routes)
- User profile management

### Files/Modules Created

**Backend:**
server/
src/
index.js                 # Express app entry point
config/
database.js          # Prisma client
jwt.js               # JWT configuration
env.js               # Environment validation
middleware/
auth.js              # JWT verification
validation.js        # Request validation
errorHandler.js      # Global error handling
routes/
auth.js              # Auth routes
users.js             # User profile routes
controllers/
authController.js
userController.js
services/
authService.js
userService.js
utils/
password.js          # bcrypt helpers
jwt.js               # Token helpers
validators.js
prisma/
schema.prisma        # Database schema

**Frontend:**
client/
src/
main.jsx                 # React entry
App.jsx                  # Root component
routes/
AppRoutes.jsx        # Route definitions
ProtectedRoute.jsx   # Auth guard
contexts/
AuthContext.jsx      # Auth state management
pages/
Login.jsx
Register.jsx
Profile.jsx
components/
layout/
Header.jsx
Sidebar.jsx
Layout.jsx
forms/
Input.jsx
Button.jsx
Form.jsx
ui/
Card.jsx
Modal.jsx
Loading.jsx
services/
api.js               # Axios instance
authApi.js
hooks/
useAuth.js
utils/
formatters.js
validators.js

### Database Changes (Prisma Schema)
model User {
id            String    @id @default(cuid())
email         String    @unique
passwordHash  String
name          String?
avatar        String?
createdAt     DateTime  @default(now())
updatedAt     DateTime  @updatedAt
accounts      Account[]
transactions  Transaction[]
categories    Category[]
budgets       Budget[]
savingsGoals  SavingsGoal[]
subscriptions Subscription[]
}

model Category {
id          String   @id @default(cuid())
name        String
type        CategoryType  // INCOME, EXPENSE
icon        String?
color       String?
userId      String
user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
transactions Transaction[]
budgets     Budget[]
createdAt   DateTime @default(now())
updatedAt   DateTime @updatedAt
@@unique([name, userId, type])
}

enum CategoryType {
INCOME
EXPENSE
}

### API Changes
- POST /api/auth/register - User registration
- POST /api/auth/login - User login
- POST /api/auth/logout - User logout (client-side token removal)
- GET /api/auth/me - Get current user
- PUT /api/users/profile - Update profile
- PUT /api/users/password - Change password

### Frontend Changes
- Login/Register pages with validation
- Protected route wrapper
- Auth context with login/logout/register methods
- Basic layout components (Header, Sidebar, Layout)
- Reusable form components (Input, Button, Form)
- Toast notifications for errors/success

### Testing Requirements
- Unit tests for auth service (password hashing, token generation)
- Integration tests for auth endpoints
- E2E test: Register Login Access protected route Logout
- Form validation tests

### Expected Result
- Running backend server on port 3001
- Running frontend on port 5173
- User can register, login, see dashboard layout, logout
- JWT tokens stored in httpOnly cookies or localStorage
- Protected routes redirect to login

---

## Phase 2: Core Data Models & Accounts (Week 2-3)

### What will be built
- Account management (CRUD)
- Category management (CRUD, default categories)
- Transaction foundation (model, basic CRUD)
- Account balance tracking

### Files/Modules Created/Modified

**Backend Additions:**
server/src/
routes/
accounts.js
categories.js
transactions.js
controllers/
accountController.js
categoryController.js
transactionController.js
services/
accountService.js
categoryService.js
transactionService.js
utils/
balanceCalculator.js

**Frontend Additions:**
client/src/
pages/
Accounts.jsx
Categories.jsx
Transactions.jsx
components/
accounts/
AccountCard.jsx
AccountForm.jsx
AccountList.jsx
categories/
CategoryForm.jsx
CategoryList.jsx
transactions/
TransactionForm.jsx
TransactionList.jsx
TransactionFilters.jsx
services/
accountApi.js
categoryApi.js
transactionApi.js
hooks/
useAccounts.js
useCategories.js
useTransactions.js

### Database Changes
model Account {
id            String    @id @default(cuid())
name          String
type          AccountType
balance       Decimal   @default(0) @db.Decimal(15, 2)
currency      String    @default(INR)
icon          String?
color         String?
isDefault     Boolean   @default(false)
userId        String
user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
transactions  Transaction[]
subscriptions Subscription[]
createdAt     DateTime  @default(now())
updatedAt     DateTime  @updatedAt
@@index([userId])
}

model Transaction {
id          String           @id @default(cuid())
type        TransactionType  // INCOME, EXPENSE, TRANSFER
amount      Decimal          @db.Decimal(15, 2)
description String?
date        DateTime         @default(now())
userId      String
user        User             @relation(fields: [userId], references: [id], onDelete: Cascade)
accountId   String
account     Account          @relation(fields: [accountId], references: [id], onDelete: Cascade)
categoryId  String?
category    Category?        @relation(fields: [categoryId], references: [id], onDelete: SetNull)
transferAccountId String?    // For transfers
createdAt   DateTime         @default(now())
updatedAt   DateTime         @updatedAt
@@index([userId, date])
@@index([userId, accountId])
@@index([userId, categoryId])
}

enum AccountType {
CASH
BANK
UPI_WALLET
CREDIT_CARD
OTHER
}

enum TransactionType {
INCOME
EXPENSE
TRANSFER
}

### API Changes
- GET /api/accounts - List accounts (with balance)
- POST /api/accounts - Create account
- PUT /api/accounts/:id - Update account
- DELETE /api/accounts/:id - Delete account (with validation)
- GET /api/categories - List categories (filter by type)
- POST /api/categories - Create category
- PUT /api/categories/:id - Update category
- DELETE /api/categories/:id - Delete category
- GET /api/transactions - List transactions (paginated, filtered)
- POST /api/transactions - Create transaction
- PUT /api/transactions/:id - Update transaction
- DELETE /api/transactions/:id - Delete transaction
- POST /api/transactions/transfer - Create transfer between accounts

### Frontend Changes
- Accounts page with list, add/edit/delete modals
- Categories page with default categories seeded on register
- Transactions page with table, filters, pagination
- Transaction form with type selector (income/expense/transfer)
- Account balance updates automatically on transaction create/update/delete
- Default categories created on user registration

### Testing Requirements
- Unit tests for balance calculation service
- Integration tests for all CRUD endpoints
- Transfer transaction tests (balance updates on both accounts)
- Category default seeding test
- Frontend: Account form validation, transaction filter tests

### Expected Result
- User can create multiple accounts (cash, bank, UPI, credit card)
- User can manage categories (income/expense types)
- User can add/edit/delete transactions with proper balance updates
- Transfers between accounts work correctly
- Paginated transaction list with filters (date, type, account, category)

---

## Phase 3: Dashboard & Income/Expense Management (Week 3-4)

### What will be built
- Dashboard with summary cards and charts
- Dedicated Income page
- Dedicated Expense page
- Income vs Expense chart
- Recent transactions widget

### Files/Modules Created/Modified

**Backend Additions:**
server/src/
routes/
dashboard.js
controllers/
dashboardController.js
services/
dashboardService.js
utils/
dateHelpers.js

**Frontend Additions:**
client/src/
pages/
Dashboard.jsx
Income.jsx
Expenses.jsx
components/
dashboard/
SummaryCards.jsx
IncomeExpenseChart.jsx
SpendingByCategoryChart.jsx
RecentTransactions.jsx
income/
IncomeForm.jsx
IncomeList.jsx
IncomeFilters.jsx
expenses/
ExpenseForm.jsx
ExpenseList.jsx
ExpenseFilters.jsx
services/
dashboardApi.js
hooks/
useDashboard.js
useIncome.js
useExpenses.js

### Database Changes
- No new models (uses existing Transaction, Category, Account)
- Add database indexes for dashboard queries:
@@index([userId, type, date])  // On Transaction
@@index([userId, type])        // On Category

### API Changes
- GET /api/dashboard/summary - Get dashboard summary (balance, totals, budget status)
- GET /api/dashboard/income-expense - Monthly income vs expense data for chart
- GET /api/dashboard/spending-by-category - Category-wise spending for chart
- GET /api/dashboard/recent-transactions - Last 10 transactions
- GET /api/income - List income transactions (filtered)
- GET /api/expenses - List expense transactions (filtered)
- POST /api/income - Quick add income
- POST /api/expenses - Quick add expense

### Frontend Changes
- Dashboard page with:
- 4 summary cards: Balance, Income, Expenses, Savings
- Monthly budget progress bar
- Income vs Expense bar chart (Recharts)
- Spending by category pie chart (Recharts)
- Recent transactions table (5 items)
- Income page: Filterable list, quick add modal, monthly totals
- Expense page: Filterable list, quick add modal, category breakdown
- Responsive grid layout for dashboard cards
- Loading skeletons for charts and cards

### Testing Requirements
- Dashboard service tests (calculations for various date ranges)
- Chart data transformation tests
- API response time tests (<200ms for summary)
- Frontend: Dashboard renders without errors, charts display data
- Empty state tests (new user with no data)

### Expected Result
- Dashboard loads in <1 second with all data
- Income/Expense pages show filtered lists with monthly totals
- Charts render correctly with sample data
- Quick add modals work for income/expense
- Responsive on mobile and desktop

---

## Phase 4: Budget Management (Week 4-5)

### What will be built
- Monthly budget setting (overall and per-category)
- Budget tracking with visual indicators
- Budget alerts (near limit, exceeded)
- Budget vs actual comparison

### Files/Modules Created/Modified

**Backend Additions:**
server/src/
routes/
budgets.js
controllers/
budgetController.js
services/
budgetService.js
utils/
budgetCalculator.js

**Frontend Additions:**
client/src/
pages/
Budgets.jsx
components/
budgets/
BudgetForm.jsx
BudgetList.jsx
BudgetCard.jsx
BudgetProgressBar.jsx
BudgetAlerts.jsx
services/
budgetApi.js
hooks/
useBudgets.js

### Database Changes
model Budget {
id        String   @id @default(cuid())
name      String
amount    Decimal  @db.Decimal(15, 2)
spent     Decimal  @default(0) @db.Decimal(15, 2)
month     Int      // 1-12
year      Int
userId    String
user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
categoryId String?
category  Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
@@unique([userId, categoryId, month, year])
@@index([userId, month, year])
}

### API Changes
- GET /api/budgets - List budgets (filter by month/year)
- POST /api/budgets - Create budget
- PUT /api/budgets/:id - Update budget
- DELETE /api/budgets/:id - Delete budget
- GET /api/budgets/summary - Budget overview with spent/remaining/alerts
- POST /api/budgets/auto-update - Recalculate spent amounts from transactions

### Frontend Changes
- Budgets page with:
- Overall monthly budget card
- Category budget cards with progress bars
- Color-coded progress: Green (<70%), Yellow (70-90%), Red (>90%), Dark Red (>100%)
- Alert banner for exceeded/near-limit budgets
- Add/Edit budget modal with category selector
- Month/year selector
- Dashboard integration: Budget summary card shows overall status

### Testing Requirements
- Budget calculation service tests (edge cases: no transactions, partial month)
- Alert logic tests (thresholds at 70%, 90%, 100%)
- Auto-update endpoint tests
- Frontend: Progress bar colors, alert display, form validation
- Integration: Transaction creation updates budget spent amount

### Expected Result
- User can set overall and category budgets per month
- Visual progress bars with color coding
- Alerts for near-limit and exceeded budgets
- Budget spent amounts auto-update from transactions
- Dashboard shows budget status summary

---

## Phase 5: Savings Goals & Subscriptions (Week 5-6)

### What will be built
- Savings goals with progress tracking
- Subscription/recurring expense management
- Upcoming payment notifications

### Files/Modules Created/Modified

**Backend Additions:**
server/src/
routes/
savingsGoals.js
subscriptions.js
controllers/
savingsGoalController.js
subscriptionController.js
services/
savingsGoalService.js
subscriptionService.js
utils/
goalCalculator.js
subscriptionCalculator.js

**Frontend Additions:**
client/src/
pages/
SavingsGoals.jsx
Subscriptions.jsx
components/
savingsGoals/
GoalForm.jsx
GoalCard.jsx
GoalProgress.jsx
GoalList.jsx
subscriptions/
SubscriptionForm.jsx
SubscriptionCard.jsx
SubscriptionList.jsx
UpcomingPayments.jsx
services/
savingsGoalApi.js
subscriptionApi.js
hooks/
useSavingsGoals.js
useSubscriptions.js

### Database Changes
model SavingsGoal {
id          String   @id @default(cuid())
name        String
targetAmount Decimal @db.Decimal(15, 2)
currentAmount Decimal @default(0) @db.Decimal(15, 2)
targetDate  DateTime
userId      String
user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
accountId   String?
account     Account? @relation(fields: [accountId], references: [id], onDelete: SetNull)
createdAt   DateTime @default(now())
updatedAt   DateTime @updatedAt
@@index([userId])
}

model Subscription {
id            String            @id @default(cuid())
name          String
amount        Decimal           @db.Decimal(15, 2)
billingCycle  BillingCycle      // MONTHLY, QUARTERLY, YEARLY, CUSTOM
customDays    Int?              // For custom cycle
nextPaymentDate DateTime
accountId     String
account       Account           @relation(fields: [accountId], references: [id], onDelete: Cascade)
categoryId    String?
category      Category?         @relation(fields: [categoryId], references: [id], onDelete: SetNull)
userId        String
user          User              @relation(fields: [userId], references: [id], onDelete: Cascade)
isActive      Boolean           @default(true)
createdAt     DateTime          @default(now())
updatedAt     DateTime          @updatedAt
@@index([userId, nextPaymentDate])
}

enum BillingCycle {
MONTHLY
QUARTERLY
YEARLY
CUSTOM
}

### API Changes
- GET /api/savings-goals - List goals with progress %
- POST /api/savings-goals - Create goal
- PUT /api/savings-goals/:id - Update goal (add savings)
- DELETE /api/savings-goals/:id - Delete goal
- POST /api/savings-goals/:id/contribute - Add to goal
- GET /api/subscriptions - List subscriptions
- POST /api/subscriptions - Create subscription
- PUT /api/subscriptions/:id - Update subscription
- DELETE /api/subscriptions/:id - Delete subscription
- GET /api/subscriptions/upcoming - Upcoming payments (next 30 days)
- POST /api/subscriptions/:id/process-payment - Record payment

### Frontend Changes
- Savings Goals page:
- Goal cards with progress ring/bar
- Target date, amount saved, percentage
- Contribute modal (transfers from account)
- Completed goals section
- Subscriptions page:
- Active subscriptions list
- Upcoming payments widget (next 30 days)
- Billing cycle display
- Process payment button (creates expense transaction)
- Dashboard integration: Savings goals summary, upcoming subscriptions

### Testing Requirements
- Goal progress calculation tests
- Subscription next payment date calculation (monthly, quarterly, yearly, custom)
- Contribution updates goal and creates transaction
- Payment processing creates expense transaction
- Frontend: Progress rings, date formatting, contribution flow

### Expected Result
- User can create savings goals with target amount/date
- Visual progress tracking with percentage
- Contributions update goal and account balance
- Subscriptions tracked with next payment dates
- Upcoming payments visible on dashboard and subscriptions page
- Processing subscription payment creates expense transaction

---

## Phase 6: Advanced Analytics & Reports (Week 6-7)

### What will be built
- Comprehensive analytics page
- Multiple chart types
- Date range selectors
- Category deep-dive
- Savings rate tracking
- Export preparation (data aggregation)

### Files/Modules Created/Modified

**Backend Additions:**
server/src/
routes/
analytics.js
controllers/
analyticsController.js
services/
analyticsService.js
utils/
chartDataTransformers.js
periodHelpers.js

**Frontend Additions:**
client/src/
pages/
Analytics.jsx
components/
analytics/
DateRangePicker.jsx
MonthlyTrendChart.jsx
CategoryBreakdownChart.jsx
IncomeExpenseComparison.jsx
SavingsRateChart.jsx
TopCategories.jsx
AnalyticsGrid.jsx
services/
analyticsApi.js
hooks/
useAnalytics.js

### Database Changes
- No new models
- Add materialized view or aggregated queries for performance
- Additional indexes:
// On Transaction
@@index([userId, type, categoryId, date])

### API Changes
- GET /api/analytics/monthly-trends - Income/expense/savings by month
- GET /api/analytics/category-breakdown - Spending by category (with %)
- GET /api/analytics/income-vs-expense - Comparison data
- GET /api/analytics/savings-rate - Monthly savings rate %
- GET /api/analytics/top-categories - Top N spending categories
- GET /api/analytics/summary - Key metrics for date range

All endpoints accept: startDate, endDate, period (month/quarter/year)

### Frontend Changes
- Analytics page with:
- Date range picker (presets: This Month, Last Month, This Quarter, This Year, Custom)
- Monthly trend line chart (income, expense, savings)
- Category breakdown pie/bar chart
- Income vs Expense grouped bar chart
- Savings rate trend line
- Top 5 spending categories table
- Key metrics cards (avg monthly expense, highest category, savings rate)
- All charts responsive and interactive (tooltips, legends)
- Loading states for each chart widget

### Testing Requirements
- Analytics service tests with various date ranges
- Data aggregation accuracy tests
- Chart data transformer tests
- API performance tests (<500ms for complex queries)
- Frontend: Date range changes update all charts, tooltips work

### Expected Result
- Analytics page loads with default This Month data
- All 5+ charts render correctly
- Date range picker updates all charts simultaneously
- Data is accurate and matches transaction records
- Mobile-responsive chart layouts

---

## Phase 7: Polish, Optimization & Testing (Week 7-8)

### What will be built
- UI/UX refinements
- Performance optimizations
- Comprehensive error handling
- Empty states
- Loading states
- Confirmation dialogs
- Accessibility improvements
- End-to-end testing

### Files/Modules Modified

**Backend:**
server/src/
middleware/
rateLimiter.js         # API rate limiting
requestLogger.js       # Request logging
utils/
apiResponse.js         # Standardized responses
pagination.js          # Pagination helpers
tests/
integration/           # API integration tests
unit/                  # Service unit tests

**Frontend:**
client/src/
components/
ui/
EmptyState.jsx
ErrorBoundary.jsx
ConfirmDialog.jsx
Tooltip.jsx
Skeleton.jsx
forms/
Select.jsx
hooks/
useDebounce.js
useLocalStorage.js
useMediaQuery.js
utils/
dateUtils.js
numberUtils.js
tests/
components/            # Component tests
hooks/                 # Hook tests
e2e/                   # Cypress/Playwright tests

### Optimizations
- React.memo for list items
- useCallback/useMemo for expensive computations
- Lazy loading for Analytics, Budgets pages
- Virtualized transaction list (react-window)
- Debounced search (300ms)
- Request deduplication (React Query / SWR)
- Database query optimization (select only needed fields)
- Pagination enforced on all list endpoints

### Error Handling
- Global error boundary
- API error interceptors with user-friendly messages
- Form validation with Zod/Yup
- Retry logic for failed requests
- Offline detection

### Testing Requirements
- Unit tests: 80%+ coverage for services/utils
- Integration tests: All API endpoints
- Component tests: Key UI components
- E2E tests: Critical user flows (register/login/add transaction/view dashboard)
- Performance tests: Dashboard load <1s, Analytics <2s
- Accessibility audit (axe-core)

### Expected Result
- Production-ready application
- All pages have proper loading/empty/error states
- Confirmation dialogs for delete actions
- Keyboard navigation works
- Screen reader compatible
- No console errors/warnings
- Lighthouse score >90
- Test suite passes in CI

---

## Summary Timeline

| Phase | Duration | Focus |
|-------|----------|-------|
| 1 | Week 1-2 | Foundation, Auth, Project Structure |
| 2 | Week 2-3 | Accounts, Categories, Transactions Core |
| 3 | Week 3-4 | Dashboard, Income, Expenses |
| 4 | Week 4-5 | Budget Management |
| 5 | Week 5-6 | Savings Goals, Subscriptions |
| 6 | Week 6-7 | Advanced Analytics |
| 7 | Week 7-8 | Polish, Optimization, Testing |

Total: ~8 weeks

---

## Key Architectural Decisions

1. **Monorepo structure**: /client and /server folders for clear separation
2. **API-first**: All frontend data through REST API, no direct DB access
3. **Service layer**: Business logic in services, controllers thin
4. **Prisma migrations**: Version-controlled schema changes
5. **JWT in httpOnly cookies**: Secure token storage
6. **Recharts for charts**: Lightweight, React-native, tree-shakable
7. **Tailwind CSS**: Utility-first, no custom CSS needed
8. **React Query / SWR**: Server state management (add in Phase 3+)

---

## Questions for Clarification

Before proceeding, I'd like to confirm:

1. **State Management**: Should I use React Query (TanStack Query) or SWR for server state, or keep it simple with useEffect + Context?
2. **Date Handling**: Use date-fns or native JavaScript Date/Intl?
3. **Form Validation**: Zod + React Hook Form, or simpler custom validation?
4. **Testing Framework**: Vitest for unit, Playwright for E2E?
5. **Deployment Target**: Docker, Vercel/Netlify + Railway/Render, or other?
6. **Currency**: Single currency (INR) or multi-currency support from start?
7. **Default Categories**: Should I seed a standard set of categories on user registration?
