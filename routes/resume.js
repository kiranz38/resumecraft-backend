// routes/resume.js
const express = require('express');
const router = express.Router();
const { Resume, Analytics } = require('../models');
const { authenticate, requireSubscription } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { body, param } = require('express-validator');
const { generatePDF, generateDOCX } = require('../utils/export');
const { calculateATSScore } = require('../utils/ats');

// Validation rules
const resumeValidation = [
  body('title').optional().trim().isLength({ max: 100 }),
  body('template').optional().isIn(['modern', 'professional', 'creative', 'minimal', 'executive', 'technical']),
];

// Create resume
router.post('/', authenticate, resumeValidation, validateRequest, async (req, res) => {
  try {
    const { title, template, data } = req.body;

    // Check resume limit for free users
    const canCreate = await req.user.canCreateResume();
    if (!canCreate) {
      return res.status(403).json({ 
        error: 'Free users can only create 1 resume. Upgrade to Pro for unlimited resumes.',
        upgradeRequired: true,
      });
    }

    const resume = new Resume({
      userId: req.user._id,
      title: title || `Resume - ${new Date().toLocaleDateString()}`,
      template,
      data: data || {},
    });

    await resume.save();

    // Track event
    await Analytics.create({
      userId: req.user._id,
      sessionId: req.sessionID,
      eventType: 'resume_created',
      eventCategory: 'resume',
      eventData: {
        resumeId: resume._id,
        template: resume.template,
      },
    });

    res.status(201).json(resume);
  } catch (error) {
    console.error('Resume creation error:', error);
    res.status(500).json({ error: 'Failed to create resume' });
  }
});

// Get all resumes
router.get('/', authenticate, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      sort = '-updatedAt',
      archived = false,
      search = '',
    } = req.query;

    const query = { 
      userId: req.user._id,
      isArchived: archived === 'true',
    };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    const resumes = await Resume.find(query)
      .select('title template createdAt updatedAt metadata.completeness tags sharing.isPublic')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Resume.countDocuments(query);

    res.json({
      resumes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get resumes error:', error);
    res.status(500).json({ error: 'Failed to fetch resumes' });
  }
});

// Get single resume
router.get('/:id', authenticate, async (req, res) => {
  try {
    const resume = await Resume.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    // Track view
    await Analytics.create({
      userId: req.user._id,
      sessionId: req.sessionID,
      eventType: 'resume_viewed',
      eventCategory: 'resume',
      eventData: { resumeId: resume._id },
    });

    res.json(resume);
  } catch (error) {
    console.error('Get resume error:', error);
    res.status(500).json({ error: 'Failed to fetch resume' });
  }
});

// Update resume
router.put('/:id', authenticate, resumeValidation, validateRequest, async (req, res) => {
  try {
    const { title, template, data } = req.body;

    const resume = await Resume.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    // Create version before updating (Pro+ feature)
    if (req.user.subscription.tier !== 'free') {
      await resume.createVersion('Auto-save before update');
    }

    // Update fields
    if (title !== undefined) resume.title = title;
    if (template !== undefined) resume.template = template;
    if (data !== undefined) resume.data = { ...resume.data, ...data };

    await resume.save();

    res.json(resume);
  } catch (error) {
    console.error('Update resume error:', error);
    res.status(500).json({ error: 'Failed to update resume' });
  }
});

// Delete resume
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const resume = await Resume.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    // Track deletion
    await Analytics.create({
      userId: req.user._id,
      sessionId: req.sessionID,
      eventType: 'resume_deleted',
      eventCategory: 'resume',
      eventData: { resumeId: resume._id },
    });

    res.json({ message: 'Resume deleted successfully' });
  } catch (error) {
    console.error('Delete resume error:', error);
    res.status(500).json({ error: 'Failed to delete resume' });
  }
});

// Archive/Unarchive resume
router.patch('/:id/archive', authenticate, async (req, res) => {
  try {
    const { archive = true } = req.body;

    const resume = await Resume.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { 
        isArchived: archive,
        archivedAt: archive ? new Date() : null,
      },
      { new: true }
    );

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    res.json({ message: `Resume ${archive ? 'archived' : 'unarchived'} successfully` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update resume' });
  }
});

// Duplicate resume
router.post('/:id/duplicate', authenticate, async (req, res) => {
  try {
    const original = await Resume.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!original) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    // Check resume limit
    const canCreate = await req.user.canCreateResume();
    if (!canCreate) {
      return res.status(403).json({ 
        error: 'Free users can only create 1 resume. Upgrade to Pro for unlimited resumes.',
        upgradeRequired: true,
      });
    }

    const duplicate = new Resume({
      userId: req.user._id,
      title: `${original.title} (Copy)`,
      template: original.template,
      data: JSON.parse(JSON.stringify(original.data)), // Deep clone
    });

    await duplicate.save();

    res.status(201).json(duplicate);
  } catch (error) {
    res.status(500).json({ error: 'Failed to duplicate resume' });
  }
});

// Export resume
router.post('/:id/export', authenticate, async (req, res) => {
  try {
    const { format = 'pdf', template } = req.body;

    const resume = await Resume.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    // Check format availability
    if (req.user.subscription.tier === 'free' && format === 'docx') {
      return res.status(403).json({ 
        error: 'DOCX export is only available for Pro users',
        upgradeRequired: true,
      });
    }

    let fileBuffer;
    let contentType;
    let filename;

    switch (format) {
      case 'pdf':
        fileBuffer = await generatePDF(resume, template || resume.template, {
          watermark: req.user.subscription.tier === 'free',
        });
        contentType = 'application/pdf';
        filename = `${resume.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
        break;
      
      case 'docx':
        fileBuffer = await generateDOCX(resume, template || resume.template);
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        filename = `${resume.title.replace(/[^a-z0-9]/gi, '_')}.docx`;
        break;
      
      case 'txt':
        fileBuffer = Buffer.from(generatePlainText(resume), 'utf-8');
        contentType = 'text/plain';
        filename = `${resume.title.replace(/[^a-z0-9]/gi, '_')}.txt`;
        break;
      
      default:
        return res.status(400).json({ error: 'Invalid export format' });
    }

    // Track export
    resume.exports.push({ format, template: template || resume.template });
    await resume.save();

    await Analytics.create({
      userId: req.user._id,
      sessionId: req.sessionID,
      eventType: 'resume_exported',
      eventCategory: 'export',
      eventData: { 
        resumeId: resume._id,
        format,
        template: template || resume.template,
      },
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fileBuffer);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export resume' });
  }
});

// Get ATS score
router.get('/:id/ats-score', authenticate, requireSubscription('pro'), async (req, res) => {
  try {
    const resume = await Resume.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const { score, analysis, suggestions } = await calculateATSScore(resume);

    // Update resume metadata
    resume.metadata.atsScore = score;
    await resume.save();

    res.json({ score, analysis, suggestions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate ATS score' });
  }
});

// Share resume
router.post('/:id/share', authenticate, async (req, res) => {
  try {
    const { isPublic = true, password, expiryDays = 30 } = req.body;

    const resume = await Resume.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    resume.sharing.isPublic = isPublic;
    if (password) resume.sharing.password = password; // Hash this in production
    
    const shareLink = resume.generateShareLink();
    await resume.save();

    const shareUrl = `${process.env.FRONTEND_URL}/shared/${shareLink}`;

    res.json({ 
      shareUrl,
      expiresAt: resume.sharing.shareExpiry,
      isPasswordProtected: !!password,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to share resume' });
  }
});

// Get shared resume (public route)
router.get('/shared/:shareLink', async (req, res) => {
  try {
    const { shareLink } = req.params;
    const { password } = req.query;

    const resume = await Resume.findOne({
      'sharing.shareLink': shareLink,
      'sharing.isPublic': true,
    }).select('-aiSuggestions -versions');

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found or link expired' });
    }

    // Check expiry
    if (resume.sharing.shareExpiry < new Date()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    // Check password
    if (resume.sharing.password && resume.sharing.password !== password) {
      return res.status(401).json({ error: 'Invalid password', passwordRequired: true });
    }

    // Track view
    resume.sharing.views += 1;
    resume.sharing.lastViewed = new Date();
    await resume.save();

    res.json({
      title: resume.title,
      template: resume.template,
      data: resume.data,
      allowDownload: resume.sharing.allowDownload,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shared resume' });
  }
});

// Helper function for plain text export
function generatePlainText(resume) {
  let text = '';
  const data = resume.data;

  // Personal info
  if (data.personal.name) text += `${data.personal.name}\n`;
  if (data.personal.email) text += `Email: ${data.personal.email}\n`;
  if (data.personal.phone) text += `Phone: ${data.personal.phone}\n`;
  if (data.personal.location) text += `Location: ${data.personal.location}\n`;
  text += '\n';

  // Summary
  if (data.summary) {
    text += 'PROFESSIONAL SUMMARY\n';
    text += `${data.summary}\n\n`;
  }

  // Experience
  if (data.experience && data.experience.length > 0) {
    text += 'EXPERIENCE\n';
    data.experience.forEach(exp => {
      text += `${exp.title} at ${exp.company}\n`;
      text += `${exp.duration}\n`;
      if (exp.description) text += `${exp.description}\n`;
      text += '\n';
    });
  }

  // Add other sections...

  return text;
}

module.exports = router;