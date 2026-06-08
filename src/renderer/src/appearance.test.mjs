import test from 'node:test'
import assert from 'node:assert/strict'
import { applyAppearance, resolveTheme } from './appearance.js'

function matchMedia(matches) {
  return () => ({ matches })
}

function rootStub() {
  const attrs = new Map()
  const vars = new Map()
  return {
    attrs,
    vars,
    setAttribute: (key, value) => attrs.set(key, value),
    style: {
      setProperty: (key, value) => vars.set(key, value)
    }
  }
}

test('resolves explicit theme without consulting system preference', () => {
  assert.equal(resolveTheme('dark', matchMedia(false)), 'dark')
  assert.equal(resolveTheme('light', matchMedia(true)), 'light')
})

test('resolves system theme from matchMedia', () => {
  assert.equal(resolveTheme('system', matchMedia(true)), 'dark')
  assert.equal(resolveTheme('system', matchMedia(false)), 'light')
})

test('applies theme and accent color to the document root', () => {
  const root = rootStub()

  applyAppearance({ theme: 'dark', accentColor: '#ff2d55' }, root, matchMedia(false))

  assert.equal(root.attrs.get('data-theme'), 'dark')
  assert.equal(root.vars.get('--accent'), '#ff2d55')
})
