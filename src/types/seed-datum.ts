export interface SeedDatum<TData = unknown> {
  table: string;
  data: TData;
  paths: string[];
}
