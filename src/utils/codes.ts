export const codes = {
  // Seed messages
  S0001: seed => `Seed "${seed}" is invalid.`,
  S0002: seed => `Seed "${seed}" is invalid. Please rollback to previous seed.`,
  S0003: seed => `Seed "${seed}" seeded successfully before.`,
  S0004: table => `Seeding table "${table}"...`,

  // Common messages
  S0005: "Contact the developer of this package to implement support for prisma types.",
  S0009:
    "Multiple relations for same model aren't supported yet. Please contact the developer and introduce your use case for testing feature.",

  // Field messages
  S0013: type => `Unsupported field type: ${type}`,
  S0014: (field, seed, possiblePaths) =>
    `Missing field "${field}" inside seed "${seed}". Please fill it or make optional in schema. Possible inside one of that paths: \n${possiblePaths
      .split("\n")
      .map(path => `  - ${path}`)
      .join("\n")}`
} satisfies Record<string, string | ((...data: string[]) => string)>;
