import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getDirectorySize, clearDirectoryContents } from './storageFiles.js'

test('measures nested storage and clears only directory contents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kumo-storage-'))
  const nested = join(root, 'nested')
  await mkdir(nested)
  await writeFile(join(root, 'one.bin'), Buffer.alloc(10))
  await writeFile(join(nested, 'two.bin'), Buffer.alloc(7))

  assert.equal(await getDirectorySize(root), 17)
  assert.equal(await clearDirectoryContents(root), 17)
  assert.equal(await getDirectorySize(root), 0)
  await access(root)
})
