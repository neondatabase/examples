/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for @huggingface/transformers to work in Node.js
  serverExternalPackages: ['@huggingface/transformers'],
  
  // Exclude large ONNX runtime files to stay under Vercel's 250MB limit
  // Keep only the essential files needed for inference
  outputFileTracingExcludes: {
    '/api/search': [
      'node_modules/onnxruntime-node/bin/napi-v3/linux/x64/!(libonnxruntime.so.1|onnxruntime_binding.node)',
    ],
  },
}

export default nextConfig
