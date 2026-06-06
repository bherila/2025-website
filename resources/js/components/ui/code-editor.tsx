import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import CodeMirror, { EditorView, type Extension } from '@uiw/react-codemirror'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: 'markdown' | 'json' | 'plain'
  height?: string
  placeholder?: string
  className?: string
  readOnly?: boolean
  ariaLabel?: string
  ariaLabelledBy?: string
}

const LANGUAGE_EXTENSIONS: Record<string, Extension[]> = {
  markdown: [markdown()],
  json: [],
  plain: [],
}

export function CodeEditor({
  value,
  onChange,
  language = 'plain',
  height = '70vh',
  placeholder,
  className,
  readOnly = false,
  ariaLabel,
  ariaLabelledBy,
}: CodeEditorProps): React.JSX.Element {
  const accessibilityExtensions: Extension[] = ariaLabel !== undefined || ariaLabelledBy !== undefined
    ? [
        EditorView.contentAttributes.of({
          ...(ariaLabel !== undefined ? { 'aria-label': ariaLabel } : {}),
          ...(ariaLabelledBy !== undefined ? { 'aria-labelledby': ariaLabelledBy } : {}),
        }),
      ]
    : []
  const extensions: Extension[] = [
    ...(LANGUAGE_EXTENSIONS[language] ?? []),
    ...accessibilityExtensions,
  ]

  return (
    <CodeMirror
      value={value}
      height={height}
      extensions={extensions}
      theme={oneDark}
      onChange={onChange}
      readOnly={readOnly}
      {...(placeholder !== undefined ? { placeholder } : {})}
      className={className}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: true,
        highlightSpecialChars: true,
        foldGutter: false,
        dropCursor: true,
        allowMultipleSelections: true,
        indentOnInput: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: false,
        rectangularSelection: true,
        crosshairCursor: true,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
        closeBracketsKeymap: true,
        defaultKeymap: true,
        searchKeymap: true,
        historyKeymap: true,
        foldKeymap: false,
        completionKeymap: false,
        lintKeymap: false,
      }}
    />
  )
}
