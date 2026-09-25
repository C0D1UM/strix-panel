// Every API error is returned as `{ error: { code, message } }`. Throw these from handlers and services.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource', code = 'FORBIDDEN') {
    super(403, code, message)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(404, code, message)
  }
}

export class BadRequestError extends AppError {
  constructor(code: string, message: string) {
    super(400, code, message)
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message)
  }
}

export function errorBody(code: string, message: string) {
  return { error: { code, message } }
}
