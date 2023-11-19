import { inspect } from "node:util";

export class Inspector {
  static inspect(...data: any[]) {
    console.log(
      ...data.map(datum =>
        typeof datum === "object" ? inspect(datum, { depth: Infinity, colors: true }) : datum
      )
    );
  }
}
