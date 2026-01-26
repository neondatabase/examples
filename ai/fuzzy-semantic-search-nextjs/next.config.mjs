/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for @huggingface/transformers to work in Node.js
  serverExternalPackages: ['@huggingface/transformers'],
}

export default nextConfig
