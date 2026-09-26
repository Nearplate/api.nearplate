import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
	globalIgnores(["dist", "node_modules", "coverage"]),
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.node, ...globals.jest },
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			"@typescript-eslint/no-namespace": "off",
			"no-console": "warn",
		},
	},
	{
		files: ["**/*.cjs"],
		rules: {
			"@typescript-eslint/no-require-imports": "off",
			"no-console": "off",
		},
	},
	prettier,
);
