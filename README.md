# Prisma Seed Generator

Generate seed data for Prisma using json data type.

# Usage

Add generator to ur prisma file
```prisma
generator seed {
  provider = "prisma-seed-generator"
}
```

Then create a file called `seed.json` in the root of your project.
```json
{
  "$schema": "relative/path/to/node_modules/.prisma/seed/schema.json",
  "<autocompleted-model-name>": {
    "data": [],
    "upsertBy": []
  }
}
```

`data` and `upsertBy` fields are autocompleted by your IDE after generating the schema. `data` is a list of seed data. `upsertBy` is unique fields from your model that will be used to check availability of the data. If the data is already in the database, it will be updated instead of created.

And add this script to package.json
```json
{
  "prisma": {
    "seed": "prisma-seeder"
  }
}
```

Then run `prisma migrate dev` and it will apply the seed data to your database.

# How it works
Generator generates a `schema.json` file inside `<root>/node_modules/.prisma/seed/schema.json` and it will be used by ide and the generator itself to validate/autocomplete a seed file for corresponding model.
