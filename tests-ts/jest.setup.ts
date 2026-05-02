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

// Mock window.scrollIntoView and Element.prototype.scrollIntoView for positioned UI controls
Object.defineProperty(window, 'scrollIntoView', {
  writable: true,
  value: jest.fn(),
});

// Also mock on Element.prototype since headless UI controls may call it on elements
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = jest.fn()
}

// Base UI dispatches PointerEvent from non-native checkbox/switch roots.
// jsdom does not provide PointerEvent by default.
if (!window.PointerEvent) {
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent
}

// Base UI ScrollArea calls element.getAnimations() to wait for animations
// before measuring; jsdom doesn't implement the Web Animations API.
if (typeof Element !== 'undefined' && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => []
}

// Mock global fetch for tests (always override to keep tests deterministic)
;(globalThis as any).fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    text: () => Promise.resolve(JSON.stringify([])),
    json: () => Promise.resolve([]),
  })
) as jest.Mock

// Provide a minimal ResizeObserver mock for components that rely on element sizing.
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
