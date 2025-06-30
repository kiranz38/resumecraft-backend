const calculateATSScore = async (resume) => {
  const scores = {
    format: 0,
    keywords: 0,
    structure: 0,
    content: 0,
  };
  
  const analysis = {
    strengths: [],
    weaknesses: [],
    missingElements: [],
  };
  
  const suggestions = [];

  // Format Score (25 points)
  if (resume.data.personal.name) scores.format += 5;
  if (resume.data.personal.email) scores.format += 5;
  if (resume.data.personal.phone) scores.format += 5;
  if (resume.data.summary) scores.format += 10;

  // Structure Score (25 points)
  if (resume.data.experience && resume.data.experience.length > 0) {
    scores.structure += 10;
    if (resume.data.experience.length >= 2) scores.structure += 5;
  } else {
    analysis.missingElements.push('Work experience');
    suggestions.push('Add at least 2-3 relevant work experiences');
  }

  if (resume.data.education && resume.data.education.length > 0) {
    scores.structure += 10;
  } else {
    analysis.missingElements.push('Education');
    suggestions.push('Add your educational background');
  }

  // Content Score (25 points)
  let totalWords = 0;
  let hasActionVerbs = false;
  let hasNumbers = false;

  // Check summary
  if (resume.data.summary) {
    totalWords += resume.data.summary.split(' ').length;
    if (resume.data.summary.length > 50 && resume.data.summary.length < 200) {
      scores.content += 5;
      analysis.strengths.push('Good summary length');
    }
  }

  // Check experience descriptions
  resume.data.experience?.forEach(exp => {
    if (exp.description) {
      totalWords += exp.description.split(' ').length;
      
      // Check for action verbs
      const actionVerbs = ['managed', 'led', 'developed', 'created', 'improved', 'increased', 'decreased', 'implemented'];
      if (actionVerbs.some(verb => exp.description.toLowerCase().includes(verb))) {
        hasActionVerbs = true;
      }
      
      // Check for numbers
      if (/\d+/.test(exp.description)) {
        hasNumbers = true;
      }
    }
  });

  if (hasActionVerbs) {
    scores.content += 10;
    analysis.strengths.push('Uses strong action verbs');
  } else {
    suggestions.push('Start bullet points with action verbs like "Managed", "Developed", "Led"');
  }

  if (hasNumbers) {
    scores.content += 10;
    analysis.strengths.push('Includes quantifiable achievements');
  } else {
    suggestions.push('Add numbers and metrics to quantify your achievements');
  }

  // Keywords Score (25 points)
  if (resume.data.skills?.technical?.length > 5) {
    scores.keywords += 15;
    analysis.strengths.push('Good technical skills section');
  } else {
    suggestions.push('Add more relevant technical skills (aim for 8-12)');
  }

  if (resume.metadata?.keywords?.length > 0) {
    scores.keywords += 10;
  }

  // Calculate total score
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  // Add general suggestions based on score
  if (totalScore < 50) {
    suggestions.unshift('Your resume needs significant improvements to pass ATS systems');
  } else if (totalScore < 75) {
    suggestions.unshift('Your resume is good but could be optimized further for ATS');
  } else {
    analysis.strengths.unshift('Your resume is well-optimized for ATS systems');
  }

  return {
    score: totalScore,
    analysis,
    suggestions,
    breakdown: scores,
  };
};

module.exports = { calculateATSScore };
