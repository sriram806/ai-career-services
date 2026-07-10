/**
 * Common utility types used across the platform.
 */

/** Generic entity with timestamps */
export interface BaseEntity {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Soft-deletable entity */
export interface SoftDeletableEntity extends BaseEntity {
  readonly deletedAt?: string;
  readonly isDeleted: boolean;
}

/** Sort direction */
export type SortOrder = 'asc' | 'desc';

/** Key-value metadata */
export type Metadata = Record<string, string | number | boolean>;

/** Nullable type helper */
export type Nullable<T> = T | null;

/** Deep partial type helper */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Environment names */
export type Environment = 'development' | 'staging' | 'production' | 'testing';
