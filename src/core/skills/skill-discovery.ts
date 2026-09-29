/**
 * SkillDiscovery & Frontmatter Parser
 * Discovers skills from workspace .agents/skills/ and .skills/ directories.
 */

import type { IWorkspacePort } from '../ports';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  filePath: string;
  triggers?: string[];
  systemPrompt?: string;
}

export const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    id: 'clear',
    name: 'clear',
    description: 'Clear current chat display and reset active view',
    filePath: 'builtin:clear',
  },
  {
    id: 'tdd',
    name: 'tdd',
    description: 'Test-Driven Development workflow (RED -> GREEN -> REFACTOR)',
    filePath: 'builtin:tdd',
    systemPrompt: 'Follow TDD strictly. Write minimal failing tests before writing implementation code.',
  },
  {
    id: 'review',
    name: 'review',
    description: 'Perform rigorous architectural and code quality review',
    filePath: 'builtin:review',
    systemPrompt: 'Review the codebase focusing on Clean Architecture, ports & adapters, and invariants.',
  },
  {
    id: 'design',
    name: 'design',
    description: 'Technical design & trade-offs analysis before implementation',
    filePath: 'builtin:design',
    systemPrompt: 'Produce technical specifications with clear failure modes and executable acceptance criteria.',
  },
];

export function parseSkillFrontmatter(content: string, filePath: string): SkillDefinition | null {
  const normalized = content.replace(/\r\n/g, '\n');
  const pathParts = filePath.replace(/\\/g, '/').split('/');
  const dirName = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : 'skill';

  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    // Fallback: check for first markdown header
    const headerMatch = normalized.match(/^#\s+(.+)$/m);
    const desc = headerMatch ? headerMatch[1].trim() : `${dirName} skill`;
    return {
      id: dirName,
      name: dirName,
      description: desc,
      filePath,
    };
  }

  const yamlBlock = fmMatch[1];
  let name = dirName;
  let description = `${dirName} skill`;
  const triggers: string[] = [];

  const lines = yamlBlock.split('\n');
  let inTriggers = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('name:')) {
      name = trimmed.slice(5).trim().replace(/^['"]|['"]$/g, '');
      inTriggers = false;
    } else if (trimmed.startsWith('description:')) {
      description = trimmed.slice(12).trim().replace(/^['"]|['"]$/g, '');
      inTriggers = false;
    } else if (trimmed.startsWith('triggers:')) {
      inTriggers = true;
    } else if (inTriggers && trimmed.startsWith('-')) {
      const trigger = trimmed.slice(1).trim().replace(/^['"]|['"]$/g, '');
      if (trigger) triggers.push(trigger);
    } else {
      inTriggers = false;
    }
  }

  return {
    id: name || dirName,
    name: name || dirName,
    description,
    filePath,
    triggers: triggers.length > 0 ? triggers : undefined,
  };
}

export class SkillDiscovery {
  public async findSkills(
    workspaceRoot: string,
    workspace: IWorkspacePort
  ): Promise<SkillDefinition[]> {
    const discovered: SkillDefinition[] = [];
    const searchDirs = [
      `${workspaceRoot}/.agents/skills`,
      `${workspaceRoot}/.skills`,
    ];

    for (const searchDir of searchDirs) {
      try {
        if (!workspace.listDirectory) continue;
        const subdirs = await workspace.listDirectory(searchDir);
        for (const subdir of subdirs) {
          const skillFile = `${searchDir}/${subdir}/SKILL.md`;
          let exists = true;
          if (workspace.fileExists) {
            exists = await workspace.fileExists(skillFile);
          }
          if (exists) {
            try {
              const content = await workspace.readFile(skillFile);
              const skill = parseSkillFrontmatter(content, skillFile);
              if (skill) {
                discovered.push(skill);
              }
            } catch {
              // File not readable
            }
          }
        }
      } catch {
        // Directory doesn't exist, continue
      }
    }

    // Merge with built-in skills, deduplicating by ID
    const all = [...discovered];
    for (const builtin of BUILTIN_SKILLS) {
      if (!all.some((s) => s.id === builtin.id)) {
        all.push(builtin);
      }
    }

    return all;
  }
}
