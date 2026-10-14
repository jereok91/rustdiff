import { Fragment } from "react"

import { cn } from "@/lib/utils"

type Tok = { text: string; cls: string }

const TOKEN_RE =
  /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])|(\s+)|(.)/g

const CLS = {
  key: "text-syntax-key",
  string: "text-syntax-string",
  number: "text-syntax-number",
  literal: "text-syntax-literal",
  punct: "text-syntax-punct",
  plain: "",
}

export function tokenizeJsonLine(line: string): Tok[] {
  const out: Tok[] = []
  for (const m of line.matchAll(TOKEN_RE)) {
    const [, str, colon, num, lit, punct, ws, other] = m
    if (str !== undefined) {
      out.push({ text: str, cls: colon ? CLS.key : CLS.string })
      if (colon) out.push({ text: colon, cls: CLS.punct })
    } else if (num !== undefined) out.push({ text: num, cls: CLS.number })
    else if (lit !== undefined) out.push({ text: lit, cls: CLS.literal })
    else if (punct !== undefined) out.push({ text: punct, cls: CLS.punct })
    else out.push({ text: ws ?? other ?? "", cls: CLS.plain })
  }
  return out
}

/** Pinta una línea JSON con resaltado y, opcionalmente, un rango enfatizado. */
export function JsonLine({
  text,
  emphasis,
  emphasisClassName,
}: {
  text: string
  emphasis?: [number, number]
  emphasisClassName?: string
}) {
  const toks = tokenizeJsonLine(text)
  let pos = 0
  return (
    <>
      {toks.map((t, i) => {
        const start = pos
        const end = (pos += t.text.length)
        if (!emphasis || end <= emphasis[0] || start >= emphasis[1] || emphasis[0] === emphasis[1])
          return (
            <span key={i} className={t.cls}>
              {t.text}
            </span>
          )
        const a = Math.max(emphasis[0], start) - start
        const b = Math.min(emphasis[1], end) - start
        return (
          <Fragment key={i}>
            {a > 0 && <span className={t.cls}>{t.text.slice(0, a)}</span>}
            <mark className={cn("rounded-[3px] px-px", emphasisClassName)}>{t.text.slice(a, b)}</mark>
            {b < t.text.length && <span className={t.cls}>{t.text.slice(b)}</span>}
          </Fragment>
        )
      })}
    </>
  )
}
