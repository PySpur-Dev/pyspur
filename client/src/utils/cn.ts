import classNames from "classnames";
import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
	return classNames(clsx(inputs));
}
