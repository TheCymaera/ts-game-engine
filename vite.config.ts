import * as vite from "vite";
// @ts-expect-error
import path from "path";
// @ts-expect-error
const absPath = (p: string) => path.resolve(__dirname, p) as string;


export default vite.defineConfig({
	root: absPath("src"),
	publicDir: absPath("static"),

	base: "./",

	resolve: {
		tsconfigPaths: true,
	},

	build: {
		emptyOutDir: true,
		rollupOptions: {
			output: {
				dir: absPath("dist"),
			}
		}
	}
});