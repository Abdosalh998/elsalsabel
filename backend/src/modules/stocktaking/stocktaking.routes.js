const express = require('express');
const router = express.Router();
const {
  getStocktakes,
  getStocktakeById,
  createStocktake,
  updateStocktake,
  saveStocktakeCounts,
  settleStocktake,
  deleteStocktake
} = require('./stocktaking.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/', getStocktakes);
router.get('/:id', getStocktakeById);
router.post('/', createStocktake);
router.put('/:id', updateStocktake);
router.put('/:id/counts', saveStocktakeCounts);
router.post('/:id/settle', settleStocktake);
router.delete('/:id', deleteStocktake);

module.exports = router;
