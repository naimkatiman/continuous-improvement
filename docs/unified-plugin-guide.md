# Unified Continuous Improvement Plugin Guide

## Overview

The Unified Continuous Improvement Plugin combines three powerful tools into a single cohesive system:

1. **CLI-Anything** - Generate agent-native CLIs for open-source software
2. **Compound Engineering** - Iterative development process with learning capture
3. **PM-Skills** - Product management expertise for defining "what" and "why"

This unified approach follows the 7 Laws of AI Agent Discipline and provides a complete workflow from ideation to deployment and learning.

## Installation

### Quick Start
```bash
npx continuous-improvement install --mode expert
```

### Manual Installation
```bash
# Clone the repository
git clone https://github.com/naimkatiman/continuous-improvement.git
cd continuous-improvement

# Install dependencies
npm install

# Build the project
npm run build

# The unified CLI is now available as:
./bin/unified-cli.mjs
# or after npm install:
ci
```

## Quick Start Guide

### 1. Initialize a New Project
```bash
ci init "MyApp" "Build a task management application for teams"
```

### 2. Run Complete Workflow
```bash
ci workflow "MyApp" "Build task management" --repo ./my-app
```

### 3. Check Status
```bash
ci status
```

## Detailed Usage

### Project Initialization

The `init` command sets up a new project with comprehensive analysis:

```bash
ci init <project-name> <objective> [options]
```

**Options:**
- `--product <json>` - Product information as JSON
- `--industry <name>` - Industry name
- `--target-market <json>` - Target market as JSON
- `--workspace <dir>` - Custom workspace directory

**Example:**
```bash
ci init "TaskMaster" "Build collaborative task management app" \
  --industry "SaaS" \
  --target-market '{"segment":"SMB","size":"100-500"}' \
  --product '{"type":"web","platform":"react"}'
```

### Complete Workflow

The `workflow` command executes the entire process end-to-end:

```bash
ci workflow <project-name> <objective> [options]
```

**Phases executed:**
1. **Research** - Market analysis, user research, CLI generation
2. **Planning** - Strategic planning, roadmap, GTM strategy
3. **Execution** - Implementation with tool support
4. **Review** - Comprehensive analysis and learning capture

**Example:**
```bash
ci workflow "TaskMaster" "Build collaborative task management" \
  --repo ./taskmaster-app \
  --industry "SaaS"
```

### Phase-by-Phase Execution

You can also execute each phase individually:

#### Research Phase
```bash
ci research [options]
```
- Conducts brainstorming and market analysis
- Generates CLI tools for existing repositories
- Identifies risks, opportunities, and constraints

#### Planning Phase
```bash
ci planning [options]
```
- Creates detailed project plans
- Defines success criteria and timelines
- Integrates PM insights and GTM strategies

#### Execution Phase
```bash
ci execution [options]
```
- Implements planned features
- Uses generated CLI tools for automation
- Tracks progress and issues

#### Review Phase
```bash
ci review [options]
```
- Comprehensive analysis of results
- Captures learnings for future use
- Generates improvement recommendations

### Tool-Specific Commands

#### CLI Generation
```bash
# Generate CLI for a repository
ci cli generate ./my-repository

# List CLI generation capabilities
ci cli list
```

#### Product Management
```bash
# Run comprehensive PM analysis
ci pm analyze --industry "SaaS" --target-market '{"segment":"SMB"}'

# Execute specific PM skill
ci pm skill growthLoops
ci pm skill marketResearch
ci pm skill gtmStrategy

# List available PM skills
ci pm list
```

#### Compound Engineering
```bash
# Start compound engineering session
ci compound session "MyProject" "Build new feature"

# View learnings
ci compound learnings
```

#### Learnings Management
```bash
# Search learnings
ci learnings search "performance"

# View all learnings
ci learnings all
```

## Configuration

### View Current Configuration
```bash
ci config show
```

### Set Configuration Values
```bash
ci config set workspace ./my-workspace
ci config set verbose true
ci config set defaultMode expert
```

### Configuration File
Create `.ci-config.json` in your project root:

```json
{
  "workspace": "./ci-workspace",
  "verbose": false,
  "defaultMode": "expert",
  "autoSave": true,
  "learningRetention": "90 days"
}
```

## Integration with Existing Workflows

### With Git Hooks
Add to `.git/hooks/pre-commit`:
```bash
#!/bin/bash
ci status --quiet
if [ $? -ne 0 ]; then
  echo "⚠️  Complete your current CI workflow before committing"
  exit 1
fi
```

### With CI/CD Pipelines
**GitHub Actions:**
```yaml
- name: Run CI Analysis
  run: |
    ci workflow "${{ github.event.repository.name }}" "Analyze and improve" \
      --repo . \
      --industry "${{ env.INDUSTRY }}"
```

### With IDE Integration
**VS Code tasks** (`.vscode/tasks.json`):
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "CI: Initialize Project",
      "type": "shell",
      "command": "ci",
      "args": ["init", "${workspaceFolderBasename}", "Analyze and improve"],
      "group": "build"
    },
    {
      "label": "CI: Status",
      "type": "shell",
      "command": "ci",
      "args": ["status"],
      "group": "build"
    }
  ]
}
```

## Advanced Features

### Custom PM Skills
Create custom PM skills by extending the PM-Skills framework:

```javascript
import PMSkills from 'continuous-improvement/lib/pm-skills.mjs';

const pmSkills = new PMSkills();

// Add custom skill
pmSkills.skills.customSkill = {
  description: "Custom analysis for specific domain",
  category: "custom",
  async execute(input) {
    // Your custom logic
    return { analysis: "Custom results" };
  }
};
```

### Learning Integration
The unified plugin automatically captures learnings across all phases:

```bash
# View learnings by type
ci learnings all | grep "process"
ci learnings all | grep "technical"
ci learnings all | grep "strategic"

# Export learnings for team sharing
cp ci-workspace/learnings.json team-learnings.json
```

### Multi-Project Coordination
For teams working on multiple related projects:

```bash
# Initialize coordinated projects
ci init "Frontend" "Build React frontend" --workspace ./frontend-ci
ci init "Backend" "Build Node.js backend" --workspace ./backend-ci

# Share learnings between projects
cp frontend-ci/learnings.json shared-learnings.json
cp backend-ci/learnings.json shared-learnings.json
```

## Best Practices

### 1. Project Initialization
- Always provide clear objectives
- Include relevant market and product information
- Use consistent naming conventions

### 2. Phase Execution
- Complete phases in order
- Review phase outputs before proceeding
- Capture issues and solutions systematically

### 3. Learning Management
- Review learnings regularly
- Apply high-confidence learnings automatically
- Share relevant learnings with team members

### 4. CLI Generation
- Generate CLIs for frequently used repositories
- Integrate generated CLIs into development workflows
- Keep CLI definitions up to date

### 5. PM Analysis
- Run PM analysis before major development cycles
- Use PM insights to guide technical decisions
- Update PM analysis as market conditions change

## Troubleshooting

### Common Issues

**"No active session" Error**
```bash
# Solution: Initialize a project first
ci init "MyProject" "Project objective"
```

**"Research phase must be completed first" Error**
```bash
# Solution: Complete phases in order
ci research
ci planning
ci execution
ci review
```

**Workspace Permission Issues**
```bash
# Solution: Check workspace permissions
ci config set workspace ./my-workspace
mkdir -p ./my-workspace
chmod 755 ./my-workspace
```

### Debug Mode
Enable verbose logging for detailed output:
```bash
ci config set verbose true
# Or use per-command:
ci status --verbose
```

### Reset Project State
```bash
# Remove project context (careful: this deletes all progress)
rm -f ci-workspace/project-context.json
```

## API Reference

### Programmatic Usage

```javascript
import UnifiedContinuousImprovement from 'continuous-improvement/lib/unified-plugin.mjs';

const unified = new UnifiedContinuousImprovement({
  workspace: './my-workspace',
  verbose: true
});

// Initialize project
const init = await unified.initializeProject({
  name: 'MyProject',
  objective: 'Build amazing features'
});

// Execute complete workflow
const workflow = await unified.executeCompleteWorkflow({
  name: 'MyProject',
  objective: 'Build amazing features'
});

// Get status
const status = await unified.getProjectStatus();
```

### Event Hooks

```javascript
// Progress callback during execution
const progressCallback = (message) => {
  console.log(`Progress: ${message}`);
};

await unified.executeWorkingPhase(progressCallback);
```

### Custom Configuration

```javascript
const unified = new UnifiedContinuousImprovement({
  workspace: './custom-workspace',
  verbose: false,
  customSettings: {
    learningRetention: '120 days',
    autoBackup: true,
    teamSharing: true
  }
});
```

## Contributing

### Development Setup
```bash
git clone https://github.com/naimkatiman/continuous-improvement.git
cd continuous-improvement
npm install
npm run build
npm test
```

### Running Tests
```bash
# Run all tests
npm test

# Run specific test suites
node test/unified-plugin.test.mjs
node test/cli-anything.test.mjs
node test/compound-engineering.test.mjs
node test/pm-skills.test.mjs
```

### Adding New Features
1. Implement feature in appropriate module
2. Add comprehensive tests
3. Update documentation
4. Submit pull request with description

## License

MIT License - see LICENSE file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/naimkatiman/continuous-improvement/issues)
- **Discussions**: [GitHub Discussions](https://github.com/naimkatiman/continuous-improvement/discussions)
- **Documentation**: [Full Documentation](https://github.com/naimkatiman/continuous-improvement/docs)

## Changelog

See the repo-level [CHANGELOG.md](../CHANGELOG.md) for the authoritative version history. The unified `ci` CLI described in this guide ships as part of the current `continuous-improvement` npm package (see `package.json` for the active version) and exposes:

- CLI-Anything, Compound Engineering, and PM-Skills behind a single `ci` command
- Learning integration across all three surfaces
- Project status and progress tracking
- Configuration via `.ci-config.json` and `ci config set`
- Tests under `test/` covering each surface individually and the unified plugin
