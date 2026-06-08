import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_NAME, WINDOWS_APP_ID } from './appIdentity.js'
import {
  createNotificationAvatarBitmap,
  getNotificationInitials
} from './notificationAvatar.js'

test('derives initials from display names and email addresses', () => {
  assert.equal(getNotificationInitials('Mario Rossi <mario@example.com>'), 'MR')
  assert.equal(getNotificationInitials('mario.rossi@example.com'), 'MR')
  assert.equal(getNotificationInitials('Apple'), 'AP')
})

test('renders white initial pixels over the colored avatar', () => {
  const { buffer, initials } = createNotificationAvatarBitmap('Mario Rossi', 64)
  let whitePixels = 0

  for (let offset = 0; offset < buffer.length; offset += 4) {
    if (
      buffer[offset] === 255 &&
      buffer[offset + 1] === 255 &&
      buffer[offset + 2] === 255 &&
      buffer[offset + 3] === 255
    ) {
      whitePixels++
    }
  }

  assert.equal(initials, 'MR')
  assert.ok(whitePixels > 100)
})

test('Windows application identity matches the packaged application', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

  assert.equal(APP_NAME, packageJson.build.productName)
  assert.equal(WINDOWS_APP_ID, packageJson.build.appId)
  assert.ok(fs.statSync(path.join(root, packageJson.build.win.icon)).size > 0)
})
