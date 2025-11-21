
import { Project, RemoteConnection, User, AuditMetadata, ProjectInput, ConnectionInput } from '../types';
import { storage, DB_KEYS } from './storage.adapter';

export const getTimestamp = (): string => new Date().toISOString();

export class DataService {
  static async getProjects(): Promise<Project[]> {
    return await storage.read<Project[]>(DB_KEYS.PROJECTS, []);
  }

  static async saveProject(projectInput: ProjectInput, user: User): Promise<Project> {
    const projects = await this.getProjects();
    const idx = projects.findIndex(p => p.id === projectInput.id);
    
    // Intelligent Audit Merging
    // If editing: preserve original creator info. If new: set creator to current user.
    const currentTimestamp = getTimestamp();
    const audit: AuditMetadata = {
      createdBy: idx !== -1 ? projects[idx].createdBy : user.nickname,
      createdById: idx !== -1 ? projects[idx].createdById : user.id,
      createdAt: idx !== -1 ? projects[idx].createdAt : currentTimestamp,
      updatedBy: user.nickname,
      updatedById: user.id,
      updatedAt: currentTimestamp
    };

    const fullProject: Project = { ...projectInput, ...audit };

    if (idx === -1) {
      projects.push(fullProject);
    } else {
      projects[idx] = fullProject;
    }
    await storage.write(DB_KEYS.PROJECTS, projects);
    return fullProject;
  }

  static async deleteProject(id: string): Promise<void> {
    // 1. Delete the project
    const projects = await this.getProjects();
    const newProjects = projects.filter(p => p.id !== id);
    await storage.write(DB_KEYS.PROJECTS, newProjects);

    // 2. Cascade delete: Remove all connections associated with this project
    // This prevents orphan connections in the system
    const conns = await this.getConnections();
    const newConns = conns.filter(c => c.projectId !== id);
    await storage.write(DB_KEYS.CONNECTIONS, newConns);
  }

  static async getConnections(): Promise<RemoteConnection[]> {
    return await storage.read<RemoteConnection[]>(DB_KEYS.CONNECTIONS, []);
  }

  static async saveConnection(connInput: ConnectionInput, user: User): Promise<RemoteConnection> {
    const conns = await this.getConnections();
    const idx = conns.findIndex(c => c.id === connInput.id);

    const currentTimestamp = getTimestamp();
    const audit: AuditMetadata = {
      createdBy: idx !== -1 ? conns[idx].createdBy : user.nickname,
      createdById: idx !== -1 ? conns[idx].createdById : user.id,
      createdAt: idx !== -1 ? conns[idx].createdAt : currentTimestamp,
      updatedBy: user.nickname,
      updatedById: user.id,
      updatedAt: currentTimestamp
    };

    const fullConn: RemoteConnection = { ...connInput, ...audit };

    if (idx === -1) {
      conns.push(fullConn);
    } else {
      conns[idx] = fullConn;
    }
    await storage.write(DB_KEYS.CONNECTIONS, conns);
    return fullConn;
  }

  static async deleteConnection(id: string): Promise<void> {
    const conns = await this.getConnections();
    
    // 1. Remove the target connection
    const remainingConns = conns.filter(c => c.id !== id);

    // 2. Cleanup References (Set Null on Delete)
    // If any other connection required this VPN (id), clear that requirement
    // to prevent dead links/zombie references.
    const cleanConns = remainingConns.map(c => {
      if (c.requiredVpnId === id) {
        // Create a new object without the requiredVpnId field (or set to undefined)
        const { requiredVpnId, ...rest } = c;
        return { ...rest, requiredVpnId: undefined };
      }
      return c;
    });

    await storage.write(DB_KEYS.CONNECTIONS, cleanConns);
  }
}
