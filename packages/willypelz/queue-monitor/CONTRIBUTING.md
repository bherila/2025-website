# Contributing to Queue Monitor

Thank you for considering contributing to Queue Monitor! This document outlines the process for contributing to this project.

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues. When creating a bug report, include:

- **Clear title** - Describe the issue concisely
- **Steps to reproduce** - Detailed steps to reproduce the behavior
- **Expected behavior** - What you expected to happen
- **Actual behavior** - What actually happened
- **Environment details** - PHP version, Laravel version, database driver
- **Screenshots** - If applicable
- **Additional context** - Any other relevant information

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Clear title and description**
- **Use case** - Why is this enhancement needed?
- **Proposed solution** - How would you implement it?
- **Alternatives** - Other approaches you've considered

### Pull Requests

1. **Fork the repository**
2. **Create a feature branch** - `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Add tests** - Ensure all tests pass
5. **Update documentation** - If needed
6. **Commit your changes** - Use clear commit messages
7. **Push to your fork** - `git push origin feature/amazing-feature`
8. **Open a Pull Request**

## Development Setup

### Prerequisites

- PHP 8.1 or higher
- Composer
- Laravel 10.x or 11.x
- Database (MySQL, PostgreSQL, or SQLite)

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/queue-monitor.git
cd queue-monitor

# Install dependencies
composer install

# Run tests
composer test
```

### Running Tests

```bash
# Run all tests
vendor/bin/phpunit

# Run specific test file
vendor/bin/phpunit tests/Feature/MonitorRecorderTest.php

# Run with coverage
vendor/bin/phpunit --coverage-html coverage
```

## Coding Standards

### PHP Standards

- Follow PSR-12 coding standard
- Use strict types: `declare(strict_types=1);`
- Type hint all parameters and return types
- Use meaningful variable and method names

### Code Style

```php
<?php

declare(strict_types=1);

namespace QueueMonitor\Example;

class ExampleClass
{
    public function __construct(
        private ExampleService $service,
        private string $name
    ) {
    }

    public function doSomething(string $input): array
    {
        // Implementation
        return [];
    }
}
```

### Testing Standards

- Write tests for all new features
- Maintain or improve code coverage
- Use descriptive test names
- Follow AAA pattern: Arrange, Act, Assert

```php
/** @test */
public function it_records_job_processing(): void
{
    // Arrange
    $job = $this->createTestJob();

    // Act
    $this->recordJob($job);

    // Assert
    $this->assertDatabaseHas('queue_monitor_jobs', [
        'status' => 'processing',
    ]);
}
```

## Documentation

- Update README.md for user-facing changes
- Update relevant documentation in `/docs`
- Add inline comments for complex logic
- Update CHANGELOG.md

## Commit Messages

Use clear, descriptive commit messages:

```
Add throttle control for queue rate limiting

- Implement QueueControlService throttle method
- Add throttle API endpoint
- Update dashboard UI with throttle controls
- Add tests for throttle functionality

Closes #123
```

### Commit Message Format

```
<type>: <subject>

<body>

<footer>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting)
- `refactor` - Code refactoring
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

## Branch Naming

- `feature/feature-name` - New features
- `fix/bug-description` - Bug fixes
- `docs/documentation-update` - Documentation
- `refactor/refactor-description` - Refactoring

## Review Process

1. Automated tests must pass
2. Code review by maintainers
3. Documentation review
4. Approval from at least one maintainer

## Release Process

1. Update CHANGELOG.md
2. Update version in composer.json
3. Create release tag
4. Publish to Packagist

## Questions?

Feel free to open an issue with the `question` label or start a discussion.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be recognized in the README.md file.

Thank you for contributing! 🎉

