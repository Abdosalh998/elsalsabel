const express = require('express');
const router = express.Router();
const { getPurchases, addPurchase, updatePurchase, deletePurchase, getUniqueValues, transferToInventory } = require('./purchases.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/unique', getUniqueValues);
router.get('/', getPurchases);
router.post('/', addPurchase);
router.post('/:id/transfer-to-inventory', transferToInventory);
router.put('/:id', updatePurchase);
router.delete('/:id', deletePurchase);

module.exports = router;
