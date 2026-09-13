import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface ProjectRootStore {
  getProjectRoot(userId: number, projectId: number): string;
  getCanonicalProjectRoot(userId: number, projectId: number): string;
  createRoot(userId: number, projectId: number): void;
  deleteRoot(userId: number, projectId: number): void;
}

function requireId(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label}`);
  }
}

export class FileProjectRootStore implements ProjectRootStore {
  private readonly projectsRoot: string;

  constructor(projectsRoot: string) {
    this.projectsRoot = resolve(projectsRoot);
  }

  getProjectRoot(userId: number, projectId: number): string {
    requireId(userId, 'user id');
    requireId(projectId, 'project id');
    const relativeRoot = join(`user-${userId}`, `project-${projectId}`);
    const projectRoot = resolve(this.projectsRoot, relativeRoot);
    const fromProjectsRoot = relative(this.projectsRoot, projectRoot);
    if (fromProjectsRoot !== relativeRoot || isAbsolute(fromProjectsRoot)) {
      throw new Error('Invalid project root boundary');
    }
    return projectRoot;
  }

  getCanonicalProjectRoot(userId: number, projectId: number): string {
    const projectRoot = this.getProjectRoot(userId, projectId);
    const userRoot = resolve(this.projectsRoot, `user-${userId}`);
    if (
      !existsSync(projectRoot) ||
      lstatSync(userRoot).isSymbolicLink() ||
      lstatSync(projectRoot).isSymbolicLink()
    ) {
      throw new Error('Invalid project root');
    }
    const canonicalProjectsRoot = realpathSync(this.projectsRoot);
    const canonicalUserRoot = realpathSync(userRoot);
    const canonicalProjectRoot = realpathSync(projectRoot);
    this.requireDescendant(canonicalProjectsRoot, canonicalUserRoot);
    this.requireDescendant(canonicalUserRoot, canonicalProjectRoot);
    return canonicalProjectRoot;
  }

  createRoot(userId: number, projectId: number): void {
    const projectRoot = this.getProjectRoot(userId, projectId);
    const userRoot = resolve(this.projectsRoot, `user-${userId}`);
    mkdirSync(this.projectsRoot, { recursive: true });
    if (existsSync(userRoot) && lstatSync(userRoot).isSymbolicLink()) {
      throw new Error('Invalid project user root');
    }
    mkdirSync(userRoot, { recursive: true });
    mkdirSync(projectRoot);
  }

  deleteRoot(userId: number, projectId: number): void {
    const expectedRoot = this.getProjectRoot(userId, projectId);
    const userRoot = resolve(this.projectsRoot, `user-${userId}`);
    if (existsSync(userRoot) && lstatSync(userRoot).isSymbolicLink()) {
      throw new Error('Invalid project user root');
    }
    if (!existsSync(expectedRoot)) {
      return;
    }
    if (lstatSync(expectedRoot).isSymbolicLink()) {
      throw new Error('Invalid project root');
    }
    rmSync(expectedRoot, { recursive: true });
  }

  private requireDescendant(parent: string, child: string): void {
    const fromParent = relative(parent, child);
    if (
      !fromParent ||
      fromParent === '..' ||
      fromParent.startsWith(`..${sep}`) ||
      isAbsolute(fromParent)
    ) {
      throw new Error('Invalid project root boundary');
    }
  }
}
