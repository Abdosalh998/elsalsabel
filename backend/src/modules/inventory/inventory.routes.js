const express = require('express');
const router = express.Router();
const { 
  getInventory, 
  addInventory, 
  updateInventory, 
  deleteInventory, 
  getUniqueValues,
  getInventorySupplies,
  getGroupedInventory
} = require('./inventory.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/unique', getUniqueValues);
router.get('/supplies', getInventorySupplies);
router.get('/grouped', getGroupedInventory);
router.get('/', getInventory);
router.post('/', addInventory);
router.put('/:id', updateInventory);
router.delete('/:id', deleteInventory);

module.exports = router;
