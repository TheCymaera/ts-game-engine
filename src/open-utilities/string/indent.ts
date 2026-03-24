export function indent(string: string, indentation: string) {
	return string.replace(/^/gm, indentation);
}