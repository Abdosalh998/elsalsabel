const express = require('express');
const router = express.Router();
const {
  getColoringOrders,
  addColoringOrder,
  returnFromColoring,
  stockColoredProduct,
  updateColoringOrder,
  deleteColoringOrder,
  getInventoryForColoring,
} = require('./coloring.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/inventory-items', getInventoryForColoring);
router.get('/', getColoringOrders);
router.post('/', addColoringOrder);
router.post('/:id/return', returnFromColoring);
router.post('/:id/stock', stockColoredProduct);
router.put('/:id', updateColoringOrder);
router.delete('/:id', deleteColoringOrder);

module.exports = router;

