import MarkdownIt from 'markdown-it'

// Finding text is written by the LLM from pages under test, so it is untrusted. Raw HTML is off, and
// markdown-it's default validateLink already drops javascript:, vbscript:, file: and non-image data: URLs.
// This is the only place that produces `v-html` input.
const md = new MarkdownIt({ html: false, linkify: false, breaks: true })

const renderLink =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx]!.attrSet('target', '_blank')
  tokens[idx]!.attrSet('rel', 'noopener noreferrer nofollow')
  return renderLink(tokens, idx, options, env, self)
}

export function renderMarkdown(text: string): string {
  return md.render(text)
}
