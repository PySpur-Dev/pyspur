import { config } from "@/config";
import { PySpurAPI } from "./generated";

export const API = new PySpurAPI({
  BASE: config.apiUrl,
});
