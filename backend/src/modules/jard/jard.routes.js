const express = require('express');
const router = express.Router();
const {
  getJardList,
  getJardById,
  addJardItem,
  updateJardItem,
  deleteJardItem,
  addMovement,
  deleteMovement,
  getJardForPOS,
  syncWithInventory
} = require('./jard.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.post('/sync', syncWithInventory);
router.get('/pos', getJardForPOS);
router.get('/', getJardList);
router.get('/:id', getJardById);
router.post('/', addJardItem);
router.put('/:id', updateJardItem);
router.delete('/:id', deleteJardItem);

router.post('/movements', addMovement);
router.delete('/movements/:id', deleteMovement);

module.exports = router;
