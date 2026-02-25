import '@testing-library/jest-dom';

import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(customParseFormat);

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: jest.fn(),
});

// Provide a minimal ResizeObserver mock for components that rely on it (Radix use-size)
// Some tests render components which use ResizeObserver; Jest DOM doesn't provide it by default.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!window.ResizeObserver) {
  window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
}
