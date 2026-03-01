import { Command } from 'commander'
import { resolve } from 'node:path'
import chalk from 'chalk'
import { readConfig } from '../lib/config.js'
import { generateAll } from '../generator/index.js'

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

    try {
      const result = await generateAll(cwd, config)

      console.log('')
      console.log(chalk.green('Generation complete:'))
      console.log(`  Screens found:        ${result.screensFound}`)
      console.log(`  Views generated:      ${result.viewsGenerated}`)
      console.log(`  Models generated:     ${result.modelsGenerated}`)
      console.log(`  Controllers generated: ${result.controllersGenerated}`)
      console.log(`  Adapters generated:   ${result.adaptersGenerated}`)
      if (result.overridesSkipped > 0) {
        console.log(`  Overrides skipped:    ${result.overridesSkipped}`)
      }

      console.log('')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(chalk.red(`Generation failed: ${message}`))
      process.exit(1)
    }
  })
