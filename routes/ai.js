// routes/ai.js
const express = require('express');
const router = express.Router();
const { Resume, ChatHistory } = require('../models');
const { authenticate, requireSubscription } = require('../middleware/auth');
const { OpenAI } = require('openai');
const { RateLimiter } = require('../utils/rateLimiter');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Rate limiter for AI requests
const aiLimiter = new RateLimiter({
  free: { requests: 5, window: 24 * 60 * 60 * 1000 }, // 5 per day
  pro: { requests: 100, window: 24 * 60 * 60 * 1000 }, // 100 per day
  enterprise: { requests: 1000, window: 24 * 60 * 60 * 1000 }, // 1000 per day
});

// Generate AI suggestions for specific section
router.post('/suggestions', authenticate, requireSubscription('pro'), async (req, res) => {
  try {
    const { resumeId, section, context } = req.body;

    // Check rate limit
    const canProceed = await req.user.incrementAIUsage();
    if (!canProceed) {
      return res.status(429).json({ 
        error: 'AI request limit reached for this month',
        upgradeRequired: true,
      });
    }

    const resume = await Resume.findOne({
      _id: resumeId,
      userId: req.user._id,
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const prompts = {
      summary: `As a professional resume writer, create a compelling professional summary for someone with this background: ${JSON.stringify(context)}. The summary should be 3-4 sentences, highlight key achievements, and include relevant keywords for ATS systems.`,
      
      experience: `Improve this work experience description: "${context}". Make it more impactful by: 1) Starting each point with a strong action verb, 2) Including quantifiable achievements, 3) Highlighting relevant skills, 4) Making it ATS-friendly.`,
      
      skills: `Based on this job role: "${context}", suggest the top 10 most relevant technical skills and top 5 soft skills that should be included in a resume. Format as two lists.`,
      
      general: `Review this resume section and provide 3 specific improvements: ${context}`,
    };

    const prompt = prompts[section] || prompts.general;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an expert resume writer and career coach with 10+ years of experience. You specialize in creating ATS-optimized resumes that get interviews."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const suggestion = completion.choices[0].message.content;

    // Save suggestion to resume
    const suggestionDoc = {
      section,
      suggestion,
      reason: 'AI-generated improvement',
      priority: 'high',
    };

    resume.aiSuggestions.push(suggestionDoc);
    await resume.save();

    res.json({ 
      suggestion,
      suggestionId: resume.aiSuggestions[resume.aiSuggestions.length - 1].id,
    });
  } catch (error) {
    console.error('AI suggestion error:', error);
    res.status(500).json({ error: 'Failed to generate AI suggestion' });
  }
});

// AI Chat
router.post('/chat', authenticate, requireSubscription('pro'), async (req, res) => {
  try {
    const { resumeId, message } = req.body;

    // Check rate limit
    const canProceed = await aiLimiter.check(req.user._id, req.user.subscription.tier);
    if (!canProceed) {
      return res.status(429).json({ 
        error: 'AI chat limit reached. Please try again later.',
        upgradeRequired: req.user.subscription.tier === 'free',
      });
    }

    const resume = await Resume.findOne({
      _id: resumeId,
      userId: req.user._id,
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    // Get or create chat history
    let chatHistory = await ChatHistory.findOne({ 
      resumeId, 
      userId: req.user._id,
      isActive: true,
    });

    if (!chatHistory) {
      chatHistory = new ChatHistory({
        userId: req.user._id,
        resumeId,
        context: {
          resumeVersion: resume.versions.length,
          targetRole: resume.metadata.targetRole,
        },
      });
    }

    // Add user message
    chatHistory.addMessage('user', message);

    // Prepare context for AI
    const systemPrompt = `You are an AI resume assistant helping to improve a resume. 
    Current resume data: ${JSON.stringify(resume.data)}
    Template: ${resume.template}
    Target role: ${resume.metadata.targetRole || 'Not specified'}
    
    Provide helpful, specific advice to improve this resume. Focus on:
    1. Making content more impactful and results-oriented
    2. Ensuring ATS compatibility
    3. Highlighting relevant skills and achievements
    4. Improving clarity and conciseness`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.getContext(10),
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
      temperature: 0.8,
      max_tokens: 600,
    });

    const aiResponse = completion.choices[0].message.content;
    const processingTime = completion.usage?.total_tokens || 0;

    // Add AI response
    chatHistory.addMessage('assistant', aiResponse, {
      model: 'gpt-3.5-turbo',
      tokens: processingTime,
    });

    await chatHistory.save();

    res.json({ 
      response: aiResponse,
      sessionId: chatHistory.sessionId,
    });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// Get chat history
router.get('/chat/history/:resumeId', authenticate, async (req, res) => {
  try {
    const chatHistory = await ChatHistory.findOne({
      resumeId: req.params.resumeId,
      userId: req.user._id,
      isActive: true,
    });

    if (!chatHistory) {
      return res.json({ messages: [] });
    }

    res.json({
      sessionId: chatHistory.sessionId,
      messages: chatHistory.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Apply AI suggestion
router.post('/suggestions/:suggestionId/apply', authenticate, async (req, res) => {
  try {
    const { resumeId } = req.body;

    const resume = await Resume.findOne({
      _id: resumeId,
      userId: req.user._id,
      'aiSuggestions._id': req.params.suggestionId,
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume or suggestion not found' });
    }

    // Mark suggestion as applied
    const suggestion = resume.aiSuggestions.id(req.params.suggestionId);
    suggestion.applied = true;
    suggestion.appliedAt = new Date();

    await resume.save();

    res.json({ message: 'Suggestion applied successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to apply suggestion' });
  }
});

// Generate complete resume from job description
router.post('/generate-resume', authenticate, requireSubscription('pro'), async (req, res) => {
  try {
    const { jobDescription, existingResumeId } = req.body;

    let baseData = {};
    if (existingResumeId) {
      const existingResume = await Resume.findOne({
        _id: existingResumeId,
        userId: req.user._id,
      });
      if (existingResume) {
        baseData = existingResume.data;
      }
    }

    const prompt = `Based on this job description, create a tailored resume:
    
    Job Description: ${jobDescription}
    
    ${baseData.personal ? `Current personal info: ${JSON.stringify(baseData.personal)}` : ''}
    
    Generate a professional resume with:
    1. A compelling summary tailored to this role
    2. Relevant experience entries (if no existing experience, create placeholder entries)
    3. Key skills that match the job requirements
    4. Any additional sections that would strengthen the application
    
    Format the response as JSON with the following structure:
    {
      "summary": "...",
      "experience": [{ "title": "...", "company": "...", "description": "..." }],
      "skills": { "technical": [...], "soft": [...] },
      "suggestions": ["..."]
    }`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an expert resume writer. Generate realistic, professional content that would help someone land this specific job."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 1500,
    });

    const generatedContent = JSON.parse(completion.choices[0].message.content);

    res.json({
      generated: generatedContent,
      message: 'Resume content generated successfully. Review and customize before saving.',
    });
  } catch (error) {
    console.error('Generate resume error:', error);
    res.status(500).json({ error: 'Failed to generate resume content' });
  }
});

module.exports = router;