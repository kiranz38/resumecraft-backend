const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Name is required'],
    trim: true,
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  subscription: {
    tier: { 
      type: String, 
      enum: ['free', 'pro', 'enterprise'], 
      default: 'free',
    },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    validUntil: Date,
    resumeCount: { type: Number, default: 0 },
    aiRequestsThisMonth: { type: Number, default: 0 },
    lastResetDate: { type: Date, default: Date.now },
  },
  profile: {
    avatar: String,
    phone: String,
    location: String,
    timezone: String,
    language: { type: String, default: 'en' },
  },
  preferences: {
    darkMode: { type: Boolean, default: false },
    emailNotifications: { type: Boolean, default: true },
    marketingEmails: { type: Boolean, default: false },
    weeklyTips: { type: Boolean, default: true },
    defaultTemplate: { type: String, default: 'modern' },
  },
  security: {
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: String,
    passwordResetToken: String,
    passwordResetExpires: Date,
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    lastPasswordChange: Date,
  },
  oauth: {
    google: {
      id: String,
      email: String,
    },
    github: {
      id: String,
      username: String,
    },
  },
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date,
  isActive: { type: Boolean, default: true },
  deletedAt: Date,
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ 'subscription.tier': 1 });
userSchema.index({ createdAt: -1 });

// Virtual for full name
userSchema.virtual('displayName').get(function() {
  return this.name || this.email.split('@')[0];
});

// Methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateAuthToken = function() {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { userId: this._id, email: this.email },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '30d' }
  );
};

userSchema.methods.canCreateResume = async function() {
  if (this.subscription.tier !== 'free') return true;
  
  const Resume = mongoose.model('Resume');
  const count = await Resume.countDocuments({ userId: this._id });
  return count < 1;
};

userSchema.methods.incrementAIUsage = async function() {
  const now = new Date();
  const lastReset = new Date(this.subscription.lastResetDate);
  
  // Reset monthly counter if needed
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    this.subscription.aiRequestsThisMonth = 0;
    this.subscription.lastResetDate = now;
  }
  
  this.subscription.aiRequestsThisMonth += 1;
  await this.save();
  
  // Check limits
  const limits = {
    free: 5,
    pro: 100,
    enterprise: Infinity
  };
  
  return this.subscription.aiRequestsThisMonth <= (limits[this.subscription.tier] || 5);
};

// Pre-save middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    this.security.lastPasswordChange = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('User', userSchema);