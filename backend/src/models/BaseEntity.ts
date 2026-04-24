import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity()
export abstract class BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: '36' })
  id!: string;

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date;

  @DeleteDateColumn({
    type: 'timestamp',
    nullable: true,
  })
  deletedAt?: Date;

  // Additional audit fields
  @Column({ type: 'varchar', length: '36', nullable: true })
  createdBy?: string;

  @Column({ type: 'varchar', length: '36', nullable: true })
  updatedBy?: string;

  @Column({ type: 'varchar', length: '36', nullable: true })
  deletedBy?: string;

  @Column({ length: 45, nullable: true })
  createdIp?: string;

  @Column({ length: 45, nullable: true })
  updatedIp?: string;

  @Column({ length: 45, nullable: true })
  deletedIp?: string;

  @Column({ length: 1000, nullable: true })
  version?: string; // Versioning for optimistic locking

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  // Helper methods
  public toJSON(): Partial<this> {
    const { deletedAt, ...result } = this;
    return result as Partial<this>;
  }

  // Soft delete helper
  public softDelete(deletedBy?: string, deletedIp?: string): Date {
    this.deletedAt = new Date();
    if (deletedBy) this.deletedBy = deletedBy;
    if (deletedIp) this.deletedIp = deletedIp;
    return this.deletedAt;
  }

  // Restore helper
  public restore(): void {
    this.deletedAt = undefined;
    this.deletedBy = undefined;
    this.deletedIp = undefined;
  }

  // Check if entity is soft deleted
  public isDeleted(): boolean {
    return this.deletedAt !== undefined;
  }

  // Version management
  public incrementVersion(): string {
    const currentVersion = parseInt(this.version || '0');
    const newVersion = (currentVersion + 1).toString();
    this.version = newVersion;
    return newVersion;
  }

  public getVersion(): number {
    return parseInt(this.version || '0');
  }

  // Metadata management
  public setMetadata(key: string, value: any): void {
    if (!this.metadata) this.metadata = {};
    this.metadata[key] = value;
  }

  public getMetadata(key: string): any {
    return this.metadata?.[key];
  }

  public hasMetadata(key: string): boolean {
    return this.metadata?.hasOwnProperty(key) || false;
  }

  public removeMetadata(key: string): void {
    if (this.metadata?.hasOwnProperty(key)) {
      delete this.metadata[key];
    }
  }

  public clearMetadata(): void {
    this.metadata = undefined;
  }

  // Audit helper methods
  public setCreatedBy(userId: string, ip?: string): void {
    this.createdBy = userId;
    if (ip) this.createdIp = ip;
  }

  public setUpdatedBy(userId: string, ip?: string): void {
    this.updatedBy = userId;
    if (ip) this.updatedIp = ip;
  }

  public setDeletedBy(userId: string, ip?: string): void {
    this.deletedBy = userId;
    if (ip) this.deletedIp = ip;
  }

  // Check if entity was created by a specific user
  public isCreatedBy(userId: string): boolean {
    return this.createdBy === userId;
  }

  // Check if entity can be modified by user (simplified version)
  public canBeModifiedBy(userId: string): boolean {
    return this.createdBy === userId || this.updatedBy === userId;
  }

  // Get entity age in days
  public getAgeInDays(): number {
    return Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Get time since last update in days
  public getDaysSinceLastUpdate(): number {
    return Math.floor((Date.now() - this.updatedAt.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Check if entity is recent (created within last 30 days)
  public isRecent(): boolean {
    return this.getAgeInDays() <= 30;
  }

  // Check if entity is stale (not updated in last 90 days)
  public isStale(): boolean {
    return this.getDaysSinceLastUpdate() > 90;
  }
}