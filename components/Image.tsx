import Image, { ImageProps, ImageLoader } from 'next/image'
import { getWorkerOrigin } from '../lib/workerHelpers'


const CloudflareImageLoader: ImageLoader = ({ src, width, quality = 75 }) => {
  const searchParams = new URLSearchParams()
  searchParams.set('width', width.toString())
  searchParams.set('quality', quality.toString())
  searchParams.set('src', src)
  return `${getWorkerOrigin()}/api/image?${searchParams.toString()}`
}

const CloudflareImage = (props: ImageProps) => {
  /* eslint-disable jsx-a11y/alt-text */
  if (process.env.NODE_ENV === 'development') {
    // Called when running `next dev`
    return <Image {...props} unoptimized={true} />
  } else {
    // Called when running served static export `wrangler pages dev ./out`
    return <Image {...props} loader={CloudflareImageLoader} />
  }
  /* eslint-enable jsx-a11y/alt-text */
}

export default CloudflareImage