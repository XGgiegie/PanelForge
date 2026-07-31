import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
})

const defaultLinkOpen =
  markdown.renderer.rules.link_open ??
  ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))

markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index]
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noreferrer')

  return defaultLinkOpen(tokens, index, options, env, self)
}

export function renderMarkdown(value: string) {
  return markdown.render(value)
}
