import { Command } from 'commander'
import prompts from 'prompts'
import chalk from 'chalk'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { DEFAULT_CONFIG, PREVIEW_DIR, writeConfig } from '../lib/config.js'
import type { PreviewConfig } from '../lib/config.js'

const PREVIEW_SUBDIRS = ['screens', 'overrides'] as const

export const initCommand = new Command('init')
  .description('Initialize preview tool in current project')
  .option('-y, --yes', 'Accept defaults without prompting')
  .action(async (options: { yes?: boolean }) => {
    const cwd = process.cwd()

    console.log(chalk.bold('\nPreview Tool — Init\n'))

    let config: PreviewConfig

    if (options.yes) {
      config = { ...DEFAULT_CONFIG }
      console.log(chalk.dim('Using defaults (--yes):'))
      console.log(chalk.dim(`  screenGlob: ${config.screenGlob}`))
      console.log(chalk.dim(`  port: ${config.port}`))
    } else {
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

      config = {
        screenGlob: response.screenGlob as string,
        port: (response.port as number) ?? DEFAULT_CONFIG.port,
        title: DEFAULT_CONFIG.title,
        llm: { ...DEFAULT_CONFIG.llm },
      }
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

    // Create wrapper.tsx template (user-maintained, never overwritten)
    const wrapperPath = join(previewDir, 'wrapper.tsx')
    if (!existsSync(wrapperPath)) {
      await writeFile(wrapperPath, generateWrapperTemplate(), 'utf-8')
    }

    console.log(chalk.green('\nCreated .preview/ directory structure:'))
    for (const sub of PREVIEW_SUBDIRS) {
      console.log(`  ${chalk.dim('├──')} ${sub}/`)
    }
    console.log(`  ${chalk.dim('├──')} wrapper.tsx`)
    console.log(`  ${chalk.dim('└──')} preview.config.json`)

    // Ensure .gitignore has preview entries
    await ensureGitignore(cwd)

    console.log(chalk.green('\nDone! Run `preview generate` to discover screens.\n'))
  })

function generateWrapperTemplate(): string {
  return `// Preview wrapper — add your app's providers here.
// This file is user-maintained and never overwritten by \`preview generate\`.
//
// Example: if your app needs React Router, i18n, or a query client,
// import and wrap them here:
//
//   import { BrowserRouter } from 'react-router-dom'
//   import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
//   import '../src/i18n'
//
//   const queryClient = new QueryClient()
//
//   export function Wrapper({ children }: { children: React.ReactNode }) {
//     return (
//       <QueryClientProvider client={queryClient}>
//         <BrowserRouter>
//           {children}
//         </BrowserRouter>
//       </QueryClientProvider>
//     )
//   }

import type { ReactNode } from 'react'

export function Wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>
}
`
}

async function ensureGitignore(cwd: string): Promise<void> {
  const gitignorePath = join(cwd, '.gitignore')
  const entriesToAdd = [
    '.preview/screens',
    '.preview/*.html',
    '.preview/*.tsx',
    '.preview/*.css',
  ]

  let content = ''
  const fileExists = existsSync(gitignorePath)

  if (fileExists) {
    content = await readFile(gitignorePath, 'utf-8')
  }

  const missing = entriesToAdd.filter((entry) => !content.includes(entry))

  if (missing.length === 0) {
    return
  }

  // Build the block to append
  const block = [
    '',
    '# Preview Tool (auto-generated artifacts)',
    ...missing,
    '',
  ].join('\n')

  if (fileExists) {
    // Append to existing .gitignore — ensure we start on a new line
    const separator = content.endsWith('\n') ? '' : '\n'
    await writeFile(gitignorePath, content + separator + block, 'utf-8')
    console.log(chalk.green('\nUpdated .gitignore with preview entries:'))
  } else {
    // Create new .gitignore
    await writeFile(gitignorePath, block.trimStart() + '\n', 'utf-8')
    console.log(chalk.green('\nCreated .gitignore with preview entries:'))
  }

  for (const entry of missing) {
    console.log(`  ${chalk.dim(entry)}`)
  }
}
