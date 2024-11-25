import { default as development } from "./index.development";
import { default as staging } from "./index.staging";
import { default as production } from "./index.production";
import { Config } from "./type";

const APP_ENV = process.env.APP_ENV ?? "development";

const _config = {
  development,
  staging,
  production,
};

export const config: Config =
  _config[APP_ENV as keyof typeof _config] ?? _config.development;
