# Contributing to Tigh

Thank you for your interest in contributing to Tigh! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful and constructive in all interactions. We welcome contributors from all backgrounds.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported
2. Provide a clear description of the issue
3. Include steps to reproduce
4. Describe the expected vs. actual behavior
5. Include your environment (OS, Node version, TypeScript version)

### Suggesting Enhancements

1. Check if the enhancement has already been suggested
2. Provide a clear use case
3. Explain why this feature would be useful
4. Provide examples if applicable

### Submitting Code Changes

1. Fork the repository
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Write or update tests
5. Ensure code passes TypeScript checks: `npm run typecheck`
6. Commit with clear messages: `git commit -m 'Add feature: description'`
7. Push to your fork: `git push origin feature/your-feature-name`
8. Open a Pull Request with a clear description

## Development Setup

```bash
# Clone the repository
git clone https://github.com/arsamadineh/tigh.git
cd tigh

# Install dependencies
npm install

# Build the project
npm run build

# Check types
npm run typecheck
```

## Code Style

- Use TypeScript for all code
- Follow the existing code style
- Use meaningful variable names
- Add comments for complex logic
- Keep functions small and focused

## Commit Message Guidelines

- Use imperative mood ("Add feature" not "Added feature")
- Start with a verb
- Keep the first line under 70 characters
- Reference issues when relevant: "Fix #123"

## Pull Request Process

1. Update documentation as needed
2. Add or update tests
3. Ensure all checks pass
4. Provide a clear PR description
5. Link related issues

## License

By contributing, you agree your contributions are licensed under MIT License.

---

Thank you for contributing to Tigh!
