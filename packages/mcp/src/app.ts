/** Assembles the AbsoluteUI MCP server from a content snapshot (used by the bin and the tests). */
import { createServer, type Server } from './server.js';
import type { Content } from './content/types.js';
import { createSearchIndex } from './content/search.js';
import { docTools } from './tools/docs.js';
import { validationTools } from './tools/validate.js';
import { createResources } from './resources.js';
import { INSTRUCTIONS } from './instructions.js';
import { prompts } from './prompts.js';
import type { PromptDefinition, ToolDefinition } from './surface.js';

export interface AppOptions {
  readonly extraTools?: readonly ToolDefinition[];
  readonly prompts?: readonly PromptDefinition[];
}

export function createAbsoluteUIServer(content: Content, options: AppOptions = {}): Server {
  const index = createSearchIndex(content);
  return createServer({
    info: { name: 'absoluteui', title: 'AbsoluteUI', version: content.version },
    instructions: INSTRUCTIONS(content.version),
    surface: { tools: [...docTools(content, index), ...validationTools(content), ...(options.extraTools ?? [])], resources: createResources(content), prompts: options.prompts ?? prompts(content) },
  });
}
