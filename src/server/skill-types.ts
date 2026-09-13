export interface SkillData {
  name: string;
}

export interface SkillRecord {
  id: number;
  commandName: string;
  createdAt: number;
  updatedAt: number;
  data: SkillData;
}

export interface SkillCommand {
  id: number;
  commandName: string;
  name: string;
}

export interface SkillToolRecord {
  id: number;
  skillId: number;
  toolName: string;
  createdAt: number;
  updatedAt: number;
}

export interface Skill {
  id: number;
  commandName: string;
  name: string;
  markdown: string;
  requiredTools: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SkillInput {
  commandName: string;
  name: string;
  markdown: string;
  requiredTools: string[];
}
