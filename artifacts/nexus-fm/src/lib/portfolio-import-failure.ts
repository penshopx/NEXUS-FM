export type ValidationFailureReason =
  | 'invalid_csv'
  | 'forbidden'
  | 'file_too_large'
  | 'request_failed';

export type CommitFailureReason =
  | 'validation_error'
  | 'authorization_error'
  | 'conflict'
  | 'server_error'
  | 'request_failed';

type ImportHttpFailure =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'file_too_large'
  | 'unprocessable'
  | 'server_error'
  | 'other';

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function classifyImportHttpFailure(error: unknown): ImportHttpFailure {
  const status = getErrorStatus(error);
  if (status === 400) return 'bad_request';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 409) return 'conflict';
  if (status === 413) return 'file_too_large';
  if (status === 422) return 'unprocessable';
  if (typeof status === 'number' && status >= 500) return 'server_error';
  return 'other';
}

export function validationFailureReason(error: unknown): ValidationFailureReason {
  const failure = classifyImportHttpFailure(error);
  if (failure === 'bad_request') return 'invalid_csv';
  if (failure === 'forbidden') return 'forbidden';
  if (failure === 'file_too_large') return 'file_too_large';
  return 'request_failed';
}

export function commitFailureReason(error: unknown): CommitFailureReason {
  const failure = classifyImportHttpFailure(error);
  if (failure === 'bad_request' || failure === 'file_too_large' || failure === 'unprocessable') {
    return 'validation_error';
  }
  if (failure === 'unauthorized' || failure === 'forbidden') return 'authorization_error';
  if (failure === 'conflict') return 'conflict';
  if (failure === 'server_error') return 'server_error';
  return 'request_failed';
}