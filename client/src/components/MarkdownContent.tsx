import { memo, useEffect, useMemo, useState } from 'react';
import { Streamdown, type Components, type ControlsConfig, type DiagramPlugin } from 'streamdown';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import 'streamdown/styles.css';
import 'katex/dist/katex.min.css';

// Mermaid weighs over a megabyte, so the diagram plugin (which imports it
// statically) is fetched on demand the first time a message actually contains
// a mermaid fence, and reused for every message after that.
let loadedMermaidPlugin: DiagramPlugin | null = null;
let mermaidPluginPromise: Promise<DiagramPlugin> | null = null;

function loadMermaidPlugin(): Promise<DiagramPlugin> {
  mermaidPluginPromise ??= import('@streamdown/mermaid').then(({ createMermaidPlugin }) => {
    // Neutral renders legibly on both the light and dark app themes.
    loadedMermaidPlugin = createMermaidPlugin({ config: { theme: 'neutral' } });
    return loadedMermaidPlugin;
  });
  return mermaidPluginPromise;
}

function useMermaidPlugin(content: string): DiagramPlugin | null {
  const needsMermaid = content.includes('```mermaid');
  const [plugin, setPlugin] = useState(loadedMermaidPlugin);

  useEffect(() => {
    if (!needsMermaid || plugin) return;
    let cancelled = false;
    void loadMermaidPlugin().then((loaded) => {
      if (!cancelled) setPlugin(loaded);
    });
    return () => { cancelled = true; };
  }, [needsMermaid, plugin]);

  return needsMermaid ? plugin : null;
}

const basePlugins = { code, math };

const controls: ControlsConfig = {
  code: { copy: true, download: false },
  table: false,
  mermaid: false,
};

const components: Components = {
  a: ({ href, children, node: _node, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 decoration-zinc-300 dark:decoration-zinc-600 hover:decoration-zinc-500 dark:hover:decoration-zinc-400 transition-colors"
      {...props}
    >
      {children}
    </a>
  ),
};

const compactMarkdownClassName = [
  'mobile-chat-content min-w-0 max-w-full overflow-hidden text-sm leading-relaxed text-zinc-700 dark:text-zinc-300',
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base',
  '[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-sm',
  '[&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-sm',
  '[&_p]:mb-2 [&_p:last-child]:mb-0',
  '[&_ul]:mb-2 [&_ul:last-child]:mb-0 [&_ol]:mb-2 [&_ol:last-child]:mb-0',
  '[&_blockquote]:my-2',
  '[&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:text-[13px] [&_code]:text-[13px]',
  '[&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
].join(' ');

export const MarkdownContent = memo(function MarkdownContent({
  content,
  isStreaming = false,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  const mermaidPlugin = useMermaidPlugin(content);
  const plugins = useMemo(
    () => (mermaidPlugin ? { ...basePlugins, mermaid: mermaidPlugin } : basePlugins),
    [mermaidPlugin],
  );

  return (
    <Streamdown
      animated={isStreaming}
      caret={isStreaming ? 'block' : undefined}
      className={compactMarkdownClassName}
      components={components}
      controls={controls}
      isAnimating={isStreaming}
      plugins={plugins}
    >
      {content}
    </Streamdown>
  );
});
