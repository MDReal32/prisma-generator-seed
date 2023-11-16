export interface Seed {
  id: string;
  checksum: string;
  started_at: Date;
  finished_at: Date;
  logs: string;
  migration_name: string;
  rolled_back_at: Date;
  applied_steps_count: number;
}
