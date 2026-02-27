import { Command } from 'commander'
import prompts from 'prompts'
import chalk from 'chalk'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { DEFAULT_CONFIG, PREVIEW_DIR, writeConfig } from '../lib/config.js'
import type { PreviewConfig } from '../lib/config.js'

const PREVIEW_SUBDIRS = ['adapters', 'mocks', 'interceptors', 'overrides'] as const

export const initCommand = new Command('init')
  .description('Initialize preview tool in current project')
  .action(async () => {
    const cwd = process.cwd()

    console.log(chalk.bold('\nPreview Tool — Init\n'))

    const response = await prompts([
      {
        type: 'text',
        name: 'screenGlob',
        message: 'Screen file glob pattern',
        initial: DEFAULT_CONFIG.screenGlob,
      },
      {
        type: 'number',
        name: 'port',
        message: 'Dev server port',
        initial: DEFAULT_CONFIG.port,
      },
    ])

    if (!response.screenGlob) {
      console.log(chalk.yellow('Init cancelled.'))
      return
    }

    const config: PreviewConfig = {
      screenGlob: response.screenGlob as string,
      port: (response.port as number) ?? DEFAULT_CONFIG.port,
      title: DEFAULT_CONFIG.title,
    }

    // Create .preview/ directory structure
    const previewDir = join(cwd, PREVIEW_DIR)
    for (const sub of PREVIEW_SUBDIRS) {
      const subDir = join(previewDir, sub)
      await mkdir(subDir, { recursive: true })
      // Add .gitkeep so empty dirs are tracked
      const gitkeep = join(subDir, '.gitkeep')
      if (!existsSync(gitkeep)) {
        await writeFile(gitkeep, '', 'utf-8')
      }
    }

    // Write config
    await writeConfig(cwd, config)

    console.log(chalk.green('\nCreated .preview/ directory structure:'))
    for (const sub of PREVIEW_SUBDIRS) {
      console.log(`  ${chalk.dim('├──')} ${sub}/`)
    }
    console.log(`  ${chalk.dim('└──')} preview.config.json`)

    // Check .gitignore
    await checkGitignore(cwd)

    console.log(chalk.green('\nDone! Run `preview generate` to discover screens.\n'))
  })

async function checkGitignore(cwd: string): Promise<void> {
  const gitignorePath = join(cwd, '.gitignore')
  const entriesToAdd = [
    '.preview/adapters',
    '.preview/mocks',
    '.preview/interceptors',
  ]

  try {
    let content = ''
    if (existsSync(gitignorePath)) {
      content = await readFile(gitignorePath, 'utf-8')
    }

    const missing = entriesToAdd.filter((entry) => !content.includes(entry))

    if (missing.length > 0) {
      console.log(chalk.yellow('\nConsider adding to .gitignore:'))
      for (const entry of missing) {
        console.log(`  ${entry}`)
      }
    }
  } catch {
    console.log(chalk.yellow('\nNo .gitignore found. Consider creating one.'))
  }
}
