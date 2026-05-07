import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="description" content="Whilo — a daily word game for mindful reflection. One poetic riddle, one word, one moment of pause." />
        <meta name="theme-color" content="#FAF7F0" />

        {/* Open Graph — for sharing previews */}
        <meta property="og:title" content="Whilo" />
        <meta property="og:description" content="A daily word game for mindful reflection." />
        <meta property="og:url" content="https://playwhilo.com" />
        <meta property="og:type" content="website" />

        {/* Twitter card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Whilo" />
        <meta name="twitter:description" content="One word. One reflection. One day." />

        {/* Favicon — add your own favicon.ico to /public */}
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
