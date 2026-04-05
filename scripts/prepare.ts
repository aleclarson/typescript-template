import { cancel, confirm, intro, isCancel, outro, select, text } from '@clack/prompts'
import { execSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
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

function detectPackageManager() {
  if (existsSync(resolve(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(resolve(root, 'yarn.lock'))) return 'yarn'
  if (existsSync(resolve(root, 'bun.lockb'))) return 'bun'
  return 'npm'
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

  // ── 2. Replace xxx occurrences ─────────────────────────────────────────────
  pkg.name = name
  if (pkg.repository?.url) {
    pkg.repository.url = pkg.repository.url.replace(/xxx/g, name as string)
  }

  if (existsSync(resolve(root, 'readme.md'))) {
    writeText('readme.md', readText('readme.md').replace(/\bxxx\b/g, name as string))
  }

  // ── 3. Unset git origin ────────────────────────────────────────────────────
  try {
    execSync('git remote remove origin', { cwd: root, stdio: 'pipe' })
  } catch {
    // No origin remote — that's fine.
  }

  // ── 4. gh repo create ──────────────────────────────────────────────────────
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

  // ── 5. Test runner ─────────────────────────────────────────────────────────
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

  // ── 6. Clean up prepare machinery from package.json ───────────────────────
  delete pkg.scripts.prepare
  delete (pkg.devDependencies as Record<string, string>)['@clack/prompts']
  delete (pkg.devDependencies as Record<string, string>)['tsx']

  writeJSON('package.json', pkg)

  // ── 7. Install ─────────────────────────────────────────────────────────────
  const pm = runner === 'bun' ? 'bun' : detectPackageManager()
  execSync(`${pm} install`, { cwd: root, stdio: 'inherit' })

  // ── 8. Self-delete ─────────────────────────────────────────────────────────
  unlinkSync(resolve(root, 'scripts/prepare.ts'))
  try {
    if (readdirSync(resolve(root, 'scripts')).length === 0) {
      rmdirSync(resolve(root, 'scripts'))
    }
  } catch {}

  // ── 9. Squash history into a clean first commit ───────────────────────────
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
