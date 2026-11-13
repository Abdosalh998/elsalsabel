const express = require('express');
const router = express.Router();
const {
  getReturns,
  getUniqueValues,
  getReturnById,
  addReturn,
  deleteReturn
} = require('./returns.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/unique-values', getUniqueValues);
router.get('/', getReturns);
router.get('/:id', getReturnById);
router.post('/', addReturn);
router.delete('/:id', deleteReturn);

module.exports = router;
