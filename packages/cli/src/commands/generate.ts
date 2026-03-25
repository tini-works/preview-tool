import { Command } from 'commander'
import { resolve } from 'node:path'
import chalk from 'chalk'
import { generateAllV2 } from '../generator/generate-all-v2.js'

export const generateCommand = new Command('generate')
  .description('Discover screens and generate preview artifacts')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .action(async (options: { cwd: string }) => {
    const cwd = resolve(options.cwd)

    console.log(chalk.bold('\nPreview Tool — Generate\n'))

    try {
      const result = await generateAllV2(cwd)

      console.log('')
      console.log(chalk.green('Generation complete:'))
      console.log(`  Screens found: ${result.screens.length}`)
      console.log(`  Mock modules: ${result.analyses.reduce((sum, a) => sum + a.mockModules.length, 0)}`)

      console.log('')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(chalk.red(`Generation failed: ${message}`))
      process.exit(1)
    }
  })
