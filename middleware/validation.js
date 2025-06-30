const { validationResult } = require('express-validator');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const extractedErrors = {};
    errors.array().forEach(err => {
      if (!extractedErrors[err.param]) {
        extractedErrors[err.param] = err.msg;
      }
    });

    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: extractedErrors,
    });
  }
  
  next();
};

module.exports = { validateRequest };