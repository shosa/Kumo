import React, { useEffect, useMemo, useRef } from 'react'

export default function QuotedMessagePreview({ html, title }) {
  const iframeRef = useRef(null)
  const srcDoc = useMemo(() => `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    html,body{margin:0;padding:0;background:transparent;color:#6e6e73}
    html{overflow:hidden}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.55;overflow-x:auto;overflow-y:hidden;overflow-wrap:anywhere}
    img{max-width:100%;height:auto}
    table{max-width:100%!important}
    pre{white-space:pre-wrap}
  </style>
</head>
<body>${html}</body>
</html>`, [html])

  useEffect(() => () => {
    iframeRef.current?._quotedResizeObserver?.disconnect()
  }, [])

  if (!html) return null

  function resizeIframe() {
    const iframe = iframeRef.current
    const documentElement = iframe?.contentDocument?.documentElement
    if (!iframe || !documentElement) return

    const updateHeight = () => {
      iframe.style.height = '0px'
      iframe.style.height = `${Math.max(80, documentElement.scrollHeight)}px`
    }

    iframe._quotedResizeObserver?.disconnect()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(documentElement)
    if (iframe.contentDocument?.body) observer.observe(iframe.contentDocument.body)
    iframe._quotedResizeObserver = observer
    updateHeight()
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
