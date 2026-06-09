import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

async function pathSize(path) {
  try {
    const info = await stat(path)
    if (info.isFile()) return info.size
    if (!info.isDirectory()) return 0

    const entries = await readdir(path, { withFileTypes: true })
    const sizes = await Promise.all(entries.map(entry => pathSize(join(path, entry.name))))
    return sizes.reduce((total, size) => total + size, 0)
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
}

export function getDirectorySize(path) {
  return pathSize(path)
}

export async function getFileSize(path) {
  try {
    const info = await stat(path)
    return info.isFile() ? info.size : 0
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
}

export async function clearDirectoryContents(path) {
  let entries
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }

  const bytes = await getDirectorySize(path)
  await Promise.all(entries.map(entry =>
    rm(join(path, entry.name), { recursive: true, force: true })
  ))
  return bytes
}
