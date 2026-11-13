const express = require('express');
const router = express.Router();
const {
  getPaymentTypes,
  addPaymentType,
  getTreasury,
  addTreasury,
  updateTreasury,
  deleteTreasury,
  getChannelTransfers,
  addChannelTransfer,
  deleteChannelTransfer,
} = require('./treasury.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/payment-types', getPaymentTypes);
router.post('/payment-types', addPaymentType);

router.get('/channel-transfers', getChannelTransfers);
router.post('/channel-transfers', addChannelTransfer);
router.delete('/channel-transfers/:id', deleteChannelTransfer);

router.get('/', getTreasury);
router.post('/', addTreasury);
router.put('/:id', updateTreasury);
router.delete('/:id', deleteTreasury);

module.exports = router;
