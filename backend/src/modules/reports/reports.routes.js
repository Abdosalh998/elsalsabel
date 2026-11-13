const express = require('express');
const router = express.Router();
const {
  getComprehensiveReport,
  getSalesReport,
  getPurchasesReport,
  getInventoryReport,
  getTreasuryReport,
  getExpensesReport,
  getCustomersReport,
  getColoringReport,
  getCustodyReport
} = require('./reports.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/comprehensive', getComprehensiveReport);
router.get('/sales', getSalesReport);
router.get('/purchases', getPurchasesReport);
router.get('/inventory', getInventoryReport);
router.get('/treasury', getTreasuryReport);
router.get('/expenses', getExpensesReport);
router.get('/customers', getCustomersReport);
router.get('/coloring', getColoringReport);
router.get('/custody', getCustodyReport);

module.exports = router;
