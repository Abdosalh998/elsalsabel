const express = require('express');
const router = express.Router();
const { getBalances, addBalance, updateBalance, deleteBalance } = require('./balances.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/', getBalances);
router.post('/', addBalance);
router.put('/:id', updateBalance);
router.delete('/:id', deleteBalance);

module.exports = router;
