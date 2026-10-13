import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type TemplateValues = Record<string, string | number>;

const PLACEHOLDER = /{{\s*([\w]+)\s*}}/g;

/**
 * Loads templates from `src/mail/templates` (or the copy in `dist`) and fills
 * `{{placeholders}}`. HTML values are escaped unless listed as trusted.
 */
export class MailTemplateRenderer {
  private readonly cache = new Map<string, string>();

  text(fileName: string, values: TemplateValues) {
    return this.load(fileName).replace(PLACEHOLDER, (_, key: string) =>
      values[key] === undefined ? '' : String(values[key]),
    );
  }

  html(fileName: string, values: TemplateValues, trustedKeys: string[] = []) {
    return this.load(fileName).replace(PLACEHOLDER, (_, key: string) => {
      if (values[key] === undefined) {
        return '';
      }

      const value = String(values[key]);

      return trustedKeys.includes(key) ? value : escapeHtml(value);
    });
  }

  private load(fileName: string) {
    const cached = this.cache.get(fileName);

    if (cached) {
      return cached;
    }

    const template = readFileSync(resolveTemplatePath(fileName), 'utf8');
    this.cache.set(fileName, template);

    return template;
  }
}

function resolveTemplatePath(fileName: string) {
  const paths = [
    join(__dirname, 'templates', fileName),
    join(process.cwd(), 'src', 'mail', 'templates', fileName),
    join(process.cwd(), 'dist', 'src', 'mail', 'templates', fileName),
  ];

  const templatePath = paths.find((path) => existsSync(path));

  if (!templatePath) {
    throw new Error(`Mail template not found: ${fileName}`);
  }

  return templatePath;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
