/**
 * Typed domain errors. Thrown by services, caught by the central errorHandler.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado', details?: unknown) {
    super('NOT_FOUND', message, 404, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Datos inválidos', details?: unknown) {
    super('VALIDATION_ERROR', message, 422, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No autenticado', details?: unknown) {
    super('UNAUTHORIZED', message, 401, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'No autorizado', details?: unknown) {
    super('FORBIDDEN', message, 403, details);
  }
}
