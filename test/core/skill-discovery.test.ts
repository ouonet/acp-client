import { describe, it, expect, vi } from "vitest";
import {
  SkillDiscovery,
  parseSkillFrontmatter,
} from "../../src/core/skills/skill-discovery";
import type { IWorkspacePort } from "../../src/core/ports";

describe("T4: SkillDiscovery & Frontmatter Parser", () => {
  describe("parseSkillFrontmatter", () => {
    it("should parse YAML frontmatter name, description, and triggers from SKILL.md", () => {
      const content = `---
name: tdd
description: Test Driven Development workflow with red-green-refactor cycle
triggers:
  - tdd
  - unit-test
---

# TDD Instructions
Follow RED-GREEN-REFACTOR cycle strictly.`;

      const skill = parseSkillFrontmatter(
        content,
        "/path/to/.agents/skills/tdd/SKILL.md",
      );

      expect(skill).not.toBeNull();
      expect(skill?.id).toBe("tdd");
      expect(skill?.name).toBe("tdd");
      expect(skill?.description).toContain("Test Driven Development");
      expect(skill?.triggers).toEqual(["tdd", "unit-test"]);
      expect(skill?.filePath).toBe("/path/to/.agents/skills/tdd/SKILL.md");
    });

    it("should return fallback if no frontmatter but valid markdown exists", () => {
      const content = `# My Custom Skill\nThis is custom instructions.`;
      const skill = parseSkillFrontmatter(
        content,
        "/path/to/.skills/my-skill/SKILL.md",
      );

      expect(skill).not.toBeNull();
      expect(skill?.id).toBe("my-skill");
      expect(skill?.name).toBe("my-skill");
      expect(skill?.description).toBe("My Custom Skill");
    });
  });

  describe("SkillDiscovery.findSkills", () => {
    it("should scan workspace skill folders and return list of discovered skills", async () => {
      const mockWorkspace: IWorkspacePort = {
        fileExists: vi.fn().mockImplementation(async (p: string) => {
          return p.includes("SKILL.md");
        }),
        readFile: vi.fn().mockImplementation(async (p: string) => {
          if (p.includes("review")) {
            return "---\nname: review\ndescription: Comprehensive code review\n---\nReview instructions";
          }
          return "---\nname: tdd\ndescription: TDD workflow\n---\nRed green refactor";
        }),
        writeFile: vi.fn().mockResolvedValue(undefined),
        deleteFile: vi.fn().mockResolvedValue(undefined),
        executeCommand: vi
          .fn()
          .mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 }),
        listDirectory: vi.fn().mockImplementation(async (dir: string) => {
          if (dir.endsWith(".agents/skills")) {
            return ["tdd", "review"];
          }
          return [];
        }),
      };

      const discovery = new SkillDiscovery();
      const skills = await discovery.findSkills("/workspace", mockWorkspace);

      expect(skills.length).toBeGreaterThanOrEqual(2);
      expect(skills.some((s) => s.id === "tdd")).toBe(true);
      expect(skills.some((s) => s.id === "review")).toBe(true);
    });

    it("should return empty array when no workspace skills found", async () => {
      const emptyWorkspace: IWorkspacePort = {
        fileExists: vi.fn().mockResolvedValue(false),
        readFile: vi.fn().mockResolvedValue(""),
        writeFile: vi.fn().mockResolvedValue(undefined),
        deleteFile: vi.fn().mockResolvedValue(undefined),
        executeCommand: vi
          .fn()
          .mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 }),
        listDirectory: vi.fn().mockResolvedValue([]),
      };

      const discovery = new SkillDiscovery();
      const skills = await discovery.findSkills("/workspace", emptyWorkspace);

      expect(skills.length).toBe(0);
    });
  });
});
