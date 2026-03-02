import { Command } from 'commander'
import { resolve } from 'node:path'
import chalk from 'chalk'
import { readConfig } from '../lib/config.js'
import { generateAll } from '../generator/index.js'

export const generateCommand = new Command('generate')
  .description('Discover screens and generate preview artifacts')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .action(async (options: { cwd: string }) => {
    const cwd = resolve(options.cwd)

    console.log(chalk.bold('\nPreview Tool — Generate\n'))

    const config = await readConfig(cwd)
    console.log(chalk.dim(`Config: port=${config.port}`))
    console.log('')

    try {
      const result = await generateAll(cwd, config)
      console.log(chalk.green(`  Screens found:    ${result.screensFound}`))
      console.log(chalk.green(`  Regions inferred: ${result.regionsInferred}`))
      console.log(chalk.green(`  Mocks generated:  ${result.mocksGenerated}`))
      console.log('')
      console.log(chalk.dim('  Output written to .preview/'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(chalk.red(`Generation failed: ${message}`))
      process.exit(1)
    }
  })
