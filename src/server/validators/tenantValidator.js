const Joi = require('joi');

const tenantSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name cannot exceed 100 characters',
      'any.required': 'Name is required'
    }),

  domain: Joi.string()
    .domain()
    .required()
    .messages({
      'string.domain': 'Invalid domain format',
      'any.required': 'Domain is required'
    }),

  settings: Joi.object({
    theme: Joi.object({
      primary: Joi.string().regex(/^#[0-9A-Fa-f]{6}$/),
      secondary: Joi.string().regex(/^#[0-9A-Fa-f]{6}$/),
      accent: Joi.string().regex(/^#[0-9A-Fa-f]{6}$/)
    }),

    features: Joi.object({
      contentSharing: Joi.boolean(),
      analytics: Joi.boolean(),
      advancedSearch: Joi.boolean(),
      mlRecommendations: Joi.boolean()
    }),

    security: Joi.object({
      mfaRequired: Joi.boolean(),
      passwordPolicy: Joi.object({
        minLength: Joi.number().min(8).max(64),
        requireNumbers: Joi.boolean(),
        requireSymbols: Joi.boolean(),
        requireUppercase: Joi.boolean(),
        maxAge: Joi.number().min(1).max(365)
      }),
      sessionTimeout: Joi.number().min(5).max(1440)
    }),

    storage: Joi.object({
      maxSize: Joi.number().min(1048576), // 1MB minimum
      allowedTypes: Joi.array().items(Joi.string())
    })
  }),

  status: Joi.string()
    .valid('active', 'suspended', 'pending')
    .default('pending'),

  subscription: Joi.object({
    plan: Joi.string()
      .valid('basic', 'professional', 'enterprise')
      .required(),
    startDate: Joi.date(),
    endDate: Joi.date().greater(Joi.ref('startDate')),
    autoRenew: Joi.boolean()
  }),

  contacts: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      email: Joi.string().email().required(),
      role: Joi.string().valid('admin', 'billing', 'technical'),
      phone: Joi.string().pattern(/^\+?[\d\s-()]{10,20}$/)
    })
  ).min(1).required(),

  metadata: Joi.object({
    industry: Joi.string(),
    size: Joi.string(),
    region: Joi.string(),
    customFields: Joi.object()
  })
});

const validateTenant = (data, isUpdate = false) => {
  const schema = isUpdate ? tenantSchema.fork(
    ['name', 'domain', 'contacts'],
    (schema) => schema.optional()
  ) : tenantSchema;

  return schema.validate(data, { abortEarly: false });
};

module.exports = {
  validateTenant
};
