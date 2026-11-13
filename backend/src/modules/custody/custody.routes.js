const express = require('express');
const router = express.Router();
const {
  getCustodies,
  getPersonsSummary,
  getPersonStatement,
  getPersonBalance,
  addCustody,
  updateCustody,
  deleteCustody,
  deletePersonCustodies,
  addDeduction,
  addCustodyTransfer,
  getCustodyTransfers,
  deleteCustodyTransfer,
} = require('./custody.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/persons', getPersonsSummary);
router.get('/person-balance', getPersonBalance);
router.get('/persons/:personName/statement', getPersonStatement);
router.delete('/persons/:personName', deletePersonCustodies);

router.post('/deduction', addDeduction);
router.get('/transfers', getCustodyTransfers);
router.post('/transfer', addCustodyTransfer);
router.delete('/transfers/:id', deleteCustodyTransfer);

router.get('/', getCustodies);
router.post('/', addCustody);
router.put('/:id', updateCustody);
router.delete('/:id', deleteCustody);

module.exports = router;

