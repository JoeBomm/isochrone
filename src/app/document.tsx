import styles from "./styles/app.css?url";

/**
 * HTML shell. Docs checked 2026-11-19 (context7 /redwoodjs/sdk, guides
 * "Documents" and "Tailwind"): global CSS is imported with `?url` and linked in
 * <head>. Fonts are self-hosted (@fontsource-variable, bundled via app.css), so
 * no third-party font hosts are needed.
 */
export const Document: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light dark" />
      <title>Halfway: find a fair place to meet</title>
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="stylesheet" href={styles} />
      <link rel="modulepreload" href="/src/client.tsx" />
    </head>
    <body>
      {children}
      <script>import("/src/client.tsx")</script>
    </body>
  </html>
);
