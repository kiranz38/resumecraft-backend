// middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// General API rate limiter
const apiLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:api:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for auth endpoints
const authLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:auth:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  skipSuccessfulRequests: true,
  message: 'Too many authentication attempts, please try again later.',
});

// AI endpoint rate limiter
const aiLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:ai:',
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req) => {
    // Dynamic limit based on subscription
    const limits = {
      free: 5,
      pro: 50,
      enterprise: 500,
    };
    return limits[req.user?.subscription?.tier] || 5;
  },
  keyGenerator: (req) => req.user?._id || req.ip,
  message: 'AI request limit exceeded. Please upgrade your plan for more requests.',
});

module.exports = {
  apiLimiter,
  authLimiter,
  aiLimiter,
};