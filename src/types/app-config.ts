export interface AppConfig {
  output: string;
  seedsDir: string;
  migrationsDir: string;
  publishable: boolean;
  schemaFile: string;
  uniqueFields: Record<string, string[] | void>;
  relationalFields: Record<string, string>;
  relationalModels: Record<string, string[]>;
  prettyNames: Record<string, string>;
  primaryKeys: Record<string, string>;
}
