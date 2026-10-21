const express = require('express');
const router = express.Router();
const { getSales, addSale, updateSale, deleteSale } = require('./sales.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/', getSales);
router.post('/', addSale);
router.put('/:id', updateSale);
router.delete('/:id', deleteSale);

module.exports = router;
