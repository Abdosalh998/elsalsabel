const express = require('express');
const router = express.Router();
const { getBalances, addBalance, updateBalance, deleteBalance, getCustomerSummary, getCustomerTransactions } = require('./balances.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

// Card View endpoints (Phase 2)
router.get('/customer-summary', getCustomerSummary);
router.get('/customer/:customerId/transactions', getCustomerTransactions);

// Standard CRUD
router.get('/', getBalances);
router.post('/', addBalance);
router.put('/:id', updateBalance);
router.delete('/:id', deleteBalance);

module.exports = router;
