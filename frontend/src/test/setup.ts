import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
// Registers the jest-dom matchers and their types for Vitest.
import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
});
