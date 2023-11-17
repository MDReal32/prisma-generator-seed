export const codes = {
  // Seed messages
  S0001: seed => `Seed "${seed}" is invalid.`,
  S0002: seed => `Seed "${seed}" is invalid. Please rollback to previous seed.`,
  S0003: seed => `Seed "${seed}" seeded successfully before.`,

  // Common messages
  S0005: "Contact the developer of this package to implement support for prisma types.",
  S0009:
    "Multiple relations for same model aren't supported yet. Please contact the developer and introduce your use case for testing feature.",

  // Field messages
  S0013: type => `Unsupported field type: ${type}`
} satisfies Record<string, string | ((data: string) => string)>;
