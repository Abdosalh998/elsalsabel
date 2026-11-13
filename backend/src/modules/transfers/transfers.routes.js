const express = require('express');
const router = express.Router();
const {
  getTransfers,
  getTransferById,
  createTransfer,
  confirmTransfer,
  rejectTransfer,
  cancelTransfer,
  deleteTransfer,
  getAvailableBranches,
  getAvailableInventory
} = require('./transfers.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/', getTransfers);
router.get('/available-branches', getAvailableBranches);
router.get('/available-inventory', getAvailableInventory);
router.get('/:id', getTransferById);
router.post('/', createTransfer);
router.post('/:id/confirm', confirmTransfer);
router.post('/:id/reject', rejectTransfer);
router.post('/:id/cancel', cancelTransfer);
router.delete('/:id', deleteTransfer);

module.exports = router;
