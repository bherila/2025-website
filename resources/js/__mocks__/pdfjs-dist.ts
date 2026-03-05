export const GlobalWorkerOptions = {
  workerSrc: ''
};

export const getDocument = jest.fn(() => ({
  promise: Promise.resolve({
    numPages: 0,
    getPage: jest.fn(() => Promise.resolve({
      getViewport: jest.fn(() => ({ width: 0, height: 0 })),
      render: jest.fn(() => ({ promise: Promise.resolve() }))
    }))
  })
}));

export const version = 'mock-version';
