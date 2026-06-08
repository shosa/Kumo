import { useEffect } from 'react'

export function resolveTheme(theme, matchMedia = window.matchMedia) {
  if (theme !== 'system') return theme || 'light'

  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyAppearance(settings, root = document.documentElement, matchMedia = window.matchMedia) {
  root.setAttribute('data-theme', resolveTheme(settings?.theme, matchMedia))

  if (settings?.accentColor) {
    root.style.setProperty('--accent', settings.accentColor)
  }
}

export function useAppearance(settings) {
  useEffect(() => {
    applyAppearance(settings)

    if (settings?.theme !== 'system') return undefined

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const applySystemTheme = () => applyAppearance(settings)
    mediaQuery.addEventListener('change', applySystemTheme)
    return () => mediaQuery.removeEventListener('change', applySystemTheme)
  }, [settings?.theme, settings?.accentColor])
}
