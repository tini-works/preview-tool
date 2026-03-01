#!/usr/bin/env node
import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { devCommand } from './commands/dev.js'
import { generateCommand } from './commands/generate.js'
import { previewCommand } from './commands/preview.js'

const program = new Command()

program
  .name('preview')
  .description('Screen preview tool for React projects')
  .version('0.0.1')

program.addCommand(initCommand)
program.addCommand(devCommand)
program.addCommand(generateCommand)
program.addCommand(previewCommand)

program.parse()
