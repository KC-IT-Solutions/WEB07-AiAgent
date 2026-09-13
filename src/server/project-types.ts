export interface ProjectData {
  name: string;
  description: string;
}

export interface ProjectRecord {
  id: number;
  userId: number;
  createdAt: number;
  updatedAt: number;
  data: ProjectData;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectInput {
  name: string;
  description: string;
}

export interface ProjectUpdateInput {
  name?: string;
  description?: string;
}
