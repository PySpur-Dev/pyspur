import { generate } from "openapi-typescript-codegen";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

console.log("process.env.API_URL", process.env.API_URL);

generate({
  input: `${process.env.API_URL}/openapi.json`,
  output: "./src/api/generated",
  useUnionTypes: false,
  httpClient: "axios",
  clientName: "PySpurAPI",
  exportCore: true,
  exportModels: true,
  exportSchemas: true,
  exportServices: true,
  indent: "tab",
  write: true,
});
