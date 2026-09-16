/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app is local-only: it reads the user's Claude Code transcripts from
  // disk and never talks to the network.
  poweredByHeader: false,
};

export default nextConfig;
