import '@testing-library/jest-dom';

import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(customParseFormat);

// Suppress React act() warnings for async useEffect state updates in tests.
// These warnings occur because async data fetching triggers state updates outside
// the direct control of tests, even when using waitFor. The tests are functionally correct.
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const firstArg = args[0];
  if (
    typeof firstArg === 'string' &&
    firstArg.includes('inside a test was not wrapped in act')
  ) {
    return;
  }
  originalConsoleError.call(console, ...args);
};

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

// Mock window.scrollIntoView and Element.prototype.scrollIntoView for Radix UI Select
Object.defineProperty(window, 'scrollIntoView', {
  writable: true,
  value: jest.fn(),
});

// Also mock on Element.prototype since Radix may call it on elements
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = jest.fn()
}

// Mock global fetch for tests
if (!(globalThis as any).fetch) {
  (globalThis as any).fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      text: () => Promise.resolve(JSON.stringify([])),
      json: () => Promise.resolve([]),
    })
  ) as jest.Mock
}

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

// Mock pdfjsLib for PDF viewer tests
(window as any).pdfjsLib = {
  GlobalWorkerOptions: {
    workerSrc: ''
  },
  getDocument: jest.fn(() => ({
    promise: Promise.resolve({
      numPages: 0,
      getPage: jest.fn(() => Promise.resolve({
        getViewport: jest.fn(() => ({ width: 0, height: 0 })),
        render: jest.fn(() => ({ promise: Promise.resolve() }))
      }))
    })
  })),
  version: 'mock-version'
};
