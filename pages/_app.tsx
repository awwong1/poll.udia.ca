import { ChakraProvider } from '@chakra-ui/react'
import type { AppProps } from 'next/app'
import Head from 'next/head'

function MyApp({ Component, pageProps }: AppProps) {
  return <ChakraProvider>
    <Head>
      <title>Poll - UDIA</title>
      <meta name='description' content='Create a free poll, running on the Cloudflare edge network.' />
      <link rel='icon' href='/favicon.ico' />
    </Head>
    <Component {...pageProps} />
  </ChakraProvider>
}

export default MyApp
