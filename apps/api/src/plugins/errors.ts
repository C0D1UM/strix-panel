import { Elysia } from 'elysia'
import { AppError, errorBody } from '../lib/errors'

export const errorsPlugin = new Elysia({ name: 'errors' }).onError(
  { as: 'global' },
  ({ code, error, set }) => {
    if (error instanceof AppError) {
      set.status = error.status
      return errorBody(error.code, error.message)
    }
    switch (code) {
      case 'VALIDATION':
        set.status = 422
        return errorBody('VALIDATION_ERROR', error.message)
      case 'NOT_FOUND':
        set.status = 404
        return errorBody('NOT_FOUND', 'Route not found')
      case 'PARSE':
        set.status = 400
        return errorBody('BAD_REQUEST', 'Malformed request body')
      default:
        console.error(error)
        set.status = 500
        return errorBody('INTERNAL_ERROR', 'Something went wrong')
    }
  },
)
