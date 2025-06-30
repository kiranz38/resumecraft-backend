// models/ChatHistory.js
const mongoose = require('mongoose');

const chatHistorySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true,
  },
  resumeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Resume', 
    required: true,
    index: true,
  },
  sessionId: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString(),
  },
  messages: [{
    id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    role: { 
      type: String, 
      enum: ['user', 'assistant', 'system'], 
      required: true,
    },
    content: { 
      type: String, 
      required: true,
      maxlength: [5000, 'Message content too long'],
    },
    metadata: {
      model: { type: String, default: 'gpt-3.5-turbo' },
      tokens: Number,
      processingTime: Number,
      error: String,
    },
    timestamp: { type: Date, default: Date.now },
  }],
  context: {
    resumeVersion: Number,
    targetRole: String,
    improvementGoals: [String],
  },
  summary: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastMessageAt: { type: Date, default: Date.now },
});

// Indexes
chatHistorySchema.index({ userId: 1, resumeId: 1 });
chatHistorySchema.index({ sessionId: 1 });
chatHistorySchema.index({ lastMessageAt: -1 });

// Methods
chatHistorySchema.methods.addMessage = function(role, content, metadata = {}) {
  this.messages.push({
    role,
    content,
    metadata,
  });
  this.lastMessageAt = new Date();
  return this.messages[this.messages.length - 1];
};

chatHistorySchema.methods.getContext = function(messageCount = 10) {
  return this.messages.slice(-messageCount).map(msg => ({
    role: msg.role,
    content: msg.content,
  }));
};

module.exports = mongoose.model('ChatHistory', chatHistorySchema);