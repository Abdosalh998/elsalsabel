require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { errorHandler } = require('./middleware/auth');
const runMigrations = require('./db/migrations/schema');
const runSeeds = require('./db/seeds/seed');

// Route imports
const authRoutes = require('./modules/auth/auth.routes');
const customersRoutes = require('./modules/customers/customers.routes');
const balancesRoutes = require('./modules/balances/balances.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const salesRoutes = require('./modules/sales/sales.routes');
const expensesRoutes = require('./modules/expenses/expenses.routes');
const purchasesRoutes = require('./modules/purchases/purchases.routes');
const treasuryRoutes = require('./modules/treasury/treasury.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const transfersRoutes = require('./modules/transfers/transfers.routes');
const returnsRoutes = require('./modules/returns/returns.routes');
const coloringRoutes = require('./modules/coloring/coloring.routes');
const custodyRoutes = require('./modules/custody/custody.routes');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security & Middleware ──────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Static Assets (logo) ──────────────────────────────────────────────────
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// ─── API Routes ────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/balances', balancesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/treasury', treasuryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/coloring', coloringRoutes);
app.use('/api/custody', custodyRoutes);

// ─── Health Check ──────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'السلسبيل - نظام إدارة الشركة يعمل بنجاح', timestamp: new Date() });
});

// ─── Global Error Handler ──────────────────────────────────────────────────
app.use(errorHandler);

// ─── Boot ──────────────────────────────────────────────────────────────────
async function boot() {
  try {
    await runMigrations();
    await runSeeds();
    app.listen(PORT, () => {
      console.log(`🚀 السلسبيل Backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

boot();
