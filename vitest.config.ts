import tsconfigPaths from "vite-tsconfig-paths";

export default {
  esbuild: { target: "esnext" },
  plugins: [tsconfigPaths({})],
};
