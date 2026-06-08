# CLI-Anything (`ci`)

`ci` turns a repository into an agent-native CLI wrapper that a language model can drive.

It is the one remaining tool from the former unified `ci` toolkit. The Compound
Engineering and PM-Skills tools (and the `unified-plugin` orchestrator) were
removed in 3.13.0: Compound Engineering overlapped the Mulahazah instinct
engine, and PM-Skills overlapped the out-of-band `phuryn/pm-skills` marketplace
install. See `CHANGELOG.md` `[3.13.0]`.

## What it does

- **Repository analysis** — detects project type (Node.js, React, Python, Docker, and more).
- **Command extraction** — pulls commands from `package.json` scripts and existing CLI configs.
- **CLI generation** — emits an executable JavaScript CLI wrapper an agent can run.
- **Template system** — consistent generated interfaces.

## Usage

```bash
# Generate an agent-native CLI for a repository
ci generate ./my-project

# Show CLI-Anything capabilities
ci list

# Configuration
ci config show
ci config set workspace ./out
```

Global options: `--workspace <dir>` (output directory, default `./ci-workspace`) and `--verbose`.

## API usage

```javascript
import CLIAnything from "./lib/cli-anything.mjs";

const cliAnything = new CLIAnything({ outputDir: "./generated-clis" });
const result = await cliAnything.generateCLI("./my-repo");
console.log(`CLI generated: ${result.outputPath}`);
```

## File structure

```
src/
├── bin/
│   └── unified-cli.mts   # `ci` entrypoint (thin front-end over CLIAnything)
└── lib/
    └── cli-anything.mts  # CLI generation library

lib/
└── cli-anything.mjs      # built runtime module

test/
└── cli-anything.test.mjs # CLI-Anything tests
```

## Testing

```bash
node test/cli-anything.test.mjs
```

## Configuration

`ci` reads an optional `.ci-config.json` in the working directory:

- `workspace` (string) — output directory for generated CLIs (default `./ci-workspace`).
- `verbose` (boolean) — enable verbose logging.
