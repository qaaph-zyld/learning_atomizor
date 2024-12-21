// Mock Chart.js
jest.mock('chart.js', () => ({
  Chart: jest.fn(),
  registerables: []
}));

// Mock PrimeVue components
jest.mock('primevue/card', () => ({
  __esModule: true,
  default: {
    name: 'Card',
    render: () => {}
  }
}));

jest.mock('primevue/datatable', () => ({
  __esModule: true,
  default: {
    name: 'DataTable',
    render: () => {}
  }
}));

jest.mock('primevue/column', () => ({
  __esModule: true,
  default: {
    name: 'Column',
    render: () => {}
  }
}));

jest.mock('primevue/progressbar', () => ({
  __esModule: true,
  default: {
    name: 'ProgressBar',
    render: () => {}
  }
}));
