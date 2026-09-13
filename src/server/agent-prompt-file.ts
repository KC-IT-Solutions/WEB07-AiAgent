const AGENT_PROMPT_FILE_EXTENSIONS = ['.md', '.txt'];

export function isAgentPromptFilePath(path: string): boolean {
  return !(
    path.length === 0 ||
    path.length > 2_048 ||
    path.includes('\0') ||
    path.includes('\\') ||
    path.includes(':') ||
    path.startsWith('/') ||
    /%(?:2e|2f|5c)/i.test(path) ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..') ||
    !AGENT_PROMPT_FILE_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension))
  );
}
