// middleware/auth.js
const jwt = require('jsonwebtoken');
const { User } = require('../models');

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      throw new Error('No token provided');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(401).json({ 
      error: 'Please authenticate',
      code: 'UNAUTHORIZED',
    });
  }
};

const requireSubscription = (minTier) => {
  return (req, res, next) => {
    const tierLevels = { free: 0, pro: 1, enterprise: 2 };
    const userTierLevel = tierLevels[req.user.subscription.tier] || 0;
    const requiredLevel = tierLevels[minTier] || 0;

    if (userTierLevel < requiredLevel) {
      return res.status(403).json({ 
        error: `This feature requires ${minTier} subscription or higher`,
        code: 'SUBSCRIPTION_REQUIRED',
        upgradeRequired: true,
        currentTier: req.user.subscription.tier,
        requiredTier: minTier,
      });
    }
    next();
  };
};

const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
      });
    }
    next();
  };
};

module.exports = {
  authenticate,
  requireSubscription,
  requireRole,
};