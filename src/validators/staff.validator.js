const Joi = require('joi');
const { ObjectId } = require('mongoose').Types;

const validateReservationCheckIn = (req, res, next) => {
  const schema = Joi.object({
    code: Joi.string().uppercase().required(),
  });
  const { error } = schema.validate(req.params);
  if (error) return res.status(400).json({ message: error.details[0].message });

  const bodySchema = Joi.object({
    building: Joi.string().custom((value, helpers) => {
      if (!ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'ObjectId validation').required(),
    gate: Joi.string().required(),
    vehicleType: Joi.string().required(),
  });
  const { error: bodyError } = bodySchema.validate(req.body);
  if (bodyError) return res.status(400).json({ message: bodyError.details[0].message });

  next();
};

const validateReservationExpire = (req, res, next) => {
  const schema = Joi.object({
    id: Joi.string().custom((value, helpers) => {
      if (!ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'ObjectId validation').required(),
  });
  const { error } = schema.validate(req.params);
  if (error) return res.status(400).json({ message: error.details[0].message });
  next();
};

const validateWalletTransaction = (req, res, next) => {
  const schema = Joi.object({
    sessionId: Joi.string().custom((value, helpers) => {
      if (!ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'ObjectId validation').required(),
    userId: Joi.string().custom((value, helpers) => {
      if (!ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'ObjectId validation').required(),
    amount: Joi.number().positive().required(),
  });
  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });
  next();
};

const validateIncidentReport = (req, res, next) => {
  const schema = Joi.object({
    building: Joi.string().custom((value, helpers) => {
      if (!ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'ObjectId validation').required(),
    title: Joi.string().required(),
    description: Joi.string().required(),
    severity: Joi.string().valid('low', 'medium', 'high').required(),
  });
  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });
  next();
};

module.exports = {
  validateReservationCheckIn,
  validateReservationExpire,
  validateWalletTransaction,
  validateIncidentReport,
};