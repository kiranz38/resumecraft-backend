// routes/index.js
const express = require('express');
const authRoutes = require('./auth');
const resumeRoutes = require('./resume');
const aiRoutes = require('./ai');
const subscriptionRoutes = require('./subscription');
const analyticsRoutes = require('./analytics');
const userRoutes = require('./user');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/resumes', resumeRoutes);
router.use('/ai', aiRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/users', userRoutes);

module.exports = router;