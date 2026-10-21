const express = require('express');
const router = express.Router();
const { getExpenses, addExpense, updateExpense, deleteExpense, getUniqueValues } = require('./expenses.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/unique', getUniqueValues);
router.get('/', getExpenses);
router.post('/', addExpense);
router.put('/:id', updateExpense);
router.delete('/:id', deleteExpense);

module.exports = router;
