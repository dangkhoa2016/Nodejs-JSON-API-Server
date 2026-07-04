# Contributing

Thank you for considering contributing to this project.

## Development Setup

```bash
git clone https://github.com/dangkhoa2016/NodeJs-JSON-API-Server.git
cd NodeJs-JSON-API-Server
yarn install
```

## Setting up the database

```bash
yarn db:setup   # migrate + seed (required before first start)
```

## Running Tests

```bash
yarn test              # run all tests once
yarn test:watch        # watch mode
yarn test:coverage     # run with V8 coverage report
```

## Code Style

- Prefer Node.js built-ins over third-party dependencies where possible
- Keep functions focused and small
- Follow the existing patterns in `src/` and `tests/`

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Add tests for any new functionality
3. Ensure all tests pass (`yarn test`)
4. Update documentation if needed
5. Submit a pull request with a clear description

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS
