import { Command } from 'commander'
import { resolve } from 'node:path'
import chalk from 'chalk'
import { readConfig } from '../lib/config.js'

export const generateCommand = new Command('generate')
  .description('Discover screens and generate preview artifacts')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .option('--no-llm', 'Skip LLM generation, use heuristic fallback only')
  .action(async (options: { cwd: string; llm: boolean }) => {
    const cwd = resolve(options.cwd)

    console.log(chalk.bold('\nPreview Tool — Generate\n'))

    const config = await readConfig(cwd)
    console.log(chalk.dim(`Config: glob=${config.screenGlob}, port=${config.port}`))

    if (!options.llm) {
      config.llm = { ...config.llm, provider: 'none' }
      console.log(chalk.dim('LLM disabled (--no-llm flag)'))
    }

    console.log('')

    // TODO: v2 generation pipeline — will be wired in Phase 4
    console.error(chalk.yellow('Generation not yet implemented in v2'))
    process.exit(1)
  })
