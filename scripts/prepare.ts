import { cancel, confirm, intro, isCancel, outro, select, text } from '@clack/prompts'
import { execSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '../..')

const readJSON = (file: string) => JSON.parse(readFileSync(resolve(root, file), 'utf8'))

const writeJSON = (file: string, data: unknown) =>
  writeFileSync(resolve(root, file), JSON.stringify(data, null, 2) + '\n')

const readText = (file: string) => readFileSync(resolve(root, file), 'utf8')
const writeText = (file: string, content: string) => writeFileSync(resolve(root, file), content)

const sevenDaysInMinutes = 7 * 24 * 60
const sevenDaysInSeconds = sevenDaysInMinutes * 60

const licenseOptions = {
  'Apache-2.0': {
    label: 'Apache 2.0',
    url: 'https://www.apache.org/licenses/LICENSE-2.0.txt',
  },
  'FSL-1.1-ALv2': {
    label: 'FSLv1-A2',
    url: 'https://fsl.software/FSL-1.1-ALv2.template.md',
  },
  MIT: {
    label: 'MIT',
    url: 'https://raw.githubusercontent.com/spdx/license-list-data/main/text/MIT.txt',
  },
} as const

type License = keyof typeof licenseOptions

async function fetchLicenseText(license: License) {
  const response = await fetch(licenseOptions[license].url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${licenseOptions[license].label} license: ${response.status}`)
  }

  return (await response.text())
    .replace(/\$\{year\}/g, new Date().getFullYear().toString())
    .replace(/\$\{licensor name\}/g, 'Alec Larson')
    .replace(/<year> <copyright holders>/g, `${new Date().getFullYear()} Alec Larson`)
}

function detectPackageManager() {
  const userAgent = process.env.npm_config_user_agent
  const execPath = process.env.npm_execpath

  if (userAgent?.startsWith('bun/') || execPath?.includes('/bun')) return 'bun'
  if (userAgent?.startsWith('pnpm/') || execPath?.includes('/pnpm')) return 'pnpm'

  if (existsSync(resolve(root, 'bun.lock')) || existsSync(resolve(root, 'bun.lockb'))) return 'bun'
  return 'pnpm'
}

function cleanInstallState(pm: 'bun' | 'pnpm') {
  rmSync(resolve(root, 'node_modules'), { recursive: true, force: true })

  if (pm === 'bun') {
    rmSync(resolve(root, 'bun.lock'), { force: true })
    rmSync(resolve(root, 'bun.lockb'), { force: true })
  } else {
    rmSync(resolve(root, 'pnpm-lock.yaml'), { force: true })
  }
}

function getPackageManagerVersion(pm: string) {
  return execSync(`${pm} --version`, { cwd: root, encoding: 'utf8' }).trim()
}

async function main() {
  const pkg = readJSON('package.json')

  if (pkg.name !== 'xxx') {
    // Already initialized — nothing to do.
    process.exit(0)
  }

  intro('Set up your project')

  // ── 1. Project name ────────────────────────────────────────────────────────
  const name = await text({
    message: 'Package name',
    placeholder: 'my-package',
    validate(value) {
      if (!value.trim()) return 'Name is required.'
      if (!/^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(value))
        return 'Must be a valid npm package name.'
    },
  })

  if (isCancel(name)) {
    cancel('Setup cancelled.')
    process.exit(0)
  }

  // ── 2. License ─────────────────────────────────────────────────────────────
  const license = await select<License>({
    message: 'License',
    initialValue: pkg.license as License,
    options: Object.entries(licenseOptions).map(([value, option]) => ({
      value: value as License,
      label: option.label,
    })),
  })

  if (isCancel(license)) {
    cancel('Setup cancelled.')
    process.exit(0)
  }

  // ── 3. Replace xxx occurrences ─────────────────────────────────────────────
  pkg.name = name
  pkg.license = license
  writeText('LICENSE', await fetchLicenseText(license))

  if (pkg.repository?.url) {
    pkg.repository.url = pkg.repository.url.replace(/xxx/g, name as string)
  }

  if (existsSync(resolve(root, 'readme.md'))) {
    writeText('readme.md', readText('readme.md').replace(/\bxxx\b/g, name as string))
  }

  // ── 4. Unset git origin ────────────────────────────────────────────────────
  try {
    execSync('git remote remove origin', { cwd: root, stdio: 'pipe' })
  } catch {
    // No origin remote — that's fine.
  }

  // ── 5. gh repo create ──────────────────────────────────────────────────────
  const createRepo = await confirm({
    message: 'Run `gh repo create` now?',
    initialValue: false,
  })

  if (isCancel(createRepo)) {
    cancel('Setup cancelled.')
    process.exit(0)
  }

  if (createRepo) {
    // Let gh drive the interactive flow.
    execSync('gh repo create', { cwd: root, stdio: 'inherit' })
  }

  // ── 6. Test runner ─────────────────────────────────────────────────────────
  const runner = await select({
    message: 'Test runner',
    options: [
      { value: 'node', label: 'Node + Vitest' },
      { value: 'bun', label: 'Bun + bun:test' },
    ],
  })

  if (isCancel(runner)) {
    cancel('Setup cancelled.')
    process.exit(0)
  }

  if (runner === 'bun') {
    pkg.scripts.test = 'bun test'

    delete pkg.devDependencies['@types/node']
    delete pkg.devDependencies['vitest']
    pkg.devDependencies['@types/bun'] = '*'

    // Keep devDependencies sorted.
    pkg.devDependencies = Object.fromEntries(
      Object.entries(pkg.devDependencies as Record<string, string>).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    )

    // Switch test tsconfig to bun-types.
    const testTs = readJSON('test/tsconfig.json')
    testTs.compilerOptions.types = ['bun']
    writeJSON('test/tsconfig.json', testTs)

    // vitest config is no longer needed.
    try {
      unlinkSync(resolve(root, 'vitest.config.ts'))
    } catch {}
  }

  // ── 7. Configure the chosen package manager ───────────────────────────────
  const pm = runner === 'bun' ? 'bun' : detectPackageManager()
  pkg.packageManager = `${pm}@${getPackageManagerVersion(pm)}`

  if (pm === 'pnpm') {
    writeText(
      'pnpm-workspace.yaml',
      `packages:\n  - .\nminimumReleaseAge: ${sevenDaysInMinutes}\nallowBuilds:\n  esbuild: true\n`,
    )
  }

  if (pm === 'bun') {
    writeText('bunfig.toml', `[install]\nminimumReleaseAge = ${sevenDaysInSeconds}\n`)
  }

  // ── 8. Clean up prepare machinery from package.json ───────────────────────
  delete pkg.scripts.prepare
  delete (pkg.devDependencies as Record<string, string>)['@clack/prompts']
  delete (pkg.devDependencies as Record<string, string>)['tsx']

  writeJSON('package.json', pkg)

  // ── 9. Install ─────────────────────────────────────────────────────────────
  cleanInstallState(pm)

  const installCommand = pm === 'bun' ? 'bun update --latest' : 'pnpm up --latest'
  execSync(installCommand, { cwd: root, stdio: 'inherit' })

  // ── 10. Self-delete ─────────────────────────────────────────────────────────
  unlinkSync(resolve(root, 'scripts/prepare.ts'))
  try {
    if (readdirSync(resolve(root, 'scripts')).length === 0) {
      rmdirSync(resolve(root, 'scripts'))
    }
  } catch {}

  // ── 11. Squash history into a clean first commit ──────────────────────────
  execSync(
    'git update-ref -d HEAD && git add -A && git commit -m "initialize typescript template"',
    { cwd: root, stdio: 'inherit', shell: true },
  )

  outro("You're all set! Happy coding 🚀")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
