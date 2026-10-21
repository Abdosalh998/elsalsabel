const express = require('express');
const router = express.Router();
const { login, getMe } = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');

// POST /api/auth/login
router.post('/login', login);

// GET /api/auth/me  (protected)
router.get('/me', authenticate, getMe);

module.exports = router;
