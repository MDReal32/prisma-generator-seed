export const serialize = (obj: any) => {
  if (Array.isArray(obj)) {
    return JSON.stringify(obj.map(i => serialize(i)));
  } else if (typeof obj === "object" && obj !== null) {
    return Object.keys(obj)
      .sort()
      .map(k => `${k}:${serialize(obj[k])}`)
      .join("|");
  }

  return obj;
};
