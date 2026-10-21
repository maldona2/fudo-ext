import { afterEach, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useKeyboardOpen } from './useKeyboardOpen';

class FakeViewport extends EventTarget {
  height = 800;
}

const original = Object.getOwnPropertyDescriptor(window, 'visualViewport');
afterEach(() => {
  if (original) Object.defineProperty(window, 'visualViewport', original);
  else delete (window as unknown as Record<string, unknown>).visualViewport;
});

function install(vv: FakeViewport | undefined) {
  Object.defineProperty(window, 'visualViewport', {
    value: vv,
    configurable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    value: 800,
    configurable: true,
  });
}

it('is closed when the visual viewport is as tall as the window', () => {
  install(new FakeViewport());
  const { result } = renderHook(() => useKeyboardOpen());
  expect(result.current).toBe(false);
});

it('opens when the visual viewport shrinks by more than 150px and closes when it recovers', () => {
  const vv = new FakeViewport();
  install(vv);
  const { result } = renderHook(() => useKeyboardOpen());
  act(() => {
    vv.height = 480;
    vv.dispatchEvent(new Event('resize'));
  });
  expect(result.current).toBe(true);
  act(() => {
    vv.height = 800;
    vv.dispatchEvent(new Event('resize'));
  });
  expect(result.current).toBe(false);
});

it('stays closed when visualViewport is unsupported', () => {
  install(undefined);
  const { result } = renderHook(() => useKeyboardOpen());
  expect(result.current).toBe(false);
});
