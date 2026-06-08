import React, { useMemo, useRef } from 'react'

export default function QuotedMessagePreview({ html, title }) {
  const iframeRef = useRef(null)
  const srcDoc = useMemo(() => `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    html,body{margin:0;padding:0;background:transparent;color:#6e6e73}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.55;overflow:hidden}
    img{max-width:100%;height:auto}
    table{max-width:100%}
    pre{white-space:pre-wrap}
  </style>
</head>
<body>${html}</body>
</html>`, [html])

  if (!html) return null

  function resizeIframe() {
    const iframe = iframeRef.current
    const height = iframe?.contentDocument?.documentElement?.scrollHeight
    if (iframe && height) iframe.style.height = `${height}px`
  }

  return (
    <div className="compose-quoted-message">
      <iframe
        ref={iframeRef}
        title={title}
        srcDoc={srcDoc}
        sandbox="allow-same-origin"
        onLoad={resizeIframe}
      />
    </div>
  )
}
