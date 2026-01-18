# Isochrone Center Point Calculator

A sophisticated geospatial application that calculates optimal meeting points using a matrix-based minimax travel-time approach. Built with RedwoodJS, the system finds fair meeting locations that minimize the maximum travel time for all participants.

## Features

- **Multi-Phase Optimization**: Three optimization modes (Baseline, Coarse Grid, Full Refinement) balancing speed vs. accuracy
- **Multi-Modal Travel**: Support for driving, cycling, and walking travel modes
- **Interactive Mapping**: Real-time visualization with Leaflet.js integration
- **Smart Caching**: Intelligent API response caching to minimize external API usage
- **Developer Tools**: Comprehensive debugging and hypothesis point visualization

## Quick Start

> **Prerequisites**
>
> - Redwood requires [Node.js](https://nodejs.org/en/) (=20.x) and [Yarn](https://yarnpkg.com/)
> - OpenRouteService API key (free tier available)
> - Are you on Windows? For best results, follow our [Windows development setup](https://redwoodjs.com/docs/how-to/windows-development-setup) guide

### Installation

1. Clone the repository and install dependencies:
```bash
yarn install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env and add your OPENROUTE_SERVICE_API_KEY
```

3. Set up the database:
```bash
yarn rw prisma migrate dev
yarn rw exec seed
```

4. Start the development server:
```bash
yarn rw dev
```

Your browser should automatically open to [http://localhost:8910](http://localhost:8910).

## How It Works

The application uses a sophisticated multi-phase optimization algorithm:

1. **Hypothesis Generation**: Creates strategic candidate meeting points using geographic analysis
2. **Matrix Evaluation**: Uses OpenRouteService Matrix API to calculate actual travel times
3. **Minimax Optimization**: Selects the point that minimizes maximum travel time for fairness
4. **Visualization**: Displays results with interactive maps and isochrone areas

### Optimization Modes

- **Baseline** (⚡): Fast calculation using geographic and participant-based points (1 API call)
- **Coarse Grid** (🎯): Better accuracy with systematic grid sampling (1-2 API calls)
- **Full Refinement** (🔬): Maximum accuracy with local refinement (2 API calls)

## Documentation

- **[Developer Guide](DEVELOPER_GUIDE.md)**: Comprehensive technical documentation
- **[API Reference](api/README.md)**: GraphQL schema and service documentation
- **[Testing Guide](TESTING.md)**: Property-based testing and quality assurance

## Architecture

Built with modern full-stack technologies:

- **Frontend**: React 18, TypeScript, Leaflet.js, Tailwind CSS
- **Backend**: RedwoodJS GraphQL API, Node.js serverless functions
- **External APIs**: OpenRouteService for travel time calculations and geocoding
- **Caching**: Redis (production) / in-memory (development)
- **Testing**: Jest, fast-check property-based testing

## API Usage Optimization

The system is designed to be efficient with external API usage:

- Intelligent batching of matrix requests
- Location-based caching with 100m precision matching
- Configurable optimization modes to balance accuracy vs. API quota

## Development Commands

### Core Development
```bash
yarn rw dev          # Start development servers (web + api)
yarn rw dev web      # Frontend only (port 8910)
yarn rw dev api      # Backend only (port 8911)
```

### Database Management
```bash
yarn rw prisma migrate dev    # Run database migrations
yarn rw prisma migrate reset  # Reset and seed database
yarn rw exec seed            # Seed database with test data
```

### Testing
```bash
yarn rw test --no-watch     # Run all tests once
yarn rw test --watch        # Run tests in watch mode
yarn rw test api --no-watch # Run API tests only
yarn rw test web --no-watch # Run web tests only
```

### Code Generation
```bash
yarn rw generate sdl <model>      # Generate GraphQL SDL
yarn rw generate service <name>   # Generate service
yarn rw generate component <name> # Generate React component
```

## Environment Configuration

Required environment variables:

```bash
OPENROUTE_SERVICE_API_KEY=your_api_key_here  # Required for geospatial services
REDIS_URL=redis://localhost:6379            # Optional: falls back to in-memory
```

## Contributing

We welcome contributions! Please see our [Developer Guide](DEVELOPER_GUIDE.md) for:

- Architecture overview and algorithms
- Testing requirements and property-based testing
- Code style guidelines
- Performance considerations

## License

This project is licensed under the MIT License.

---

## RedwoodJS Resources

This project is built with [RedwoodJS](https://redwoodjs.com). For more information:

- [RedwoodJS Documentation](https://redwoodjs.com/docs)
- [RedwoodJS Tutorial](https://redwoodjs.com/docs/tutorial/foreword)
- [RedwoodJS Community Forum](https://community.redwoodjs.com)
- [RedwoodJS Discord](https://discord.gg/redwoodjs)
