// models/Resume.js
const mongoose = require('mongoose');

const resumeSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true,
  },
  title: { 
    type: String, 
    default: 'Untitled Resume',
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters'],
  },
  slug: {
    type: String,
    unique: true,
    sparse: true,
  },
  template: { 
    type: String, 
    enum: ['modern', 'professional', 'creative', 'minimal', 'executive', 'technical'],
    default: 'modern',
  },
  data: {
    personal: {
      name: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
      location: { type: String, trim: true },
      linkedin: { type: String, trim: true },
      github: { type: String, trim: true },
      website: { type: String, trim: true },
      portfolio: { type: String, trim: true },
    },
    summary: { 
      type: String, 
      maxlength: [500, 'Summary cannot exceed 500 characters'],
    },
    experience: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      title: String,
      company: String,
      location: String,
      startDate: Date,
      endDate: Date,
      current: { type: Boolean, default: false },
      description: String,
      achievements: [String],
      technologies: [String],
    }],
    education: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      degree: String,
      field: String,
      institution: String,
      location: String,
      startDate: Date,
      endDate: Date,
      gpa: String,
      achievements: [String],
      relevantCourses: [String],
    }],
    skills: {
      technical: [String],
      soft: [String],
      languages: [{
        language: String,
        proficiency: { 
          type: String, 
          enum: ['native', 'fluent', 'advanced', 'intermediate', 'beginner'],
        },
      }],
      tools: [String],
    },
    projects: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      name: String,
      role: String,
      description: String,
      highlights: [String],
      technologies: [String],
      link: String,
      github: String,
      startDate: Date,
      endDate: Date,
    }],
    certifications: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      name: String,
      issuer: String,
      issueDate: Date,
      expiryDate: Date,
      credentialId: String,
      link: String,
    }],
    awards: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      title: String,
      issuer: String,
      date: Date,
      description: String,
    }],
    publications: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      title: String,
      journal: String,
      date: Date,
      link: String,
      description: String,
    }],
    volunteer: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      organization: String,
      role: String,
      cause: String,
      startDate: Date,
      endDate: Date,
      description: String,
      impact: String,
    }],
    interests: [String],
    references: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      name: String,
      title: String,
      company: String,
      email: String,
      phone: String,
      relationship: String,
    }],
  },
  metadata: {
    keywords: [String],
    targetRole: String,
    targetCompany: String,
    industry: String,
    experienceLevel: {
      type: String,
      enum: ['entry', 'junior', 'mid', 'senior', 'executive'],
    },
    atsScore: Number,
    completeness: { type: Number, default: 0 },
  },
  aiSuggestions: [{
    id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    section: String,
    field: String,
    suggestion: String,
    reason: String,
    priority: { type: String, enum: ['low', 'medium', 'high'] },
    applied: { type: Boolean, default: false },
    appliedAt: Date,
    createdAt: { type: Date, default: Date.now },
  }],
  versions: [{
    versionNumber: { type: Number, required: true },
    title: String,
    data: Object,
    template: String,
    createdAt: { type: Date, default: Date.now },
    note: String,
  }],
  sharing: {
    isPublic: { type: Boolean, default: false },
    shareLink: String,
    shareExpiry: Date,
    password: String,
    views: { type: Number, default: 0 },
    lastViewed: Date,
    allowDownload: { type: Boolean, default: true },
  },
  exports: [{
    format: { type: String, enum: ['pdf', 'docx', 'txt', 'json'] },
    exportedAt: { type: Date, default: Date.now },
    template: String,
  }],
  tags: [String],
  notes: String,
  isArchived: { type: Boolean, default: false },
  archivedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

// Indexes
resumeSchema.index({ userId: 1, createdAt: -1 });
resumeSchema.index({ slug: 1 });
resumeSchema.index({ 'sharing.isPublic': 1 });
resumeSchema.index({ tags: 1 });
resumeSchema.index({ isArchived: 1 });

// Virtual for duration calculation
resumeSchema.virtual('experience.duration').get(function() {
  return this.data.experience.map(exp => {
    if (!exp.startDate) return null;
    const end = exp.endDate || new Date();
    const months = Math.floor((end - exp.startDate) / (1000 * 60 * 60 * 24 * 30));
    return {
      months,
      years: Math.floor(months / 12),
      remainingMonths: months % 12,
    };
  });
});

// Methods
resumeSchema.methods.generateShareLink = function() {
  const crypto = require('crypto');
  this.sharing.shareLink = crypto.randomBytes(32).toString('hex');
  this.sharing.shareExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  return this.sharing.shareLink;
};

resumeSchema.methods.calculateCompleteness = function() {
  let score = 0;
  const weights = {
    personal: 15,
    summary: 10,
    experience: 25,
    education: 15,
    skills: 15,
    projects: 10,
    certifications: 5,
    awards: 5,
  };
  
  // Check personal info
  if (this.data.personal.name && this.data.personal.email) score += weights.personal;
  
  // Check summary
  if (this.data.summary && this.data.summary.length > 50) score += weights.summary;
  
  // Check experience
  if (this.data.experience.length > 0) {
    const expScore = Math.min(this.data.experience.length * 5, weights.experience);
    score += expScore;
  }
  
  // Check education
  if (this.data.education.length > 0) score += weights.education;
  
  // Check skills
  if (this.data.skills.technical.length > 3 || this.data.skills.soft.length > 3) {
    score += weights.skills;
  }
  
  // Check projects
  if (this.data.projects.length > 0) score += weights.projects;
  
  // Check certifications
  if (this.data.certifications.length > 0) score += weights.certifications;
  
  // Check awards
  if (this.data.awards.length > 0) score += weights.awards;
  
  this.metadata.completeness = Math.round(score);
  return score;
};

resumeSchema.methods.createVersion = async function(note = '') {
  const versionNumber = this.versions.length + 1;
  this.versions.push({
    versionNumber,
    title: this.title,
    data: JSON.parse(JSON.stringify(this.data)), // Deep clone
    template: this.template,
    note,
  });
  
  // Keep only last 10 versions for non-enterprise users
  const user = await mongoose.model('User').findById(this.userId);
  if (user.subscription.tier !== 'enterprise' && this.versions.length > 10) {
    this.versions = this.versions.slice(-10);
  }
  
  return versionNumber;
};

// Pre-save middleware
resumeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  this.calculateCompleteness();
  
  // Generate slug if needed
  if (!this.slug && this.title !== 'Untitled Resume') {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + 
      '-' + 
      Date.now().toString(36);
  }
  
  next();
});

module.exports = mongoose.model('Resume', resumeSchema);