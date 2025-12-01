# Learning Atomizer

A scalable content atomization platform with load balancing and real-time monitoring capabilities.

## Features

- Content atomization with ML-powered analysis
- Real-time load balancing and worker management
- Interactive monitoring dashboard
- Comprehensive analytics and reporting
- Redis-based caching with fallback support
- Distributed worker architecture

## Tech Stack

### Backend
- Node.js
- Express
- Redis
- MongoDB
- Python (ML Services)

### Frontend
- Vue 3
- Pinia
- PrimeVue
- Chart.js
- Axios

## Getting Started

### Prerequisites
- Node.js >= 14
- Redis
- MongoDB
- Python 3.8+

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/learning-atomizer.git
cd learning-atomizer
```

2. Install dependencies
```bash
# Install server dependencies
npm install

# Install client dependencies
cd src/client
npm install
```

3. Configure environment variables
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start development servers
```bash
# Start server
npm run dev

# Start client (in another terminal)
cd src/client
npm run serve
```

## Project Status

- **Stage**: Pre-Alpha (Micro-MVP in progress as of 2025-12-01)
- **Current focus**: Minimal end-to-end flow (auth → atomize simple text → view atoms & basic progress)
- **Next**: Evaluate whether to expand toward SaaS or reframe as learning/template project

## Development

### Testing
```bash
# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run tests with coverage
npm run test:coverage
```

### Code Style
The project uses ESLint and Prettier for code formatting. Run linting with:
```bash
npm run lint
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## Documentation

- [API Documentation](docs/API.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [User Guide](docs/USER_GUIDE.md)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Vue.js](https://vuejs.org/)
- [PrimeVue](https://primevue.org/)
- [Chart.js](https://www.chartjs.org/)
