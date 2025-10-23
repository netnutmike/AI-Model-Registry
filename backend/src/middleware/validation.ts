import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export class ValidationException extends Error {
  public errors: ValidationError[];
  public statusCode: number;

  constructor(errors: ValidationError[]) {
    super('Validation failed');
    this.name = 'ValidationException';
    this.errors = errors;
    this.statusCode = 400;
  }
}

/**
 * Middleware factory for validating request data against Joi schemas
 */
export function validateRequest(schemas: {
  body?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: ValidationError[] = [];

    // Validate request body
    if (schemas.body) {
      const { error } = schemas.body.validate(req.body, { abortEarly: false });
      if (error) {
        errors.push(...formatJoiErrors(error, 'body'));
      }
    }

    // Validate request parameters
    if (schemas.params) {
      const { error } = schemas.params.validate(req.params, { abortEarly: false });
      if (error) {
        errors.push(...formatJoiErrors(error, 'params'));
      }
    }

    // Validate query parameters
    if (schemas.query) {
      const { error, value } = schemas.query.validate(req.query, { 
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true
      });
      if (error) {
        errors.push(...formatJoiErrors(error, 'query'));
      } else {
        // Replace query with validated and transformed values
        req.query = value;
      }
    }

    if (errors.length > 0) {
      return next(new ValidationException(errors));
    }

    next();
  };
}

/**
 * Format Joi validation errors into a consistent structure
 */
function formatJoiErrors(joiError: Joi.ValidationError, source: string): ValidationError[] {
  return joiError.details.map(detail => ({
    field: `${source}.${detail.path.join('.')}`,
    message: detail.message,
    value: detail.context?.value
  }));
}

/**
 * Validate data against a schema without middleware
 */
export function validateData<T>(schema: Joi.ObjectSchema, data: any): T {
  const { error, value } = schema.validate(data, { 
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true
  });

  if (error) {
    const errors = formatJoiErrors(error, 'data');
    throw new ValidationException(errors);
  }

  return value as T;
}

/**
 * Error handler for validation exceptions
 */
export function handleValidationError(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof ValidationException) {
    return res.status(err.statusCode).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.errors,
        traceId: req.headers['x-trace-id'] || 'unknown'
      }
    });
  }

  next(err);
}