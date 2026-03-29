import { defineConfig } from "oxlint";

export default defineConfig({
	options: {
		typeAware: true,
	},
	rules: {
		"typescript/no-unsafe-argument": "error",
		"typescript/no-unsafe-assignment": "error",
		"typescript/no-unsafe-call": "error",
		"typescript/no-unsafe-declaration-merging": "error",
		"typescript/no-unsafe-enum-comparison": "error",
		"typescript/no-unsafe-finally": "error",
		//"typescript/no-unsafe-function-type": "error",
		"typescript/no-unsafe-member-access": "error",
		"typescript/no-unsafe-negation": "error",
		"typescript/no-unsafe-optional-chaining": "error",
		"typescript/no-unsafe-return": "error",
		//"typescript/no-unsafe-type-assertion": "error",
		"typescript/no-unsafe-unary-minus": "error",
		//"typescript/strict-boolean-expressions": "error",
		"typescript/no-unnecessary-condition": ["error", {
			allowConstantLoopConditions: "only-allowed-literals",
		}],
	}
});