const express = require('express');
const router = express.Router();
const {
  getPurchases, addPurchase, updatePurchase, updatePurchasePrice,
  deletePurchase, getUniqueValues, transferPurchaseToInventory,
} = require('./purchases.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/unique', getUniqueValues);
router.get('/', getPurchases);
router.post('/', addPurchase);
router.post('/:id/transfer', transferPurchaseToInventory);
router.put('/:id', updatePurchase);
router.patch('/:id/price', updatePurchasePrice);
router.delete('/:id', deletePurchase);

module.exports = router;
