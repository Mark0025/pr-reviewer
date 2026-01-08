import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["**/*.tsx", "**/*.ts"],
    rules: {
      // Form Component Rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      
      // Server Action Rules
      "no-restricted-imports": ["error", {
        "patterns": [
          {
            "group": ["appwrite"],
            "message": "Please use @/app/lib/services/appwrite instead of direct appwrite imports"
          }
        ]
      }],
      
      // Validation Rules
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": ["error", {
        "allowExpressions": true,
        "allowTypedFunctionExpressions": true
      }],
      
      // Error Handling Rules
      "no-console": ["error", { 
        "allow": ["log", "error", "warn"],
        "message": "Please use structured logging with timestamps"
      }],
      
      // Security Rules
      "no-process-env": "error",
      "no-unsafe-finally": "error",
      
      // Performance Rules
      "react/jsx-no-constructed-context-values": "error",
      "react/jsx-no-useless-fragment": "error",
      
      // Documentation Rules
      "jsdoc/require-jsdoc": ["error", {
        "publicOnly": true,
        "require": {
          "FunctionDeclaration": true,
          "MethodDefinition": true,
          "ClassDeclaration": true
        }
      }]
    }
  },
  {
    files: ["**/actions/**/*.ts"],
    rules: {
      "no-console": ["error", { 
        "allow": ["log", "error", "warn"],
        "message": "Please use structured logging with timestamps"
      }],
      "@typescript-eslint/explicit-function-return-type": "error",
      "no-restricted-imports": ["error", {
        "patterns": [
          {
            "group": ["appwrite"],
            "message": "Please use @/app/lib/services/appwrite instead of direct appwrite imports"
          }
        ]
      }]
    }
  },
  {
    files: ["**/components/forms/**/*.tsx"],
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      "react/jsx-no-constructed-context-values": "error",
      "react/jsx-no-useless-fragment": "error",
      "jsdoc/require-jsdoc": "error"
    }
  }
];

export default eslintConfig; 