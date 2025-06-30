// models/Analytics.js
const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    index: true,
  },
  sessionId: { 
    type: String, 
    required: true,
    index: true,
  },
  eventType: { 
    type: String, 
    required: true,
    index: true,
  },
  eventCategory: {
    type: String,
    enum: ['user', 'resume', 'ai', 'export', 'subscription', 'error'],
    required: true,
  },
  eventData: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  device: {
    userAgent: String,
    browser: String,
    os: String,
    device: String,
    ip: String,
  },
  location: {
    country: String,
    region: String,
    city: String,
    timezone: String,
  },
  referrer: {
    source: String,
    medium: String,
    campaign: String,
  },
  performance: {
    loadTime: Number,
    renderTime: Number,
    apiResponseTime: Number,
  },
  timestamp: { 
    type: Date, 
    default: Date.now,
    index: true,
  },
});

// Indexes for common queries
analyticsSchema.index({ eventType: 1, timestamp: -1 });
analyticsSchema.index({ userId: 1, timestamp: -1 });
analyticsSchema.index({ eventCategory: 1, timestamp: -1 });

// Compound indexes for analytics queries
analyticsSchema.index({ eventType: 1, 'eventData.resumeId': 1 });
analyticsSchema.index({ userId: 1, eventCategory: 1, timestamp: -1 });

// TTL index to automatically delete old analytics data after 2 years
analyticsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 63072000 });

// Static methods for analytics aggregation
analyticsSchema.statics.getDailyActiveUsers = async function(date = new Date()) {
  const startOfDay = new Date(date.setHours(0, 0, 0, 0));
  const endOfDay = new Date(date.setHours(23, 59, 59, 999));
  
  return await this.distinct('userId', {
    timestamp: { $gte: startOfDay, $lte: endOfDay },
    userId: { $exists: true },
  });
};

analyticsSchema.statics.getEventMetrics = async function(eventType, timeRange = 'day') {
  const now = new Date();
  let startDate;
  
  switch (timeRange) {
    case 'hour':
      startDate = new Date(now - 60 * 60 * 1000);
      break;
    case 'day':
      startDate = new Date(now - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now - 24 * 60 * 60 * 1000);
  }
  
  return await this.aggregate([
    {
      $match: {
        eventType,
        timestamp: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: timeRange === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d',
            date: '$timestamp',
          },
        },
        count: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' },
      },
    },
    {
      $project: {
        _id: 0,
        date: '$_id',
        count: 1,
        uniqueUsers: { $size: '$uniqueUsers' },
      },
    },
    { $sort: { date: 1 } },
  ]);
};

module.exports = mongoose.model('Analytics', analyticsSchema); 