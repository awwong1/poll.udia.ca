This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) hosted on the [Cloudflare Pages](https://pages.cloudflare.com/) platform.

## Getting Started

Run the Workers endpoint and the Next.js development site in two separate shell instances.

```bash
# within the root directory of this repo
yarn
yarn dev

# and within the `/workers` directory
yarn
yarn pub # needs to be run once at the start, but can be skipped afterwards for local development
yarn dev
```

The following approach was provided by the [Cloudflare Pages documentation on how to run locally](https://developers.cloudflare.com/pages/platform/functions#develop-and-preview-locally), but does not appear to be fully stable yet.

Run the development server:
```bash
yarn
yarn start:cf
# Alternatively, if no dependency on the workers are needed
yarn dev # should serve on port 3000
```

Open [http://localhost:8788](http://localhost:8788) with your browser to see the result.

## License

[Apache-2.0](LICENSE)

```text
Copyright 2021 Alexander Wong <alex@udia.ca>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
