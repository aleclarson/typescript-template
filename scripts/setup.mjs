import { spawnSync } from 'node:child_process'

const userAgent = process.env.npm_config_user_agent
const execPath = process.env.npm_execpath
const pm =
  userAgent?.startsWith('bun/') || execPath?.includes('/bun')
    ? 'bun'
    : userAgent?.startsWith('pnpm/') || execPath?.includes('/pnpm')
      ? 'pnpm'
      : null

if (!pm) {
  console.error('Run setup with `pnpm run setup` or `bun run setup`.')
  process.exit(1)
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(pm, [
  'install',
  '--ignore-scripts',
  ...(pm === 'pnpm' ? ['--config.strict-dep-builds=false'] : []),
])
run(pm, pm === 'bun' ? ['x', 'tsx', 'scripts/prepare.ts'] : ['exec', 'tsx', 'scripts/prepare.ts'])
