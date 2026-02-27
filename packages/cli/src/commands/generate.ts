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
    console.log(chalk.dim(`Config: glob=${config.screenGlob}, port=${config.port}`))
    console.log('')

    try {
      const result = await generateAll(cwd, config)

      console.log('')
      console.log(chalk.green('Generation complete:'))
      console.log(`  Screens found:     ${result.screensFound}`)
      console.log(`  Mocks generated:   ${result.mocksGenerated}`)
      console.log(`  Adapters generated: ${result.adaptersGenerated}`)
      if (result.overridesSkipped > 0) {
        console.log(`  Overrides skipped:  ${result.overridesSkipped}`)
      }

      if (result.analyses.length > 0) {
        console.log('')
        console.log(chalk.dim('Screen details:'))
        for (const analysis of result.analyses) {
          const regionCount = Object.keys(analysis.regions).length
          const flowCount = analysis.flows.length
          console.log(
            `  ${analysis.screen.route} — ${regionCount} region(s), ${flowCount} flow(s)`
          )
        }
      }

      console.log('')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(chalk.red(`Generation failed: ${message}`))
      process.exit(1)
    }
  })
