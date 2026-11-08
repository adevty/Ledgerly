/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  experimental: {
    optimizePackageImports: [
      "@react-three/drei",
      "three",
      "three-stdlib",
      "framer-motion",
      "lucide-react",
    ],
  },
};

export default nextConfig;
