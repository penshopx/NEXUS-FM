import { describe, expect, it } from 'vitest';
import {
  commitFailureReason,
  validationFailureReason,
  type CommitFailureReason,
  type ValidationFailureReason,
} from './portfolio-import-failure';

describe('validationFailureReason', () => {
  it.each<[unknown, ValidationFailureReason]>([
    [{ status: 400 }, 'invalid_csv'],
    [{ status: 403 }, 'forbidden'],
    [{ status: 413 }, 'file_too_large'],
    [{ status: 401 }, 'request_failed'],
    [{ status: 422 }, 'request_failed'],
    [{ status: 500 }, 'request_failed'],
    [{ status: '400' }, 'request_failed'],
    [new Error('network failure'), 'request_failed'],
  ])('classifies %j as %s', (error, expected) => {
    expect(validationFailureReason(error)).toBe(expected);
  });
});

describe('commitFailureReason', () => {
  it.each<[unknown, CommitFailureReason]>([
    [{ status: 400 }, 'validation_error'],
    [{ status: 413 }, 'validation_error'],
    [{ status: 422 }, 'validation_error'],
    [{ status: 401 }, 'authorization_error'],
    [{ status: 403 }, 'authorization_error'],
    [{ status: 409 }, 'conflict'],
    [{ status: 499 }, 'request_failed'],
    [{ status: 500 }, 'server_error'],
    [{ status: 599 }, 'server_error'],
    [{ status: '500' }, 'request_failed'],
    [undefined, 'request_failed'],
  ])('classifies %j as %s', (error, expected) => {
    expect(commitFailureReason(error)).toBe(expected);
  });
});