import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import { errorMessage } from './api';

describe('errorMessage', () => {
  it('uses the server-authored message for a client-safe 400 response', () => {
    const error = new AxiosError('Request failed');
    error.response = {
      data: { error: { message: 'El recuento venció. Volvé a empezar.' } },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: { headers: {} },
    };

    expect(errorMessage(error)).toBe('El recuento venció. Volvé a empezar.');
  });

  it('does not show server messages for non-400 errors', () => {
    const error = new AxiosError('Request failed');
    error.response = {
      data: { error: { message: 'internal details' } },
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      config: { headers: {} },
    };

    expect(errorMessage(error)).toBe('Algo salió mal. Probá de nuevo.');
  });

  it('does not show arbitrary server details for a 400 response', () => {
    const error = new AxiosError('Request failed');
    error.response = {
      data: { error: { message: 'parser internals: column xyz missing' } },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: { headers: {} },
    };

    expect(errorMessage(error)).toBe('Revisá los datos ingresados.');
  });
});
