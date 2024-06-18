import clsx from 'clsx'
import ReactMarkdown from 'react-markdown'

interface MarkdownProps {
  message: string
}

const Markdown = ({ message }: MarkdownProps) => {
  return (
    <ReactMarkdown
      components={{
        a({ children, href }) {
          return (
            <a href={href} target="_blank" className="underline text-black">
              {children}
            </a>
          )
        },
      }}
      className={clsx('w-full prose break-words prose-p:leading-relaxed prose-pre:p-0')}
    >
      {message}
    </ReactMarkdown>
  )
}

export default Markdown
